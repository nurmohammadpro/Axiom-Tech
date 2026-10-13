import { decryptSecret } from "./secret";

export interface ShopAccess {
  kind: "ok";
  tenantId: string;
  name: string;
  planId: string;
  features: string[];
  maxStaff: number | null;
  maxWarehouses: number | null;
  /** Decrypted pooled connection string. Never log or send to clients. */
  dbUrl: string;
}
export interface ShopBlocked {
  kind: "blocked";
  reason: string;
  name?: string;
}
export interface ShopUnknown {
  kind: "unknown";
}
export type ShopResolution = ShopAccess | ShopBlocked | ShopUnknown;

/** Platform unreachable and no usable cached answer. Callers answer 503. */
export class GateUnavailableError extends Error {
  constructor(message = "Access check is temporarily unavailable") {
    super(message);
    this.name = "GateUnavailableError";
  }
}

export interface GateClientOptions {
  platformUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Fresh window for an allowed shop. */
  ttlMs?: number;
  /** Fresh window for blocked/unknown answers (short so reactivation is quick). */
  negativeTtlMs?: number;
  /** How long an old allowed answer may be used when the platform is down. */
  staleMs?: number;
  timeoutMs?: number;
  maxEntries?: number;
}

interface Entry {
  value: ShopResolution;
  at: number;
}

/**
 * Asks the platform whether a host may be served and caches the answer.
 * Concurrent lookups for one host share one request. When the platform is down, an
 * allowed answer up to `staleMs` old keeps the shop running; blocked answers are never
 * extended and an unknown state fails closed (503).
 */
export class GateClient {
  private cache = new Map<string, Entry>();
  private inflight = new Map<string, Promise<ShopResolution>>();
  private o: Required<Omit<GateClientOptions, "fetchImpl" | "now">> & { fetchImpl: typeof fetch; now: () => number };

  constructor(opts: GateClientOptions) {
    this.o = {
      platformUrl: opts.platformUrl,
      secret: opts.secret,
      ttlMs: 30_000,
      negativeTtlMs: 10_000,
      staleMs: 15 * 60_000,
      timeoutMs: 4_000,
      maxEntries: 500,
      fetchImpl: opts.fetchImpl ?? ((i, init) => fetch(i, init)),
      now: opts.now ?? Date.now,
      ...stripUndefined({ ttlMs: opts.ttlMs, negativeTtlMs: opts.negativeTtlMs, staleMs: opts.staleMs, timeoutMs: opts.timeoutMs, maxEntries: opts.maxEntries }),
    };
  }

  async resolve(host: string): Promise<ShopResolution> {
    const key = host.toLowerCase().split(":")[0];
    const hit = this.cache.get(key);
    const now = this.o.now();
    if (hit) {
      const ttl = hit.value.kind === "ok" ? this.o.ttlMs : this.o.negativeTtlMs;
      if (now - hit.at < ttl) return hit.value;
    }
    let p = this.inflight.get(key);
    if (!p) {
      p = this.fetchFresh(key).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    try {
      return await p;
    } catch (e) {
      if (hit && hit.value.kind === "ok" && now - hit.at < this.o.staleMs) return hit.value;
      throw e instanceof GateUnavailableError ? e : new GateUnavailableError();
    }
  }

  private async fetchFresh(host: string): Promise<ShopResolution> {
    const url = `${this.o.platformUrl.replace(/\/+$/, "")}/api/gate?host=${encodeURIComponent(host)}`;
    let res: Response;
    try {
      res = await this.o.fetchImpl(url, {
        headers: { "x-gate-secret": this.o.secret },
        cache: "no-store",
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
    } catch {
      throw new GateUnavailableError();
    }
    if (!res.ok) throw new GateUnavailableError(`Access check failed (${res.status})`);
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new GateUnavailableError();
    }
    const value = parseGate(body);
    this.cache.set(host, { value, at: this.o.now() });
    if (this.cache.size > this.o.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return value;
  }

  clear() {
    this.cache.clear();
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function parseGate(b: Record<string, unknown>): ShopResolution {
  if (!b.found) return { kind: "unknown" };
  if (!b.allowed) return { kind: "blocked", reason: String(b.reason ?? "suspended"), name: typeof b.name === "string" ? b.name : undefined };
  if (typeof b.tenantId !== "string" || typeof b.dbUrlEncrypted !== "string") {
    throw new GateUnavailableError("Access check returned an incomplete answer");
  }
  let dbUrl: string;
  try {
    dbUrl = decryptSecret(b.dbUrlEncrypted);
  } catch {
    throw new GateUnavailableError("Shop database settings could not be read");
  }
  return {
    kind: "ok",
    tenantId: b.tenantId,
    name: String(b.name ?? ""),
    planId: String(b.planId ?? ""),
    features: Array.isArray(b.features) ? (b.features as string[]) : [],
    maxStaff: typeof b.maxStaff === "number" ? b.maxStaff : null,
    maxWarehouses: typeof b.maxWarehouses === "number" ? b.maxWarehouses : null,
    dbUrl,
  };
}

let shared: GateClient | null = null;
export function gateClient(): GateClient {
  if (!shared) {
    const platformUrl = process.env.PLATFORM_URL;
    const secret = process.env.GATE_SECRET;
    if (!platformUrl || !secret) throw new Error("PLATFORM_URL and GATE_SECRET are required in multi-tenant mode");
    shared = new GateClient({
      platformUrl,
      secret,
      ttlMs: process.env.GATE_CACHE_TTL_MS ? Number(process.env.GATE_CACHE_TTL_MS) : undefined,
    });
  }
  return shared;
}
