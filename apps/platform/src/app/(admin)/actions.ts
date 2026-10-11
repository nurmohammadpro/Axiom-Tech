"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, type PlatformUser } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { provisionTenant } from "@/lib/provision";
import type { Permission } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import {
  activateTenant,
  cancelTenant,
  changePlan,
  createTenant,
  extendTrial,
  recordMonthlyPayment,
  resumeTenant,
  suspendTenant,
  type PaymentInput,
} from "@/lib/tenants";

const METHODS = ["banglaqr", "cash", "bkash", "nagad", "bank", "other"] as const;

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function int(fd: FormData, k: string): number {
  const raw = str(fd, k).replace(/,/g, "");
  if (!/^-?\d+$/.test(raw)) throw new DomainError(`${k} must be a whole number`);
  return Number(raw);
}

function paymentFrom(fd: FormData): PaymentInput {
  const method = str(fd, "method") as (typeof METHODS)[number];
  if (!METHODS.includes(method)) throw new DomainError("Choose a payment method");
  const reference = str(fd, "reference");
  if (method !== "cash" && !reference) throw new DomainError("Transaction reference is required for non-cash payments");
  return { method, amount: int(fd, "amount"), reference: reference || null, proofUrl: str(fd, "proofUrl") || null, note: str(fd, "note") || null };
}

type Outcome = string | { msg: string; to: string };

/** Runs an admin action, then redirects back with a notice. Redirects happen outside the try block. */
async function run(perm: Permission, back: string, fn: (u: PlatformUser) => Promise<Outcome>): Promise<never> {
  let target: string;
  try {
    const user = await requirePermission(perm);
    const out = await fn(user);
    target = typeof out === "string" ? `${back}?ok=${encodeURIComponent(out)}` : `${out.to}?ok=${encodeURIComponent(out.msg)}`;
  } catch (e) {
    if (e instanceof DomainError) target = `${back}?error=${encodeURIComponent(e.message)}`;
    else throw e;
  }
  revalidatePath("/", "layout");
  redirect(target);
}

export async function createTenantAction(fd: FormData) {
  return run("tenant:create", "/tenants/new", async (u) => {
    const t = await createTenant(
      { slug: str(fd, "slug"), name: str(fd, "name"), ownerName: str(fd, "ownerName"), ownerEmail: str(fd, "ownerEmail"), ownerPhone: str(fd, "ownerPhone"), planId: str(fd, "planId") },
      u.id,
    );
    return { msg: "Shop created on a 7-day trial", to: `/tenants/${t.id}` };
  });
}

export async function activateAction(tenantId: string, fd: FormData) {
  return run("tenant:payment", `/tenants/${tenantId}`, async (u) => {
    await activateTenant(tenantId, paymentFrom(fd), u.id, str(fd, "planId") || undefined);
    return "Shop activated for production";
  });
}

export async function monthlyPaymentAction(tenantId: string, fd: FormData) {
  return run("tenant:payment", `/tenants/${tenantId}`, async (u) => {
    await recordMonthlyPayment(tenantId, int(fd, "months"), paymentFrom(fd), u.id);
    return "Payment recorded";
  });
}

export async function extendTrialAction(tenantId: string, fd: FormData) {
  return run("tenant:extend_trial", `/tenants/${tenantId}`, async (u) => {
    await extendTrial(tenantId, int(fd, "days"), u.id);
    return "Trial extended";
  });
}

export async function suspendAction(tenantId: string, fd: FormData) {
  return run("tenant:suspend", `/tenants/${tenantId}`, async (u) => {
    await suspendTenant(tenantId, str(fd, "reason") || "manual", u.id);
    return "Shop suspended";
  });
}

export async function resumeAction(tenantId: string) {
  return run("tenant:suspend", `/tenants/${tenantId}`, async (u) => {
    await resumeTenant(tenantId, u.id);
    return "Shop resumed";
  });
}

export async function changePlanAction(tenantId: string, fd: FormData) {
  return run("tenant:change_plan", `/tenants/${tenantId}`, async (u) => {
    await changePlan(tenantId, str(fd, "planId"), u.id);
    return "Plan changed";
  });
}

export async function cancelAction(tenantId: string, fd: FormData) {
  return run("tenant:cancel", `/tenants/${tenantId}`, async (u) => {
    await cancelTenant(tenantId, str(fd, "reason") || "cancelled", u.id);
    return "Shop cancelled";
  });
}

export async function updatePlanAction(planId: string, fd: FormData) {
  return run("plans:edit", "/plans", async () => {
    const optional = (k: string) => (str(fd, k) === "" ? null : int(fd, k));
    const monthlyPrice = int(fd, "monthlyPrice");
    const signupFee = int(fd, "signupFee");
    const maxStaff = optional("maxStaff");
    const maxWarehouses = optional("maxWarehouses");
    for (const n of [monthlyPrice, signupFee, maxStaff ?? 0, maxWarehouses ?? 0]) {
      if (n < 0) throw new DomainError("Values cannot be negative");
    }
    const res = await db
      .update(plans)
      .set({ monthlyPrice, signupFee, maxStaff, maxWarehouses, isActive: fd.get("isActive") === "on" })
      .where(eq(plans.id, planId))
      .returning({ id: plans.id });
    if (!res.length) throw new DomainError("Plan not found");
    return "Plan updated";
  });
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export interface ProvisionState {
  ok: boolean;
  error?: string;
  shopUrl?: string;
  ownerEmail?: string;
  /** Shown once; never persisted by the platform. */
  tempPassword?: string | null;
}

export async function provisionAction(tenantId: string, _prev: ProvisionState, _fd: FormData): Promise<ProvisionState> {
  try {
    const user = await requirePermission("tenant:provision");
    const r = await provisionTenant(tenantId, user.id);
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}
