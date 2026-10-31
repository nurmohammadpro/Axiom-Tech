import { addDays, addMonths } from "date-fns";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  invoices,
  payments,
  plans,
  tenantEvents,
  tenants,
  type Tenant,
} from "@/db/schema";
import { DomainError, GRACE_DAYS, normalizePhone, TRIAL_DAYS, validateSlug } from "./domain";
import { ALL_FEATURES } from "./features";
import { getShopDbProvider, type ShopDbProvider } from "./neon";

type PayMethod = "banglaqr" | "cash" | "bkash" | "nagad" | "bank" | "other";

export interface PaymentInput {
  method: PayMethod;
  reference?: string | null;
  amount: number;
  proofUrl?: string | null;
  note?: string | null;
}

async function event(tx: Tx, tenantId: string, type: string, actorId: string | null, data: Record<string, unknown> = {}) {
  await tx.insert(tenantEvents).values({ tenantId, type, actorId, data });
}

async function lockTenant(tx: Tx, id: string): Promise<Tenant> {
  const [t] = await tx.select().from(tenants).where(eq(tenants.id, id)).for("update");
  if (!t) throw new DomainError("Shop not found");
  return t;
}

async function getPlan(tx: Tx | typeof db, id: string) {
  const [p] = await tx.select().from(plans).where(eq(plans.id, id));
  if (!p || !p.isActive) throw new DomainError("Unknown or inactive plan");
  return p;
}

export function checkAmount(amount: number, required: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new DomainError("Amount must be a positive whole number of taka");
  if (amount < required) throw new DomainError(`Amount ৳${amount} is less than the required ৳${required}`);
}

export async function insertPayment(tx: Tx, tenantId: string, kind: "activation" | "monthly", months: number, p: PaymentInput, actorId: string | null) {
  const reference = p.reference?.trim() || null;
  try {
    const [row] = await tx
      .insert(payments)
      .values({
        tenantId,
        kind,
        amount: p.amount,
        method: p.method,
        reference,
        proofUrl: p.proofUrl?.trim() || null,
        months,
        note: p.note?.trim() || null,
        recordedBy: actorId,
      })
      .returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("This transaction reference has already been recorded");
    throw e;
  }
}

export function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export interface NewTenantInput {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string | null;
  planId: string;
  source?: "admin" | "self_signup";
}

/** New shops always start on a 7-day trial with an activation invoice (sign-up fee + first month). */
export async function createTenant(input: NewTenantInput, actorId: string | null, now = new Date()) {
  const slug = validateSlug(input.slug);
  const name = input.name.trim();
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!name || !ownerName) throw new DomainError("Shop name and owner name are required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) throw new DomainError("Owner email is invalid");

  try {
    return await db.transaction(async (tx) => {
      const plan = await getPlan(tx, input.planId);
      const trialEndsAt = addDays(now, TRIAL_DAYS);
      const [tenant] = await tx
        .insert(tenants)
        .values({
          slug,
          name,
          ownerName,
          ownerEmail,
          ownerPhone: input.ownerPhone?.trim() ? normalizePhone(input.ownerPhone.trim()) : null,
          planId: plan.id,
          status: "trial",
          source: input.source ?? "admin",
          trialEndsAt,
          createdBy: actorId,
        })
        .returning();
      await tx.insert(invoices).values({
        tenantId: tenant.id,
        kind: "activation",
        description: `${plan.name} activation: sign-up fee + first month`,
        amount: plan.signupFee + plan.monthlyPrice,
        dueDate: trialEndsAt,
      });
      await event(tx, tenant.id, "created", actorId, { plan: plan.id, source: tenant.source });
      return tenant;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError(`Subdomain "${slug}" is already taken`);
    throw e;
  }
}

/** Paid sign-up fee + first month (cash or BanglaQR): moves a shop to production with no trial. */
export async function activateTenant(id: string, payment: PaymentInput, actorId: string | null, planId?: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status === "active") throw new DomainError("Shop is already active");
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot be activated");
    const plan = await getPlan(tx, planId || t.planId);
    const required = plan.signupFee + plan.monthlyPrice;
    checkAmount(payment.amount, required);

    const pay = await insertPayment(tx, id, "activation", 1, payment, actorId);
    const [due] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, id), eq(invoices.kind, "activation"), eq(invoices.status, "due")))
      .orderBy(desc(invoices.createdAt))
      .limit(1);
    if (due) {
      await tx
        .update(invoices)
        .set({ status: "paid", paidAt: now, paymentId: pay.id, amount: Math.max(required, due.amount) })
        .where(eq(invoices.id, due.id));
    } else {
      await tx.insert(invoices).values({
        tenantId: id,
        kind: "activation",
        description: `${plan.name} activation: sign-up fee + first month`,
        amount: required,
        status: "paid",
        paidAt: now,
        paymentId: pay.id,
      });
    }
    const [updated] = await tx
      .update(tenants)
      .set({
        status: "active",
        planId: plan.id,
        activatedAt: now,
        currentPeriodEnd: addMonths(now, 1),
        suspendedReason: null,
        updatedAt: now,
      })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "activated", actorId, { plan: plan.id, amount: payment.amount, method: payment.method, reference: payment.reference ?? null });
    return updated;
  });
}

/** Monthly renewal: extends the paid period and lifts a payment suspension. */
export async function recordMonthlyPayment(id: string, months: number, payment: PaymentInput, actorId: string | null, now = new Date()) {
  if (!Number.isInteger(months) || months < 1 || months > 12) throw new DomainError("Months must be between 1 and 12");
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (!t.activatedAt) throw new DomainError("Shop has not been activated yet; use Activate to Production");
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot be renewed");
    const plan = await getPlan(tx, t.planId);
    checkAmount(payment.amount, plan.monthlyPrice * months);

    const pay = await insertPayment(tx, id, "monthly", months, payment, actorId);
    const base = t.currentPeriodEnd && t.currentPeriodEnd > now ? t.currentPeriodEnd : now;
    const periodEnd = addMonths(base, months);
    await tx.insert(invoices).values({
      tenantId: id,
      kind: "monthly",
      description: `${plan.name} subscription, ${months} month${months > 1 ? "s" : ""}`,
      amount: payment.amount,
      status: "paid",
      paidAt: now,
      paymentId: pay.id,
    });
    // Lift only a payment_overdue suspension; a manual suspension (abuse,
    // investigation) must be lifted explicitly via Resume.
    const resume = t.status === "suspended" && t.suspendedReason === "payment_overdue";
    const [updated] = await tx
      .update(tenants)
      .set(
        resume
          ? { status: "active", currentPeriodEnd: periodEnd, suspendedReason: null, updatedAt: now }
          : { currentPeriodEnd: periodEnd, updatedAt: now },
      )
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "payment_recorded", actorId, { months, amount: payment.amount, periodEnd: periodEnd.toISOString(), resumed: resume });
    return updated;
  });
}

export async function changePlan(id: string, planId: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot change plan");
    const plan = await getPlan(tx, planId);
    const [updated] = await tx.update(tenants).set({ planId: plan.id, updatedAt: new Date() }).where(eq(tenants.id, id)).returning();
    await event(tx, id, "plan_changed", actorId, { from: t.planId, to: plan.id });
    return updated;
  });
}

/**
 * Per-shop feature overrides over the plan: `true` grants, `false` revokes,
 * an absent key inherits. The gate merges these into the shop's feature list,
 * so the store's proxy and feature checks pick changes up within the gate TTL.
 */
export async function setFeatureOverrides(
  id: string,
  overrides: Record<string, boolean>,
  actorId: string | null,
) {
  // Only known feature keys, only boolean values.
  const known = new Set(ALL_FEATURES);
  const clean: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (known.has(k) && typeof v === "boolean") clean[k] = v;
  }
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status === "cancelled") throw new DomainError("Cancelled shops cannot change features");
    const [updated] = await tx
      .update(tenants)
      .set({ featureOverrides: clean, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "features_changed", actorId, {
      overrides: clean,
      granted: Object.keys(clean).filter((k) => clean[k]),
      revoked: Object.keys(clean).filter((k) => !clean[k]),
    });
    return updated;
  });
}

export async function suspendTenant(id: string, reason: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status === "cancelled") throw new DomainError("Shop is cancelled");
    if (t.status === "suspended") throw new DomainError("Shop is already suspended");
    const [updated] = await tx
      .update(tenants)
      .set({ status: "suspended", suspendedReason: reason.trim() || "manual", updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "suspended", actorId, { reason });
    return updated;
  });
}

/** Resume only when the shop is still entitled to access; otherwise it needs a payment or a trial extension. */
export async function resumeTenant(id: string, actorId: string | null, now = new Date()) {
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status !== "suspended") throw new DomainError("Shop is not suspended");
    let status: "active" | "trial";
    if (t.activatedAt) {
      const graceEnd = t.currentPeriodEnd ? addDays(t.currentPeriodEnd, GRACE_DAYS) : null;
      if (!graceEnd || graceEnd <= now) throw new DomainError("Subscription period has ended: record a payment to resume");
      status = "active";
    } else {
      if (t.trialEndsAt <= now) throw new DomainError("Trial has ended: extend the trial or activate the shop");
      status = "trial";
    }
    const [updated] = await tx
      .update(tenants)
      .set({ status, suspendedReason: null, updatedAt: now })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "resumed", actorId, { status });
    return updated;
  });
}

export async function extendTrial(id: string, days: number, actorId: string | null, now = new Date()) {
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new DomainError("Extension must be 1 to 30 days");
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.activatedAt) throw new DomainError("Shop is already on a paid plan");
    if (t.status === "cancelled") throw new DomainError("Shop is cancelled");
    const base = t.trialEndsAt > now ? t.trialEndsAt : now;
    const trialEndsAt = addDays(base, days);
    const [updated] = await tx
      .update(tenants)
      .set({ trialEndsAt, status: "trial", suspendedReason: null, updatedAt: now })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "trial_extended", actorId, { days, trialEndsAt: trialEndsAt.toISOString() });
    return updated;
  });
}

export async function cancelTenant(
  id: string,
  reason: string,
  actorId: string | null,
  deps: { provider?: ShopDbProvider } = {},
) {
  const cancelled = await db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status === "cancelled") throw new DomainError("Shop is already cancelled");
    const [updated] = await tx
      .update(tenants)
      .set({ status: "cancelled", suspendedReason: reason.trim() || "cancelled", updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "cancelled", actorId, { reason });
    return updated;
  });

  // A cancelled shop's database must not linger on Neon (still counts against
  // storage) or keep valid credentials around. Best-effort after the cancel
  // commits: a failed drop is recorded, never blocks the cancellation.
  if (cancelled.dbUrlEncrypted && cancelled.neonDatabase && cancelled.neonRole) {
    try {
      const provider = deps.provider ?? getShopDbProvider();
      await provider.dropShopDatabase(cancelled.neonDatabase, cancelled.neonRole);
      await db
        .update(tenants)
        .set({
          dbUrlEncrypted: null,
          neonProjectId: null,
          neonDatabase: null,
          neonRole: null,
          provisionStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id));
      await db.insert(tenantEvents).values({ tenantId: id, type: "deprovisioned", actorId, data: {} });
    } catch (e) {
      await db.insert(tenantEvents).values({
        tenantId: id,
        type: "deprovision_failed",
        actorId,
        data: { error: e instanceof Error ? e.message : "drop failed" },
      });
    }
  }
  return cancelled;
}

/**
 * Reverses a cancellation: the shop returns to trial with its existing trial
 * end (extend from there). Its database was dropped at cancel time, so the
 * admin must run provisioning again before anyone can sign in.
 */
export async function restoreTenant(id: string, actorId: string | null) {
  return db.transaction(async (tx) => {
    const t = await lockTenant(tx, id);
    if (t.status !== "cancelled") throw new DomainError("Only cancelled shops can be restored");
    const [updated] = await tx
      .update(tenants)
      .set({ status: "trial", suspendedReason: null, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    await event(tx, id, "restored", actorId, {});
    return updated;
  });
}

/** Blocks shops whose trial or paid period (plus grace) has ended. Safe to run repeatedly. */
export async function expireTenants(now = new Date()) {
  const graceCutoff = addDays(now, -GRACE_DAYS);
  return db.transaction(async (tx) => {
    const trials = await tx
      .update(tenants)
      .set({ status: "suspended", suspendedReason: "trial_expired", updatedAt: now })
      .where(and(eq(tenants.status, "trial"), isNull(tenants.activatedAt), lt(tenants.trialEndsAt, now)))
      .returning({ id: tenants.id });
    const overdue = await tx
      .update(tenants)
      .set({ status: "suspended", suspendedReason: "payment_overdue", updatedAt: now })
      .where(and(eq(tenants.status, "active"), isNotNull(tenants.currentPeriodEnd), lt(tenants.currentPeriodEnd, graceCutoff)))
      .returning({ id: tenants.id });
    for (const r of trials) await event(tx, r.id, "auto_suspended", null, { reason: "trial_expired" });
    for (const r of overdue) await event(tx, r.id, "auto_suspended", null, { reason: "payment_overdue" });
    return { trialsExpired: trials.length, overdueSuspended: overdue.length };
  });
}

/** Counts used on the dashboard. */
export async function tenantCounts() {
  const rows = await db.select({ status: tenants.status, n: sql<number>`count(*)::int` }).from(tenants).groupBy(tenants.status);
  const out = { trial: 0, active: 0, suspended: 0, cancelled: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}
