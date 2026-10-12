import { addDays } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { GRACE_DAYS, slugFromHost } from "./domain";

export interface GateResult {
  found: boolean;
  allowed: boolean;
  /** Machine reason when not allowed. */
  reason?: "unknown_shop" | "trial_expired" | "payment_overdue" | "suspended" | "cancelled" | "not_ready";
  tenantId?: string;
  name?: string;
  status?: string;
  planId?: string;
  features?: string[];
  maxStaff?: number | null;
  maxWarehouses?: number | null;
  trialEndsAt?: string;
  currentPeriodEnd?: string | null;
  /** AES-GCM encrypted pooled DB URL. Only present when allowed (never for blocked shops). */
  dbUrlEncrypted?: string;
}

/**
 * Entitlement check used by shop apps for a request host. Time is checked here as
 * well as by the expiry job, so a missed cron run never leaves an expired shop open.
 */
export async function getGate(host: string, now = new Date()): Promise<GateResult> {
  const slug = slugFromHost(host);
  if (!slug) return { found: false, allowed: false, reason: "unknown_shop" };
  const [row] = await db
    .select({ t: tenants, p: plans })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.slug, slug));
  if (!row) return { found: false, allowed: false, reason: "unknown_shop" };
  const { t, p } = row;

  const base: GateResult = {
    found: true,
    allowed: false,
    tenantId: t.id,
    name: t.name,
    status: t.status,
    planId: p.id,
    features: p.features,
    maxStaff: p.maxStaff,
    maxWarehouses: p.maxWarehouses,
    trialEndsAt: t.trialEndsAt.toISOString(),
    currentPeriodEnd: t.currentPeriodEnd?.toISOString() ?? null,
  };

  if (t.status === "cancelled") return { ...base, reason: "cancelled" };
  if (t.status === "suspended") {
    return { ...base, reason: t.suspendedReason === "trial_expired" ? "trial_expired" : t.suspendedReason === "payment_overdue" ? "payment_overdue" : "suspended" };
  }
  if (t.provisionStatus !== "ready") return { ...base, reason: "not_ready" };
  if (t.status === "trial") {
    return t.trialEndsAt > now ? { ...base, allowed: true, dbUrlEncrypted: t.dbUrlEncrypted ?? undefined } : { ...base, reason: "trial_expired" };
  }
  const end = t.currentPeriodEnd ? addDays(t.currentPeriodEnd, GRACE_DAYS) : null;
  return end && end > now ? { ...base, allowed: true, dbUrlEncrypted: t.dbUrlEncrypted ?? undefined } : { ...base, reason: "payment_overdue" };
}
