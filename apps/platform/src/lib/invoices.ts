import { addDays, addMonths } from "date-fns";
import { and, desc, eq, gte, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  invoices,
  payments,
  plans,
  tenantEvents,
  tenants,
  type Invoice,
  type Payment,
  type Tenant,
} from "@/db/schema";
import { DomainError } from "./domain";
import { checkAmount, insertPayment, type PaymentInput } from "./tenants";

async function logEvent(tx: Tx, tenantId: string, type: string, actorId: string | null, data: Record<string, unknown> = {}) {
  await tx.insert(tenantEvents).values({ tenantId, type, actorId, data });
}

export type InvoiceFilter = "due" | "paid" | "void" | "overdue";

/** Newest-first invoice feed for the billing view; `overdue` = due past its due date. */
export async function listInvoices(
  opts: { status?: InvoiceFilter; tenantId?: string } = {},
  now = new Date(),
): Promise<{ inv: Invoice; shop: string; slug: string }[]> {
  const conds = [];
  if (opts.status === "overdue") {
    conds.push(eq(invoices.status, "due"), lt(invoices.dueDate, now));
  } else if (opts.status) {
    conds.push(eq(invoices.status, opts.status));
  }
  if (opts.tenantId) conds.push(eq(invoices.tenantId, opts.tenantId));
  return db
    .select({ inv: invoices, shop: tenants.name, slug: tenants.slug })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(invoices.createdAt))
    .limit(500);
}

export async function getInvoice(
  id: string,
): Promise<{ inv: Invoice; tenant: Tenant; payment: Payment | null; history: Payment[] } | null> {
  const [row] = await db
    .select({ inv: invoices, tenant: tenants })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .where(eq(invoices.id, id));
  if (!row) return null;
  const history = await db
    .select()
    .from(payments)
    .where(eq(payments.tenantId, row.tenant.id))
    .orderBy(desc(payments.receivedAt))
    .limit(20);
  const payment = row.inv.paymentId ? history.find((p) => p.id === row.inv.paymentId) ?? null : null;
  return { ...row, payment, history };
}

/**
 * Creates one `due` monthly invoice per active shop whose paid period ends within
 * `cutoffDays`. Shops suspended for payment_overdue are billed too — paying that
 * invoice is what lifts the suspension. Row locks make concurrent runs (button +
 * cron) safe: a second run skips shops that already have an open monthly invoice.
 */
export async function generateMonthlyInvoices(cutoffDays = 7, now = new Date()): Promise<{ created: number; skipped: number }> {
  if (!Number.isInteger(cutoffDays) || cutoffDays < 1 || cutoffDays > 60) throw new DomainError("Cutoff must be 1 to 60 days");
  return db.transaction(async (tx) => {
    const dueWithin = addDays(now, cutoffDays);
    const billable = or(
      eq(tenants.status, "active"),
      and(eq(tenants.status, "suspended"), eq(tenants.suspendedReason, "payment_overdue")),
    );
    const candidates = await tx
      .select({ t: tenants, planName: plans.name, price: plans.monthlyPrice })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(and(billable, isNotNull(tenants.currentPeriodEnd), lte(tenants.currentPeriodEnd, dueWithin)))
      .for("update", { of: tenants });
    let created = 0;
    let skipped = 0;
    for (const { t, planName, price } of candidates) {
      const [open] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.tenantId, t.id), eq(invoices.kind, "monthly"), eq(invoices.status, "due")))
        .limit(1);
      if (open) {
        skipped++;
        continue;
      }
      const periodEnd = t.currentPeriodEnd!;
      await tx.insert(invoices).values({
        tenantId: t.id,
        kind: "monthly",
        description: `${planName} subscription, 1 month`,
        amount: price,
        dueDate: periodEnd,
      });
      await tx.insert(tenantEvents).values({
        tenantId: t.id,
        type: "invoice_generated",
        actorId: null,
        data: { amount: price, dueDate: periodEnd.toISOString() },
      });
      created++;
    }
    return { created, skipped };
  });
}

/**
 * Records a payment against a due invoice: marks it paid, extends the shop's paid
 * period and lifts a payment-overdue suspension (never a manual suspension).
 * Activation invoices are paid through Activate to Production instead.
 */
export async function payInvoice(
  invoiceId: string,
  months: number,
  payment: PaymentInput,
  actorId: string | null,
  now = new Date(),
): Promise<Tenant> {
  if (!Number.isInteger(months) || months < 1 || months > 12) throw new DomainError("Months must be between 1 and 12");
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!inv) throw new DomainError("Invoice not found");
    if (inv.status === "paid") throw new DomainError("Invoice is already paid");
    if (inv.status === "void") throw new DomainError("Invoice is void");
    if (inv.kind === "activation") throw new DomainError("Pay activation invoices with Activate to Production on the shop page");
    const [t] = await tx.select().from(tenants).where(eq(tenants.id, inv.tenantId)).for("update");
    if (!t) throw new DomainError("Shop not found");
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot be paid");
    checkAmount(payment.amount, inv.amount);

    const pay = await insertPayment(tx, t.id, "monthly", months, payment, actorId);
    await tx.update(invoices).set({ status: "paid", paidAt: now, paymentId: pay.id }).where(eq(invoices.id, inv.id));
    const base = t.currentPeriodEnd && t.currentPeriodEnd > now ? t.currentPeriodEnd : now;
    const periodEnd = addMonths(base, months);
    const resume = t.status === "suspended" && t.suspendedReason === "payment_overdue";
    const [updated] = await tx
      .update(tenants)
      .set(
        resume
          ? { status: "active", suspendedReason: null, currentPeriodEnd: periodEnd, updatedAt: now }
          : { currentPeriodEnd: periodEnd, updatedAt: now },
      )
      .where(eq(tenants.id, t.id))
      .returning();
    await logEvent(tx, t.id, "payment_recorded", actorId, { invoiceId: inv.id, months, amount: payment.amount, periodEnd: periodEnd.toISOString() });
    await logEvent(tx, t.id, "invoice_paid", actorId, { invoiceId: inv.id, amount: inv.amount, resumed: resume });
    return updated;
  });
}

/** Money totals for the dashboard cards (whole BDT). */
export async function billingTotals(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [collected] = await db
    .select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(gte(payments.receivedAt, monthStart));
  const [outstanding] = await db
    .select({ v: sql<number>`coalesce(sum(${invoices.amount}), 0)::int` })
    .from(invoices)
    .where(eq(invoices.status, "due"));
  const [overdue] = await db
    .select({ v: sql<number>`coalesce(sum(${invoices.amount}), 0)::int` })
    .from(invoices)
    .where(and(eq(invoices.status, "due"), lt(invoices.dueDate, now)));
  return { collectedThisMonth: collected?.v ?? 0, outstanding: outstanding?.v ?? 0, overdue: overdue?.v ?? 0 };
}
