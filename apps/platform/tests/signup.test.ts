import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { seedPlans } from "@/db/seed-data";
import { verifyPassword } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { getGate } from "@/lib/gate";
import { normalizePhone, selfSignup, type SignupInput } from "@/lib/signup";
import { LocalPgProvider, adminUrlFromEnv } from "./helpers/local-provider";

process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ROOT_DOMAIN = "axiom.appbrainer.tech";
const T = 90_000;
const provider = new LocalPgProvider(adminUrlFromEnv());

const input = (slug: string, extra: Partial<SignupInput> = {}): SignupInput => ({
  shopName: `Shop ${slug}`, slug, ownerName: "Rahim Uddin", email: `${slug}@example.com`, phone: "01712345678", password: "correct-horse-battery", planId: "starter", ...extra,
});

beforeEach(async () => {
  delete process.env.SIGNUP_DAILY_CAP;
  await db.execute(sql`truncate table tenant_events, invoices, payments, tenants, platform_users, plans restart identity cascade`);
  await seedPlans(db);
});
afterAll(async () => {
  for (const c of provider.created) await provider.dropShopDatabase(c.databaseName, c.roleName);
});

describe("self signup", () => {
  test("phone numbers are normalized and junk is rejected", () => {
    expect(normalizePhone("+880 1712-345678")).toBe("01712345678");
    expect(normalizePhone("8801712345678")).toBe("01712345678");
    for (const bad of ["12345", "01212345678", "abcdefghijk", ""]) expect(() => normalizePhone(bad)).toThrow(DomainError);
  });

  test("creates a trial shop, provisions it, and the owner signs in with their own password", async () => {
    const r = await selfSignup(input("sig1"), { provider });
    expect(r).toEqual({ shopUrl: "https://sig1.axiom.appbrainer.tech", provisioned: true });
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, "sig1"));
    expect(t.status).toBe("trial");
    expect(t.source).toBe("self_signup");
    expect(t.provisionStatus).toBe("ready");
    expect(t.ownerPhone).toBe("01712345678");
    expect((await getGate("sig1.axiom.appbrainer.tech")).allowed).toBe(true);
    const s = postgres(provider.shopUrl("sig1"), { max: 1 });
    try {
      const [u] = await s`select email, password_hash, role from users`;
      expect(u.role).toBe("owner");
      expect(verifyPassword("correct-horse-battery", u.password_hash)).toBe(true);
      expect(u.password_hash).not.toContain("correct-horse");
    } finally {
      await s.end();
    }
  }, T);

  test("one shop per email, taken subdomains and bad input are rejected before anything is created", async () => {
    await selfSignup(input("sig2"), { provider });
    await expect(selfSignup(input("sig3", { email: "SIG2@example.com" }), { provider })).rejects.toThrow("already exists");
    await expect(selfSignup(input("sig2", { email: "other@example.com" }), { provider })).rejects.toThrow("already taken");
    await expect(selfSignup(input("sig4", { password: "short" }), { provider })).rejects.toThrow("Password");
    await expect(selfSignup(input("admin"), { provider })).rejects.toThrow("reserved");
    await expect(selfSignup(input("sig5", { planId: "nope" }), { provider })).rejects.toThrow("plan");
    const rows = await db.select().from(tenants);
    expect(rows.map((r) => r.slug)).toEqual(["sig2"]);
  }, T);

  test("daily cap stops sign-ups before a database is created", async () => {
    process.env.SIGNUP_DAILY_CAP = "1";
    await selfSignup(input("cap1"), { provider });
    const calls = provider.createCalls;
    await expect(selfSignup(input("cap2"), { provider })).rejects.toThrow("temporarily full");
    expect(provider.createCalls).toBe(calls);
  }, T);

  test("setup failure keeps the registration and reports provisioned=false", async () => {
    const broken = Object.assign(Object.create(provider), { createShopDatabase: async () => { throw new Error("neon down postgres://u:p@h/db"); } });
    const r = await selfSignup(input("sig6"), { provider: broken });
    expect(r.provisioned).toBe(false);
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, "sig6"));
    expect(t.provisionStatus).toBe("failed");
    expect(t.provisionError).not.toContain("postgres://");
  }, T);
});
