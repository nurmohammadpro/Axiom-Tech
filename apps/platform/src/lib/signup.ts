import { and, eq, gte, sql } from "drizzle-orm";
import { subHours } from "date-fns";
import { db } from "@/db";
import { plans, tenants } from "@/db/schema";
import { DomainError, rootDomain } from "./domain";
import { provisionTenant, type ProvisionDeps } from "./provision";
import { createTenant } from "./tenants";

export interface SignupInput {
  shopName: string;
  slug: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  planId: string;
}

export interface SignupResult {
  shopUrl: string;
  /** False when the shop was registered but setup failed; an admin can retry it from the console. */
  provisioned: boolean;
}

export function dailyCap(): number {
  const n = Number(process.env.SIGNUP_DAILY_CAP);
  return Number.isInteger(n) && n >= 0 ? n : 20;
}

/** Bangladeshi mobile (01XXXXXXXXX, optional +880 / 880 prefix); spaces and dashes allowed. */
export function normalizePhone(raw: string): string {
  const p = raw.replace(/[\s-]/g, "");
  const m = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(p);
  if (!m) throw new DomainError("Enter a valid Bangladeshi mobile number, for example 01712345678");
  return `0${m[1]}`;
}

/**
 * Public self-signup: validates, enforces abuse limits (one trial per email, daily cap), creates a
 * 7-day trial shop and sets it up right away with the owner's own password. Limits live here so
 * every caller is covered; the form adds per-IP throttling and a honeypot on top.
 */
export async function selfSignup(input: SignupInput, deps: ProvisionDeps = {}, now = new Date()): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (input.password.length < 10 || input.password.length > 128) {
    throw new DomainError("Password must be 10 to 128 characters");
  }
  if (input.shopName.trim().length < 2 || input.shopName.length > 80) throw new DomainError("Enter your shop name");
  if (input.ownerName.trim().length < 2 || input.ownerName.length > 80) throw new DomainError("Enter your name");

  const [plan] = await db.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.isActive, true)));
  if (!plan) throw new DomainError("Choose a plan");

  const [{ n: recent }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tenants)
    .where(and(eq(tenants.source, "self_signup"), gte(tenants.createdAt, subHours(now, 24))));
  if (recent >= dailyCap()) throw new DomainError("Sign-ups are temporarily full. Please try again tomorrow or contact us.");

  const [dup] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.ownerEmail, email)).limit(1);
  if (dup) throw new DomainError("A shop already exists for this email. Contact us if you need help.");

  const tenant = await createTenant(
    { slug: input.slug, name: input.shopName, ownerName: input.ownerName, ownerEmail: email, ownerPhone: phone, planId: plan.id, source: "self_signup" },
    null,
    now,
  );
  const shopUrl = `https://${tenant.slug}.${rootDomain()}`;
  try {
    await provisionTenant(tenant.id, null, { ...deps, ownerPassword: input.password });
    return { shopUrl, provisioned: true };
  } catch {
    return { shopUrl, provisioned: false }; // recorded on the tenant (provision_error); admin can retry
  }
}
