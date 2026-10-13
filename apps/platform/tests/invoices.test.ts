import { beforeEach, describe, expect, test } from "bun:test";
import { addDays, addMonths } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, tenants } from "@/db/schema";
import { seedPlans } from "@/db/seed-data";
import { activateTenant, createTenant, expireTenants, suspendTenant } from "@/lib/tenants";
import { billingTotals, generateMonthlyInvoices, listInvoices, payInvoice } from "@/lib/invoices";

const T0 = new Date("2026-10-10T06:00:00Z");
const input = (slug: string, planId = "starter") => ({ slug, name: "Shop " + slug, ownerName: "Owner", ownerEmail: "o@x.com", planId });
const pay = (amount: number, reference: string) => ({ method: "banglaqr" as const, amount, reference });

/** Trial shop -> Activate to Production (starter: 6,000 = 5,000 fee + 1,000 first month). */
async function active(slug: string) {
  const t = await createTenant(input(slug), null, T0);
  return activateTenant(t.id, pay(6000, `TX-${slug}`), null, undefined, T0);
}

async function dueMonthlyInvoice(tenantId: string) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.kind, "monthly"), eq(invoices.status, "due")));
  return inv;
}

beforeEach(async () => {
  await db.execute(sql`truncate table tenant_events, invoices, payments, tenants, platform_users, plans restart identity cascade`);
  await seedPlans(db);
});

describe("monthly invoice generation", () => {
  test("creates one due invoice per active shop near period end, idempotently", async () => {
    const t = await active("gen1");
    const periodEnd = addMonths(T0, 1);
    // 7-day window ending after the Nov period end
    const first = await generateMonthlyInvoices(7, addDays(periodEnd, -1));
    expect(first.created).toBe(1);
    const inv = await dueMonthlyInvoice(t.id);
    expect(inv.status).toBe("due");
    expect(inv.amount).toBe(1000); // starter monthly price
    expect(inv.dueDate!.getTime()).toBe(periodEnd.getTime());

    const second = await generateMonthlyInvoices(7, addDays(periodEnd, -1));
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
  });

  test("skips shops far from renewal and non-active shops", async () => {
    await active("far1"); // period end in 1 month
    await createTenant(input("trial1"), null, T0); // still on trial
    const r = await generateMonthlyInvoices(3, T0); // 3-day window does not reach the period end
    expect(r.created).toBe(0);
  });
});

describe("payInvoice", () => {
  test("marks the invoice paid and extends the period by the paid months", async () => {
    const t = await active("pay1");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1));
    const inv = await dueMonthlyInvoice(t.id);
    const at = addDays(addMonths(T0, 1), -2);

    const updated = await payInvoice(inv.id, 2, pay(2000, "M-1"), null, at);
    expect(updated.status).toBe("active");
    expect(updated.currentPeriodEnd!.getTime()).toBe(addMonths(addMonths(T0, 1), 2).getTime());

    const [paid] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(paid.status).toBe("paid");
    expect(paid.paidAt!.getTime()).toBe(at.getTime());
    const [p] = await db.select().from(payments).where(eq(payments.id, paid.paymentId!));
    expect(p.amount).toBe(2000);
    expect(p.months).toBe(2);
  });

  test("rejects underpayment, bad months and double pay", async () => {
    const t = await active("pay2");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1));
    const inv = await dueMonthlyInvoice(t.id);

    await expect(payInvoice(inv.id, 1, pay(999, "M-2"), null, T0)).rejects.toThrow("less than the required ৳1000");
    await expect(payInvoice(inv.id, 13, pay(1000, "M-2"), null, T0)).rejects.toThrow("Months must be between 1 and 12");
    await payInvoice(inv.id, 1, pay(1000, "M-2"), null, T0);
    await expect(payInvoice(inv.id, 1, pay(1000, "M-3"), null, T0)).rejects.toThrow("already paid");
  });

  test("resumes a payment-overdue suspension but not a manual one", async () => {
    const auto = await active("susp1");
    await expireTenants(addDays(addMonths(T0, 1), 4)); // past grace -> payment_overdue
    // payment_overdue shops are still billed: the invoice is their way back in
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), 4));
    const inv1 = await dueMonthlyInvoice(auto.id);
    const r1 = await payInvoice(inv1.id, 1, pay(1000, "S-1"), null, addDays(addMonths(T0, 1), 4));
    expect(r1.status).toBe("active");
    expect(r1.suspendedReason).toBeNull();

    const manual = await active("susp2");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1)); // invoice while still active
    await suspendTenant(manual.id, "manual", null);
    // manually suspended shops get no new invoices from the cron
    const gen = await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), 4));
    expect(gen.created).toBe(0);
    const inv2 = await dueMonthlyInvoice(manual.id);
    const r2 = await payInvoice(inv2.id, 1, pay(1000, "S-2"), null, addDays(addMonths(T0, 1), 4));
    expect(r2.status).toBe("suspended");
    expect(r2.suspendedReason).toBe("manual");
    expect(r2.currentPeriodEnd!.getTime()).toBe(addMonths(addDays(addMonths(T0, 1), 4), 1).getTime());
  });
});

describe("listInvoices and billingTotals", () => {
  test("overdue filter only returns due invoices past their due date", async () => {
    const t = await active("list1");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1));
    const inv = await dueMonthlyInvoice(t.id);
    const afterDue = addDays(inv.dueDate!, 2);

    expect((await listInvoices({ status: "overdue" }, afterDue)).map((r) => r.inv.id)).toContain(inv.id);
    expect((await listInvoices({ status: "overdue" }, T0)).length).toBe(0);
    // the activation invoice was paid at activation
    expect((await listInvoices({ status: "paid" }, afterDue)).map((r) => r.inv.kind)).toEqual(["activation"]);
    const all = await listInvoices({}, afterDue);
    expect(all.length).toBe(2); // activation + monthly
    expect(all[0].shop).toBe("Shop list1");
    expect(all[0].slug).toBe("list1");
  });

  test("totals: collected this month, outstanding and overdue", async () => {
    const t = await active("tot1");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1));
    const inv = await dueMonthlyInvoice(t.id);
    await payInvoice(inv.id, 1, pay(1000, "T-1"), null, T0);
    // a second shop left with a due invoice past its due date
    const other = await active("tot2");
    await generateMonthlyInvoices(7, addDays(addMonths(T0, 1), -1));
    const inv2 = await dueMonthlyInvoice(other.id);
    await db.update(invoices).set({ dueDate: addDays(new Date(), -1) }).where(eq(invoices.id, inv2.id));

    const totals = await billingTotals(new Date());
    expect(totals.collectedThisMonth).toBe(13000); // two activations (6000 each) + one monthly (1000)
    expect(totals.outstanding).toBe(1000); // tot2's open monthly invoice
    expect(totals.overdue).toBe(1000);
  });
});
