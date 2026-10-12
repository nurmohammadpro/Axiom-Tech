import { beforeEach, describe, expect, test } from "bun:test";
import { addDays, addMonths } from "date-fns";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, tenantEvents, tenants } from "@/db/schema";
import { seedPlans } from "@/db/seed-data";
import { DomainError, slugFromHost, validateSlug } from "@/lib/domain";
import { getGate } from "@/lib/gate";
import {
  activateTenant,
  cancelTenant,
  createTenant,
  expireTenants,
  extendTrial,
  recordMonthlyPayment,
  resumeTenant,
  suspendTenant,
} from "@/lib/tenants";
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from "@/lib/auth";

const T0 = new Date("2026-10-10T06:00:00Z");
const input = (slug: string, planId = "growth") => ({ slug, name: "Shop " + slug, ownerName: "Owner", ownerEmail: "o@x.com", planId });
const pay = (amount: number, reference: string) => ({ method: "banglaqr" as const, amount, reference });

async function ready(id: string) {
  await db.update(tenants).set({ provisionStatus: "ready" }).where(eq(tenants.id, id));
}

beforeEach(async () => {
  await db.execute(sql`truncate table tenant_events, invoices, payments, tenants, platform_users, plans restart identity cascade`);
  await seedPlans(db);
});

describe("helpers", () => {
  test("slug validation", () => {
    expect(validateSlug(" Nur-Shop1 ")).toBe("nur-shop1");
    for (const bad of ["ab", "-abc", "abc-", "a--b", "admin", "has space", "x".repeat(31)]) {
      expect(() => validateSlug(bad)).toThrow(DomainError);
    }
  });
  test("host to slug", () => {
    expect(slugFromHost("nur.axiom.appbrainer.tech:443", "axiom.appbrainer.tech")).toBe("nur");
    expect(slugFromHost("axiom.appbrainer.tech", "axiom.appbrainer.tech")).toBeNull();
    expect(slugFromHost("a.b.axiom.appbrainer.tech", "axiom.appbrainer.tech")).toBeNull();
    expect(slugFromHost("evil.com", "axiom.appbrainer.tech")).toBeNull();
  });
  test("passwords and sessions", () => {
    const h = hashPassword("correct horse");
    expect(verifyPassword("correct horse", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(verifyPassword("plain", "plain")).toBe(false);
    const tok = createSessionToken("u1", T0.getTime());
    expect(verifySessionToken(tok, T0.getTime() + 1000)).toBe("u1");
    expect(verifySessionToken(tok, T0.getTime() + 13 * 3600 * 1000)).toBeNull();
    expect(verifySessionToken(tok.slice(0, -2) + "xx", T0.getTime())).toBeNull();
  });
});

describe("tenant lifecycle", () => {
  test("create starts a 7-day trial with an activation invoice", async () => {
    const t = await createTenant(input("alpha"), null, T0);
    expect(t.status).toBe("trial");
    expect(t.trialEndsAt.getTime()).toBe(addDays(T0, 7).getTime());
    const [inv] = await db.select().from(invoices).where(eq(invoices.tenantId, t.id));
    expect(inv.amount).toBe(12000); // growth: 10,000 + 2,000
    expect(inv.status).toBe("due");
  });

  test("duplicate or reserved subdomain is rejected", async () => {
    await createTenant(input("alpha"), null, T0);
    await expect(createTenant(input("alpha"), null, T0)).rejects.toThrow("already taken");
    await expect(createTenant(input("admin"), null, T0)).rejects.toThrow("reserved");
  });

  test("activation requires fee + first month, then skips the trial", async () => {
    const t = await createTenant(input("beta", "starter"), null, T0);
    await expect(activateTenant(t.id, pay(5999, "TX1"), null, undefined, T0)).rejects.toThrow("less than the required ৳6000");
    const a = await activateTenant(t.id, pay(6000, "TX1"), null, undefined, T0);
    expect(a.status).toBe("active");
    expect(a.currentPeriodEnd!.getTime()).toBe(addMonths(T0, 1).getTime());
    const [inv] = await db.select().from(invoices).where(eq(invoices.tenantId, t.id));
    expect(inv.status).toBe("paid");
    await expect(activateTenant(t.id, pay(6000, "TX2"), null, undefined, T0)).rejects.toThrow("already active");
  });

  test("activation can upgrade the plan and charges that plan's price", async () => {
    const t = await createTenant(input("gamma", "starter"), null, T0);
    await expect(activateTenant(t.id, pay(6000, "TX1"), null, "pro", T0)).rejects.toThrow("less than the required ৳18000");
    const a = await activateTenant(t.id, pay(18000, "TX1"), null, "pro", T0);
    expect(a.planId).toBe("pro");
  });

  test("a transaction reference cannot be reused", async () => {
    const a = await createTenant(input("one"), null, T0);
    const b = await createTenant(input("two"), null, T0);
    await activateTenant(a.id, pay(12000, "TRX-9"), null, undefined, T0);
    await expect(activateTenant(b.id, pay(12000, "TRX-9"), null, undefined, T0)).rejects.toThrow("already been recorded");
    const [bRow] = await db.select().from(tenants).where(eq(tenants.id, b.id));
    expect(bRow.status).toBe("trial"); // transaction rolled back
  });

  test("monthly payment extends from the later of period end and now", async () => {
    const t = await createTenant(input("delta", "starter"), null, T0);
    await activateTenant(t.id, pay(6000, "TX1"), null, undefined, T0);
    await expect(recordMonthlyPayment(t.id, 2, pay(1999, "TX2"), null, T0)).rejects.toThrow("less than");
    const r = await recordMonthlyPayment(t.id, 2, pay(2000, "TX2"), null, T0);
    expect(r.currentPeriodEnd!.getTime()).toBe(addMonths(addMonths(T0, 1), 2).getTime());
    await expect(recordMonthlyPayment((await createTenant(input("eps"), null, T0)).id, 1, pay(2000, "TX3"), null, T0)).rejects.toThrow("not been activated");
  });

  test("expiry job suspends expired trials and overdue shops, idempotently", async () => {
    const trial = await createTenant(input("trial1"), null, T0);
    const paid = await createTenant(input("paid1", "starter"), null, T0);
    await activateTenant(paid.id, pay(6000, "TX1"), null, undefined, T0);
    const fresh = await createTenant(input("fresh1"), null, T0);

    expect(await expireTenants(addDays(T0, 6))).toEqual({ trialsExpired: 0, overdueSuspended: 0 });
    const afterTrial = await expireTenants(addDays(T0, 8));
    expect(afterTrial.trialsExpired).toBe(2); // trial1 and fresh1
    // paid shop: period ends T0+1 month; grace 3 days
    expect((await expireTenants(addDays(addMonths(T0, 1), 2))).overdueSuspended).toBe(0);
    expect((await expireTenants(addDays(addMonths(T0, 1), 4))).overdueSuspended).toBe(1);
    expect(await expireTenants(addDays(addMonths(T0, 1), 5))).toEqual({ trialsExpired: 0, overdueSuspended: 0 });

    const [t1] = await db.select().from(tenants).where(eq(tenants.id, trial.id));
    expect(t1.status).toBe("suspended");
    expect(t1.suspendedReason).toBe("trial_expired");
    const ev = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, fresh.id));
    expect(ev.map((e) => e.type)).toContain("auto_suspended");
  });

  test("resume rules and trial extension", async () => {
    const t = await createTenant(input("zeta"), null, T0);
    await suspendTenant(t.id, "manual", null);
    const resumed = await resumeTenant(t.id, null, addDays(T0, 2));
    expect(resumed.status).toBe("trial");

    await expireTenants(addDays(T0, 10));
    await expect(resumeTenant(t.id, null, addDays(T0, 10))).rejects.toThrow("Trial has ended");
    const ext = await extendTrial(t.id, 5, null, addDays(T0, 10));
    expect(ext.status).toBe("trial");
    expect(ext.trialEndsAt.getTime()).toBe(addDays(T0, 15).getTime());

    const p = await createTenant(input("paid2", "starter"), null, T0);
    await activateTenant(p.id, pay(6000, "TXP"), null, undefined, T0);
    await expect(extendTrial(p.id, 3, null, T0)).rejects.toThrow("paid plan");
    await suspendTenant(p.id, "manual", null);
    await expect(resumeTenant(p.id, null, addDays(addMonths(T0, 1), 10))).rejects.toThrow("record a payment");
    const back = await resumeTenant(p.id, null, addDays(T0, 5));
    expect(back.status).toBe("active");
  });

  test("cancelled shops are terminal", async () => {
    const t = await createTenant(input("omega"), null, T0);
    await cancelTenant(t.id, "left", null);
    await expect(activateTenant(t.id, pay(12000, "TXC"), null, undefined, T0)).rejects.toThrow("Cancelled");
    await expect(extendTrial(t.id, 3, null, T0)).rejects.toThrow("cancelled");
    expect((await db.select().from(payments).where(eq(payments.tenantId, t.id))).length).toBe(0);
  });
});

describe("gate", () => {
  const host = (s: string) => `${s}.axiom.appbrainer.tech`;
  const prev = process.env.ROOT_DOMAIN;
  beforeEach(() => {
    process.env.ROOT_DOMAIN = "axiom.appbrainer.tech";
  });

  test("unknown host and unprovisioned shop are blocked", async () => {
    expect((await getGate("nobody.axiom.appbrainer.tech", T0)).reason).toBe("unknown_shop");
    expect((await getGate("evil.com", T0)).found).toBe(false);
    const t = await createTenant(input("gate1"), null, T0);
    expect((await getGate(host("gate1"), T0)).reason).toBe("not_ready");
    await ready(t.id);
    const g = await getGate(host("gate1"), T0);
    expect(g.allowed).toBe(true);
    expect(g.features).toContain("pos");
    expect(g.features).not.toContain("payroll");
  });

  test("trial and paid periods are enforced by time even if cron never ran", async () => {
    const t = await createTenant(input("gate2", "starter"), null, T0);
    await ready(t.id);
    expect((await getGate(host("gate2"), addDays(T0, 6))).allowed).toBe(true);
    expect((await getGate(host("gate2"), addDays(T0, 8))).reason).toBe("trial_expired");
    await activateTenant(t.id, pay(6000, "TXG"), null, undefined, T0);
    expect((await getGate(host("gate2"), addDays(addMonths(T0, 1), 2))).allowed).toBe(true);
    expect((await getGate(host("gate2"), addDays(addMonths(T0, 1), 4))).reason).toBe("payment_overdue");
  });

  test("suspended and cancelled shops are blocked with a reason; plan limits are exposed", async () => {
    const t = await createTenant(input("gate3", "starter"), null, T0);
    await ready(t.id);
    await suspendTenant(t.id, "unpaid", null);
    expect((await getGate(host("gate3"), T0)).reason).toBe("suspended");
    await cancelTenant(t.id, "x", null);
    const g = await getGate(host("gate3"), T0);
    expect(g.reason).toBe("cancelled");
    expect(g.maxStaff).toBe(1);
    if (prev === undefined) delete process.env.ROOT_DOMAIN;
    else process.env.ROOT_DOMAIN = prev;
  });
});

describe("permissions", () => {
  test("only super admin and support can reset an owner password", async () => {
    const { can } = await import("@/lib/rbac");
    expect(can("super_admin", "tenant:reset_owner")).toBe(true);
    expect(can("support", "tenant:reset_owner")).toBe(true);
    expect(can("billing", "tenant:reset_owner")).toBe(false);
    expect(can("support", "tenant:payment")).toBe(false);
  });
});
