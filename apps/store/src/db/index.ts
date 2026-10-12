import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { headers } from "next/headers";
import * as schema from "./schema";
import { SINGLE_TENANT_ID, tenancyMode } from "@/lib/tenancy/config";
import { gateClient } from "@/lib/tenancy/gate-client";

/** Thrown when the request's shop may not use the app (unknown, suspended, expired). */
export class ShopUnavailableError extends Error {
  constructor(public reason: string) {
    super(`Shop unavailable: ${reason}`);
    this.name = "ShopUnavailableError";
  }
}

const MAX_TENANT_POOLS = 20;
const POOL_MAX = Number(process.env.DB_POOL_MAX || 5);

/** pg does not understand Neon's channel_binding parameter. */
export function cleanConnectionUrl(raw: string): string {
  const u = new URL(raw);
  u.searchParams.delete("channel_binding");
  return u.toString();
}

function makePool(url: string): Pool {
  const cfg: PoolConfig = {
    connectionString: cleanConnectionUrl(url),
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
  const pool = new Pool(cfg);
  // An idle client dropping must not crash the process.
  pool.on("error", () => {});
  return pool;
}

interface Cached {
  url: string;
  pool: Pool;
}
const pools = new Map<string, Cached>(); // insertion order = LRU order
let singlePool: Pool | null = null;

function poolFor(tenantId: string, url: string): Pool {
  const hit = pools.get(tenantId);
  if (hit && hit.url === url) {
    pools.delete(tenantId);
    pools.set(tenantId, hit);
    return hit.pool;
  }
  if (hit) retire(hit.pool); // connection string rotated
  const pool = makePool(url);
  pools.set(tenantId, { url, pool });
  while (pools.size > MAX_TENANT_POOLS) {
    const oldest = pools.keys().next().value as string;
    retire(pools.get(oldest)!.pool);
    pools.delete(oldest);
  }
  return pool;
}

/** End a pool once in-flight work has had time to finish. */
function retire(pool: Pool) {
  setTimeout(() => void pool.end().catch(() => {}), 30_000).unref?.();
}

async function currentPool(): Promise<Pool> {
  if (tenancyMode() === "single") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    return (singlePool ??= makePool(url));
  }
  const host = (await headers()).get("host");
  if (!host) throw new ShopUnavailableError("unknown_shop");
  const shop = await gateClient().resolve(host); // may throw GateUnavailableError
  if (shop.kind === "unknown") throw new ShopUnavailableError("unknown_shop");
  if (shop.kind === "blocked") throw new ShopUnavailableError(shop.reason);
  return poolFor(shop.tenantId, shop.dbUrl);
}

/**
 * Looks like a pg Pool to drizzle, but picks the real pool per request from the shop's host.
 * query() covers plain statements; connect() covers transactions (drizzle checks out a client).
 * Resolution is lazy, so importing this module at build time needs no environment.
 */
class TenantPool extends Pool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(...args: any[]): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return currentPool().then((p) => (p.query as any)(...args));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect(cb?: any): any {
    const out = currentPool().then((p) => p.connect());
    if (typeof cb === "function") {
      out.then((c) => cb(undefined, c, () => c.release()), (e) => cb(e));
      return undefined;
    }
    return out;
  }
  end(): Promise<void> {
    return Promise.resolve();
  }
}

const router = new TenantPool();
router.on("error", () => {});

export const db = drizzle(router, { schema });
/** Kept for call sites that need transactions; pg pools support them on the same client. */
export const txDb = db;

export { SINGLE_TENANT_ID };

/** Test helper: close every open pool. */
export async function closeAllPools() {
  await Promise.all([...pools.values()].map((c) => c.pool.end().catch(() => {})));
  pools.clear();
  if (singlePool) await singlePool.end().catch(() => {});
  singlePool = null;
}
