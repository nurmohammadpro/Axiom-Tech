"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, type PlatformUser } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { generateMonthlyInvoices, payInvoice, voidInvoice } from "@/lib/invoices";
import { createPlan, deletePlan, updatePlan } from "@/lib/plans-admin";
import { resetOwnerPassword } from "@/lib/owner";
import { provisionTenant } from "@/lib/provision";
import type { Permission } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { sanitizeFeatures } from "@/lib/features";
import {
  activateTenant,
  cancelTenant,
  changePlan,
  createTenant,
  extendTrial,
  recordMonthlyPayment,
  resumeTenant,
  restoreTenant,
  suspendTenant,
  type PaymentInput,
  setFeatureOverrides,
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

export async function payInvoiceAction(invoiceId: string, fd: FormData) {
  return run("tenant:payment", `/invoices/${invoiceId}`, async (u) => {
    await payInvoice(invoiceId, int(fd, "months") || 1, paymentFrom(fd), u.id);
    return "Payment recorded";
  });
}

export async function generateInvoicesAction(fd: FormData) {
  return run("tenant:payment", "/invoices", async () => {
    const r = await generateMonthlyInvoices(int(fd, "cutoffDays") || 7);
    return `Generated ${r.created} invoice${r.created === 1 ? "" : "s"} (${r.skipped} already open, skipped)`;
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

export async function setFeatureOverridesAction(tenantId: string, fd: FormData) {
  return run("tenant:features", `/tenants/${tenantId}`, async (u) => {
    // Inputs: f_<key> = "on" | "off"; absent = inherit.
    const overrides: Record<string, boolean> = {};
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("f_")) continue;
      const feature = key.slice(2);
      if (value === "on") overrides[feature] = true;
      else if (value === "off") overrides[feature] = false;
    }
    await setFeatureOverrides(tenantId, overrides, u.id);
    return "Feature access updated";
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
    await updatePlan(planId, {
      name: str(fd, "name"),
      monthlyPrice: int(fd, "monthlyPrice"),
      signupFee: int(fd, "signupFee"),
      maxStaff: str(fd, "maxStaff") === "" ? null : int(fd, "maxStaff"),
      maxWarehouses: str(fd, "maxWarehouses") === "" ? null : int(fd, "maxWarehouses"),
      isActive: fd.get("isActive") === "on",
      sortOrder: str(fd, "sortOrder") === "" ? null : int(fd, "sortOrder"),
      features: [...fd.entries()].filter(([k, v]) => k.startsWith("f_") && v === "on").map(([k]) => k.slice(2)),
    });
    return "Plan updated";
  });
}

export async function createPlanAction(fd: FormData) {
  return run("plans:edit", "/plans", async () => {
    const id = await createPlan({
      name: str(fd, "name"),
      monthlyPrice: str(fd, "monthlyPrice"),
      signupFee: str(fd, "signupFee"),
      maxStaff: str(fd, "maxStaff"),
      maxWarehouses: str(fd, "maxWarehouses"),
      sortOrder: str(fd, "sortOrder"),
      features: [...fd.entries()].filter(([k, v]) => k.startsWith("f_") && v === "on").map(([k]) => k.slice(2)),
    });
    return `Plan "${id}" created`;
  });
}

export async function deletePlanAction(planId: string) {
  return run("plans:edit", "/plans", async () => {
    await deletePlan(planId);
    return "Plan deleted";
  });
}

/** Quick actions from the shops list: these return to the list, not the shop page. */
export async function listSuspendAction(tenantId: string) {
  return run("tenant:suspend", "/tenants", async (u) => {
    await suspendTenant(tenantId, "manual", u.id);
    return "Shop suspended";
  });
}

export async function listResumeAction(tenantId: string) {
  return run("tenant:suspend", "/tenants", async (u) => {
    await resumeTenant(tenantId, u.id);
    return "Shop resumed";
  });
}

export async function listCancelAction(tenantId: string) {
  return run("tenant:cancel", "/tenants", async (u) => {
    await cancelTenant(tenantId, "deleted from shops list", u.id);
    return "Shop cancelled — its database has been dropped";
  });
}

export async function listRestoreAction(tenantId: string) {
  return run("tenant:cancel", "/tenants", async (u) => {
    await restoreTenant(tenantId, u.id);
    return "Shop restored to trial — run provisioning to recreate its database";
  });
}

/** Data-returning reset for the list dropdown: the one-time password shows in a dialog. */
export async function listResetOwnerPassword(tenantId: string): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  try {
    const user = await requirePermission("tenant:reset_owner");
    const r = await resetOwnerPassword(tenantId, user.id);
    return { ok: true, password: r.tempPassword };
  } catch (e) {
    return { ok: false, error: e instanceof DomainError ? e.message : "Reset failed" };
  }
}

export async function restoreTenantAction(tenantId: string) {
  return run("tenant:cancel", `/tenants/${tenantId}`, async (u) => {
    await restoreTenant(tenantId, u.id);
    return "Shop restored to trial — run provisioning to recreate its database";
  });
}

export async function voidInvoiceAction(invoiceId: string) {
  return run("tenant:payment", `/invoices/${invoiceId}`, async (u) => {
    await voidInvoice(invoiceId, u.id);
    return "Invoice voided";
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

export interface OwnerResetState {
  ok: boolean;
  error?: string;
  ownerEmail?: string;
  /** Shown once; never persisted by the platform. */
  tempPassword?: string;
}

export async function resetOwnerAction(tenantId: string, _prev: OwnerResetState, fd: FormData): Promise<OwnerResetState> {
  try {
    const user = await requirePermission("tenant:reset_owner");
    if (fd.get("confirm") !== "on") throw new DomainError("Tick the box to confirm the reset");
    const r = await resetOwnerPassword(tenantId, user.id);
    revalidatePath(`/tenants/${tenantId}`);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    throw e;
  }
}
