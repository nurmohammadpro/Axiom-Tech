import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { tenantEvents, tenants } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getGate } from "@/lib/gate";
import { resetOwnerPassword } from "@/lib/owner";
import { provisionTenant } from "@/lib/provision";
import { seedShopDatabase } from "@/lib/shop-seed";
import { seedPlans } from "@/db/seed-data";
import { cancelTenant, createTenant } from "@/lib/tenants";
import { LocalPgProvider, adminUrlFromEnv } from "./helpers/local-provider";

process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ROOT_DOMAIN = "axiom.appbrainer.tech";

const T = 90_000;
const slugs: string[] = [];
const provider = new LocalPgProvider(adminUrlFromEnv());

const mk = async (slug: string, extra: Partial<{ ownerName: string; ownerEmail: string }> = {}) => {
  slugs.push(slug);
  return createTenant({ slug, name: `Shop ${slug}`, ownerName: extra.ownerName ?? "Nur Mohammad", ownerEmail: extra.ownerEmail ?? `Owner@${slug}.com`, ownerPhone: "01700000000", planId: "growth" }, null);
};

async function shopQuery<T>(slug: string, fn: (s: postgres.Sql) => Promise<T>): Promise<T> {
  const s = postgres(provider.shopUrl(slug), { max: 1 });
  try {
    return await fn(s);
  } finally {
    await s.end();
  }
}

beforeEach(async () => {
  provider.createCalls = 0;
  await db.execute(sql`truncate table tenant_events, invoices, payments, tenants, platform_users, plans restart identity cascade`);
  await seedPlans(db);
});

afterAll(async () => {
  for (const c of provider.created) await provider.dropShopDatabase(c.databaseName, c.roleName);
});

describe("provisioning pipeline (real Postgres, local stand-in for Neon)", () => {
  test("creates a working shop database with schema, defaults and owner", async () => {
    const t = await mk("prov1");
    const r = await provisionTenant(t.id, null, { provider });
    expect(r.shopUrl).toBe("https://prov1.axiom.appbrainer.tech");
    expect(r.ownerEmail).toBe("owner@prov1.com");
    expect(r.tempPassword).toMatch(/^[A-Za-z2-9]{14}$/);

    const [row] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(row.provisionStatus).toBe("ready");
    expect(row.provisionError).toBeNull();
    expect(row.neonDatabase).toBe("shop_prov1");
    expect(row.provisionedAt).not.toBeNull();
    expect(row.dbUrlEncrypted).not.toContain("shop_prov1");
    expect(decryptSecret(row.dbUrlEncrypted!)).toBe(provider.shopUrl("prov1"));

    await shopQuery("prov1", async (s) => {
      const [{ n }] = await s`select count(*)::int as n from information_schema.tables where table_schema = 'public'`;
      expect(n).toBeGreaterThanOrEqual(68);
      const [u] = await s`select email, role, first_name, last_name, phone, password_hash from users`;
      expect(u.role).toBe("owner");
      expect(u.email).toBe("owner@prov1.com");
      expect([u.first_name, u.last_name]).toEqual(["Nur", "Mohammad"]);
      expect(verifyPassword(r.tempPassword!, u.password_hash)).toBe(true);
      expect(verifyPassword("wrong", u.password_hash)).toBe(false);
      const [info] = await s`select value from store_settings where key = 'store_info'`;
      expect(info.value.name).toBe("Shop prov1");
      const locs = await s`select code, is_default from locations`;
      expect(locs.map((l) => ({ code: l.code, is_default: l.is_default }))).toEqual([{ code: "MAIN", is_default: true }]);
      const [{ n: sup }] = await s`select count(*)::int as n from supplier_types`;
      expect(sup).toBe(5);
      const [{ n: exp }] = await s`select count(*)::int as n from expense_categories`;
      expect(exp).toBe(26);
      const kids = await s`select c.slug from categories c join categories p on p.id = c.parent_id where p.slug = 'phones' order by c.slug`;
      expect(kids.map((k) => k.slug)).toEqual(["official-new", "pre-owned-phones", "unofficial-new"]);
      const [{ n: acc }] = await s`select count(*)::int as n from categories c join categories p on p.id = c.parent_id where p.slug = 'accessories'`;
      expect(acc).toBe(6);
    });

    const events = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, t.id));
    expect(events.map((e) => e.type)).toContain("provisioned");

    const gate = await getGate("prov1.axiom.appbrainer.tech");
    expect(gate.allowed).toBe(true);
    expect(gate.features).toContain("pos");
  }, T);

  test("a ready shop cannot be set up again and nothing is recreated", async () => {
    const t = await mk("prov2");
    await provisionTenant(t.id, null, { provider });
    await expect(provisionTenant(t.id, null, { provider })).rejects.toThrow("already set up");
    expect(provider.createCalls).toBe(1);
  }, T);

  test("concurrent clicks create exactly one database", async () => {
    const t = await mk("prov3");
    const results = await Promise.allSettled([provisionTenant(t.id, null, { provider }), provisionTenant(t.id, null, { provider })]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason.message)).toMatch(/already running|already set up/);
    expect(provider.createCalls).toBe(1);
  }, T);

  test("failure keeps the database, hides secrets, and retry resumes without recreating it", async () => {
    const t = await mk("prov4");
    await expect(provisionTenant(t.id, null, { provider, migrationsDir: "/nonexistent/migrations" })).rejects.toThrow("Setup failed at schema");
    const [failed] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(failed.provisionStatus).toBe("failed");
    expect(failed.provisionError).toStartWith("schema:");
    expect(failed.provisionError).not.toContain("postgres://");
    expect(failed.dbUrlEncrypted).not.toBeNull();
    expect(provider.createCalls).toBe(1);

    const r = await provisionTenant(t.id, null, { provider });
    expect(r.tempPassword).not.toBeNull();
    expect(provider.createCalls).toBe(1); // reused the existing database
    const [ok] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(ok.provisionStatus).toBe("ready");
    expect(ok.provisionError).toBeNull();
    const types = (await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, t.id))).map((e) => e.type);
    expect(types).toContain("provision_failed");
    expect(types).toContain("provisioned");
  }, T);

  test("a failing database provider leaves the shop retryable", async () => {
    const t = await mk("prov5");
    const broken = {
      createShopDatabase: async () => {
        throw new Error("Neon API POST /roles failed (401): bad key postgresql://u:leak@h/db");
      },
      dropShopDatabase: async () => {},
    };
    const err = await provisionTenant(t.id, null, { provider: broken }).catch((e) => e);
    expect(err.message).toContain("Setup failed at database");
    expect(err.message).not.toContain("leak");
    const [row] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(row.provisionStatus).toBe("failed");
    expect(row.dbUrlEncrypted).toBeNull();
    await provisionTenant(t.id, null, { provider });
    expect((await db.select().from(tenants).where(eq(tenants.id, t.id)))[0].provisionStatus).toBe("ready");
  }, T);

  test("stale 'provisioning' claims can be taken over, fresh ones cannot", async () => {
    const t = await mk("prov6");
    await db.update(tenants).set({ provisionStatus: "provisioning", updatedAt: new Date() }).where(eq(tenants.id, t.id));
    await expect(provisionTenant(t.id, null, { provider })).rejects.toThrow("already running");
    await db.update(tenants).set({ updatedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(tenants.id, t.id));
    await provisionTenant(t.id, null, { provider });
    expect((await db.select().from(tenants).where(eq(tenants.id, t.id)))[0].provisionStatus).toBe("ready");
  }, T);

  test("cancelled and unknown shops are refused", async () => {
    const t = await mk("prov7");
    await cancelTenant(t.id, "left", null);
    await expect(provisionTenant(t.id, null, { provider })).rejects.toThrow("Cancelled");
    await expect(provisionTenant("00000000-0000-0000-0000-000000000000", null, { provider })).rejects.toThrow("not found");
    expect(provider.createCalls).toBe(0);
  }, T);

  test("seeding is idempotent and never overwrites the existing owner", async () => {
    const t = await mk("prov8");
    await provisionTenant(t.id, null, { provider });
    const url = provider.shopUrl("prov8");
    const again = await seedShopDatabase(url, { shopName: "Renamed", ownerName: "Someone Else", ownerEmail: "owner@prov8.com", ownerPhone: null });
    expect(again.tempPassword).toBeNull();
    await shopQuery("prov8", async (s) => {
      const [{ n: users }] = await s`select count(*)::int as n from users`;
      const [{ n: cats }] = await s`select count(*)::int as n from categories`;
      const [{ n: exp }] = await s`select count(*)::int as n from expense_categories`;
      const [info] = await s`select value from store_settings where key = 'store_info'`;
      expect([users, cats, exp]).toEqual([1, 11, 26]);
      expect(info.value.name).toBe("Shop prov8"); // original branding kept
    });
  }, T);
});

describe("owner password reset", () => {
  test("replaces the owner password, logs without secrets, and survives an owner email change", async () => {
    const t = await mk("own1");
    const first = await provisionTenant(t.id, null, { provider });
    const url = provider.shopUrl("own1");

    // The owner changes their email inside the shop; the reset must still find them by role.
    await shopQuery("own1", async (s) => {
      await s`update users set email = 'new-owner@own1.com' where role = 'owner'`;
    });

    const r = await resetOwnerPassword(t.id, null);
    expect(r.ownerEmail).toBe("new-owner@own1.com");
    expect(r.tempPassword).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(r.tempPassword).not.toBe(first.tempPassword);

    // Existing sessions of this shop are revoked through the gate.
    const before = Date.now();
    process.env.ROOT_DOMAIN = "axiom.appbrainer.tech";
    const g = await getGate("own1.axiom.appbrainer.tech");
    expect(g.allowed).toBe(true);
    expect(new Date(g.sessionsValidAfter!).getTime()).toBeLessThanOrEqual(before);
    expect(new Date(g.sessionsValidAfter!).getTime()).toBeGreaterThan(before - 60_000);

    await shopQuery("own1", async (s) => {
      const [u] = await s`select password_hash from users where role = 'owner'`;
      expect(verifyPassword(r.tempPassword, u.password_hash)).toBe(true);
      expect(verifyPassword(first.tempPassword!, u.password_hash)).toBe(false);
      const [{ n }] = await s`select count(*)::int as n from users`;
      expect(n).toBe(1);
    });

    const events = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, t.id));
    const ev = events.find((e) => e.type === "owner_password_reset")!;
    expect(ev).toBeDefined();
    expect(JSON.stringify(ev.data)).not.toContain(r.tempPassword);
    expect(url).toContain("shop_own1");
  }, T);

  test("refuses shops that are not set up, cancelled, or unknown", async () => {
    const pending = await mk("own2");
    await expect(resetOwnerPassword(pending.id, null)).rejects.toThrow("not set up");
    const done = await mk("own3");
    await provisionTenant(done.id, null, { provider });
    await cancelTenant(done.id, "left", null);
    await expect(resetOwnerPassword(done.id, null)).rejects.toThrow("Cancelled");
    await expect(resetOwnerPassword("00000000-0000-0000-0000-000000000000", null)).rejects.toThrow("not found");
  }, T);

  test("simultaneous resets are serialised: exactly one password ends up valid", async () => {
    const t = await mk("own4");
    await provisionTenant(t.id, null, { provider });
    const [a, b] = await Promise.all([resetOwnerPassword(t.id, null), resetOwnerPassword(t.id, null)]);
    expect(a.tempPassword).not.toBe(b.tempPassword);
    await shopQuery("own4", async (s) => {
      const [u] = await s`select password_hash from users where role = 'owner'`;
      const valid = [a, b].filter((x) => verifyPassword(x.tempPassword, u.password_hash));
      expect(valid.length).toBe(1);
    });
    const events = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, t.id));
    expect(events.filter((e) => e.type === "owner_password_reset").length).toBe(2);
  }, T);

  test("a shop whose database has no owner reports a clear error and changes nothing", async () => {
    const t = await mk("own5");
    await provisionTenant(t.id, null, { provider });
    await shopQuery("own5", async (s) => {
      await s`update users set role = 'manager'`;
    });
    await expect(resetOwnerPassword(t.id, null)).rejects.toThrow("No owner account");
    const events = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, t.id));
    expect(events.some((e) => e.type === "owner_password_reset")).toBe(false);
  }, T);
});
