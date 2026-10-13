import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { createCipheriv, randomBytes } from "node:crypto";
import { atLimit, featureForPath, planAllows, UNLIMITED } from "@/lib/tenancy/entitlements";

describe("entitlement helpers", () => {
  test("paths map to the plan feature that guards them; core flows are open", () => {
    expect(featureForPath("/api/dashboard/expenses/petty-cash")).toBe("expenses");
    expect(featureForPath("/dashboard/hr/payroll")).toBe("hr");
    expect(featureForPath("/api/dashboard/procurement/units")).toBe("purchases");
    expect(featureForPath("/api/inventory/transfers")).toBe("transfers");
    for (const open of ["/api/dashboard/products", "/api/dashboard/inventory", "/dashboard/pos", "/api/sales/commit", "/api/dashboard/stock/receive", "/api/dashboard/orders", "/api/dashboard/locations", "/api/dashboard/staff"]) {
      expect(featureForPath(open)).toBeNull();
    }
  });
  test("limits", () => {
    expect(atLimit(1, 1)).toBe(true);
    expect(atLimit(0, 1)).toBe(false);
    expect(atLimit(999, null)).toBe(false);
    expect(planAllows(UNLIMITED, "payroll")).toBe(true);
    expect(planAllows({ features: new Set(["pos"]), maxStaff: 1, maxWarehouses: 1 }, "payroll")).toBe(false);
  });
});

const ADMIN = process.env.TEST_PG_ADMIN_URL;
(ADMIN ? describe : describe.skip)("plan limits against a shop database", () => {
  const KEY = Buffer.alloc(32, 5).toString("base64");
  const als = new AsyncLocalStorage<string>();
  let plan = { features: ["pos"], maxStaff: 1 as number | null, maxWarehouses: 1 as number | null };
  let db: typeof import("@/db").db;
  let limits: typeof import("@/lib/plan-limits");
  let close: () => Promise<void>;
  const realFetch = globalThis.fetch;

  const enc = (plain: string) => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", Buffer.from(KEY, "base64"), iv);
    const e = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${e.toString("base64url")}`;
  };

  beforeAll(async () => {
    process.env.SECRETS_KEY = KEY;
    process.env.TENANCY_MODE = "multi";
    process.env.PLATFORM_URL = "http://platform";
    process.env.GATE_SECRET = "s";
    process.env.GATE_CACHE_TTL_MS = "1";
    const { default: pg } = await import("pg");
    const admin = new pg.Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query("drop database if exists shop_lim");
    await admin.query("create database shop_lim");
    await admin.end();
    const url = new URL(ADMIN!); url.pathname = "/shop_lim";
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const mp = new pg.Pool({ connectionString: url.toString() });
    await migrate(drizzle(mp), { migrationsFolder: "src/db/migrations" });
    await mp.end();
    mock.module("next/headers", () => ({ headers: async () => new Headers({ host: als.getStore() ?? "" }) }));
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ found: true, allowed: true, tenantId: "tl", name: "L", planId: "x", ...plan, dbUrlEncrypted: enc(url.toString()) }), { status: 200 })) as unknown as typeof fetch;
    const m = await import("@/db");
    db = m.db; close = m.closeAllPools;
    limits = await import("@/lib/plan-limits");
  });
  afterAll(async () => { globalThis.fetch = realFetch; delete process.env.TENANCY_MODE; await close?.(); });

  const run = <T,>(fn: () => Promise<T>) => als.run("lim.axiom.test", fn);

  test("staff seats: owner not counted, limit blocks the next one, unlimited never blocks", async () => {
    const { staff } = await import("@/db/schema");
    (await import("@/lib/tenancy/gate-client")).gateClient().clear();
    await run(async () => {
      await db.insert(staff).values({ role: "owner", firstName: "O", isActive: true } as never);
      expect(await limits.checkStaffSeat()).toBeNull();
      await db.insert(staff).values({ role: "salesman", firstName: "A", isActive: true } as never);
      const denied = await limits.checkStaffSeat();
      expect(denied?.status).toBe(403);
      expect((await denied!.json()).code).toBe("plan_limit");
    });
    plan = { ...plan, maxStaff: null };
    (await import("@/lib/tenancy/gate-client")).gateClient().clear();
    await run(async () => expect(await limits.checkStaffSeat()).toBeNull());
  });

  test("warehouses: counts active ones only", async () => {
    const { locations } = await import("@/db/schema");
    (await import("@/lib/tenancy/gate-client")).gateClient().clear();
    await run(async () => {
      expect(await limits.checkWarehouseSlot()).toBeNull();
      await db.insert(locations).values({ name: "Main", code: "MAIN", isDefault: true, isActive: true } as never);
      expect((await limits.checkWarehouseSlot())?.status).toBe(403);
      await db.update(locations).set({ isActive: false });
      expect(await limits.checkWarehouseSlot()).toBeNull();
    });
  });
});
