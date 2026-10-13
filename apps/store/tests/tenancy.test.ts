import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createCipheriv, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { GateClient, GateUnavailableError } from "@/lib/tenancy/gate-client";
import { createSessionToken, requestTenantId, verifySessionToken } from "@/lib/auth";
import { TENANT_HEADER } from "@/lib/tenancy/config";

const KEY = Buffer.alloc(32, 9).toString("base64");
process.env.SECRETS_KEY = KEY;
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret";

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(KEY, "base64"), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

const okBody = (id = "t1", url = "postgres://u:p@h/db") => ({
  found: true, allowed: true, tenantId: id, name: "Shop", planId: "growth", features: ["pos"], maxStaff: 2, maxWarehouses: 2,
  dbUrlEncrypted: encrypt(url),
});
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function client(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  let t = 1_000_000;
  const calls: string[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    calls.push(u);
    return handler(u, init);
  }) as unknown as typeof fetch;
  const c = new GateClient({ platformUrl: "http://platform/", secret: "s", fetchImpl, now: () => t });
  return { c, calls, advance: (ms: number) => (t += ms) };
}

describe("gate client", () => {
  test("sends the secret, decrypts the db url and caches for the ttl", async () => {
    let seen: Headers | undefined;
    const { c, calls, advance } = client((_u, init) => { seen = new Headers(init?.headers); return json(okBody("t1", "postgres://u:pw@h/shop_a")); });
    const r = await c.resolve("Shop-A.axiom.appbrainer.tech:443");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") { expect(r.dbUrl).toBe("postgres://u:pw@h/shop_a"); expect(r.tenantId).toBe("t1"); }
    expect(seen?.get("x-gate-secret")).toBe("s");
    expect(calls[0]).toBe("http://platform/api/gate?host=shop-a.axiom.appbrainer.tech");
    await c.resolve("shop-a.axiom.appbrainer.tech");
    expect(calls.length).toBe(1);
    advance(31_000);
    await c.resolve("shop-a.axiom.appbrainer.tech");
    expect(calls.length).toBe(2);
  });

  test("revocation cut-off from the platform is parsed to epoch seconds", async () => {
    const at = new Date("2026-10-13T06:00:00Z");
    const { c } = client(() => json({ ...okBody(), sessionsValidAfter: at.toISOString() }));
    const r = await c.resolve("a.x.y");
    expect(r.kind === "ok" && r.sessionsValidAfter).toBe(Math.floor(at.getTime() / 1000));
    const none = await client(() => json({ ...okBody(), sessionsValidAfter: null })).c.resolve("a.x.y");
    expect(none.kind === "ok" && none.sessionsValidAfter).toBe(0);
  });

  test("concurrent lookups share one request", async () => {
    const { c, calls } = client(async () => { await new Promise((r) => setTimeout(r, 20)); return json(okBody()); });
    await Promise.all(Array.from({ length: 10 }, () => c.resolve("a.x.y")));
    expect(calls.length).toBe(1);
  });

  test("blocked and unknown answers use the short ttl and carry the reason", async () => {
    let body: unknown = { found: true, allowed: false, reason: "trial_expired", name: "S" };
    const { c, calls, advance } = client(() => json(body));
    expect(await c.resolve("a.x.y")).toEqual({ kind: "blocked", reason: "trial_expired", name: "S" });
    await c.resolve("a.x.y");
    expect(calls.length).toBe(1);
    advance(11_000);
    body = { found: false, allowed: false, reason: "unknown_shop" };
    expect((await c.resolve("a.x.y")).kind).toBe("unknown");
    expect(calls.length).toBe(2);
  });

  test("a shop that was allowed keeps working for a while if the platform is down, then fails closed", async () => {
    let down = false;
    const { c, advance } = client(() => (down ? json({}, 500) : json(okBody())));
    await c.resolve("a.x.y");
    down = true;
    advance(60_000);
    expect((await c.resolve("a.x.y")).kind).toBe("ok");
    advance(16 * 60_000);
    await expect(c.resolve("a.x.y")).rejects.toBeInstanceOf(GateUnavailableError);
  });

  test("blocked shops are never served stale; unknown state fails closed", async () => {
    let down = false;
    const { c, advance } = client(() => (down ? Promise.reject(new Error("net")) : json({ found: true, allowed: false, reason: "suspended" })));
    await c.resolve("a.x.y");
    down = true;
    advance(20_000);
    await expect(c.resolve("a.x.y")).rejects.toBeInstanceOf(GateUnavailableError);
    await expect(client(() => Promise.reject(new Error("net"))).c.resolve("n.x.y")).rejects.toBeInstanceOf(GateUnavailableError);
  });

  test("incomplete or undecryptable allowed answers are rejected", async () => {
    await expect(client(() => json({ found: true, allowed: true, tenantId: "t" })).c.resolve("a.x.y")).rejects.toBeInstanceOf(GateUnavailableError);
    await expect(client(() => json({ ...okBody(), dbUrlEncrypted: "v1.aaaa.bbbb.cccc" })).c.resolve("a.x.y")).rejects.toBeInstanceOf(GateUnavailableError);
  });
});

describe("per-shop sessions", () => {
  test("token verifies only for the shop that issued it", () => {
    const tok = createSessionToken("user-1", "shop-a");
    expect(verifySessionToken(tok, "shop-a")).toBe("user-1");
    expect(verifySessionToken(tok, "shop-b")).toBeNull();
    expect(verifySessionToken(tok, null)).toBeNull();
  });
  test("sessions issued before the revocation cut-off are rejected", () => {
    const tok = createSessionToken("user-1", "shop-a");
    const now = Math.floor(Date.now() / 1000);
    expect(verifySessionToken(tok, "shop-a", 0)).toBe("user-1");
    expect(verifySessionToken(tok, "shop-a", now - 60)).toBe("user-1");
    expect(verifySessionToken(tok, "shop-a", now + 60)).toBeNull();
  });
  test("tampering and expiry are rejected", () => {
    const tok = createSessionToken("user-1", "shop-a");
    const [v, , exp, sig] = tok.split(".");
    expect(verifySessionToken(`${v}.user-2.${exp}.${sig}`, "shop-a")).toBeNull();
    const old = `v1.user-1.${Math.floor(Date.now() / 1000) - 10}`;
    expect(verifySessionToken(`${old}.${tok.split(".")[3]}`, "shop-a")).toBeNull();
  });
  test("tenant comes from the proxy header only in multi mode", () => {
    const h = new Headers({ [TENANT_HEADER]: "shop-a" });
    delete process.env.TENANCY_MODE;
    expect(requestTenantId(new Headers())).toBe("single");
    process.env.TENANCY_MODE = "multi";
    expect(requestTenantId(h)).toBe("shop-a");
    expect(requestTenantId(new Headers())).toBeNull();
    delete process.env.TENANCY_MODE;
  });
});

// ── database routing against two real databases ───────────────────────────────
const ADMIN = process.env.TEST_PG_ADMIN_URL; // e.g. postgres://pgt@localhost:54330/postgres
const maybe = ADMIN ? describe : describe.skip;

maybe("database routing", () => {
  const als = new AsyncLocalStorage<string>();
  const as = <T,>(h: string, fn: () => Promise<T>) => als.run(h, fn);
  let closeAllPools: () => Promise<void>;
  let db: typeof import("@/db").db;
  let ShopUnavailableError: typeof import("@/db").ShopUnavailableError;
  const gate: Record<string, unknown> = {};
  const realFetch = globalThis.fetch;

  const urlFor = (name: string) => { const u = new URL(ADMIN!); u.pathname = `/${name}`; return u.toString(); };

  beforeAll(async () => {
    const { default: pg } = await import("pg");
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    for (const n of ["shop_a", "shop_b"]) {
      await admin.query(`drop database if exists ${n}`);
      await admin.query(`create database ${n}`);
    }
    await admin.end();
    gate["a.axiom.test"] = okBody("ta", urlFor("shop_a"));
    gate["b.axiom.test"] = okBody("tb", urlFor("shop_b"));
    gate["off.axiom.test"] = { found: true, allowed: false, reason: "suspended" };
    process.env.TENANCY_MODE = "multi";
    process.env.PLATFORM_URL = "http://platform";
    process.env.GATE_SECRET = "s";
    mock.module("next/headers", () => ({ headers: async () => new Headers({ host: als.getStore() ?? "" }) }));
    globalThis.fetch = (async (u: string) => {
      const host = new URL(u).searchParams.get("host")!;
      return json(gate[host] ?? { found: false, allowed: false });
    }) as unknown as typeof fetch;
    const mod = await import("@/db");
    db = mod.db; closeAllPools = mod.closeAllPools; ShopUnavailableError = mod.ShopUnavailableError;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    delete process.env.TENANCY_MODE;
    await closeAllPools?.();
  });

  const current = async () => ((await db.execute("select current_database() as d" as never)).rows[0] as { d: string }).d;
  const count = async () => { const { sql } = await import("drizzle-orm"); return ((await db.execute(sql`select count(*)::int as n from t`)).rows[0] as { n: number }).n; };

  test("each request lands in the database of its own host", async () => {
    expect(await as("a.axiom.test", current)).toBe("shop_a");
    expect(await as("b.axiom.test", current)).toBe("shop_b");
    expect(await as("a.axiom.test", current)).toBe("shop_a");
  });

  test("transactions run on the right database and roll back", async () => {
    const { sql } = await import("drizzle-orm");
    for (const h of ["a.axiom.test", "b.axiom.test"]) await as(h, async () => { await db.execute(sql`create table if not exists t (v int)`); });
    await as("a.axiom.test", async () => {
      await db.transaction(async (tx) => { await tx.execute(sql`insert into t values (1)`); });
      await expect(db.transaction(async (tx) => { await tx.execute(sql`insert into t values (2)`); throw new Error("boom"); })).rejects.toThrow("boom");
      expect(await count()).toBe(1);
    });
    expect(await as("b.axiom.test", count)).toBe(0);
  });

  test("concurrent requests for different shops never cross", async () => {
    const out = await Promise.all(Array.from({ length: 40 }, (_, i) => {
      const h = i % 2 ? "a.axiom.test" : "b.axiom.test";
      return as(h, async () => ({ h, d: await current() }));
    }));
    for (const o of out) expect(o.d).toBe(o.h.startsWith("a") ? "shop_a" : "shop_b");
  });

  test("blocked and unknown hosts never reach a database", async () => {
    for (const h of ["off.axiom.test", "nobody.axiom.test", ""]) {
      const err = await as(h, current).catch((e) => e);
      const root = err?.cause ?? err;
      expect(root).toBeInstanceOf(ShopUnavailableError);
    }
  });
});
