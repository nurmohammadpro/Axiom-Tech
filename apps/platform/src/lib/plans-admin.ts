import { asc, eq, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { plans, tenants } from "@/db/schema";
import { DomainError } from "./domain";
import { sanitizeFeatures } from "./features";

/** Plans visible to the admin console (soft-deleted ones are gone for good). */
export function listActivePlans(tx: Tx | typeof db = db) {
  return tx.select().from(plans).where(isNull(plans.deletedAt)).orderBy(asc(plans.sortOrder));
}

/** Stable plan id from a display name. */
export function planIdFromName(name: string): string {
  const id = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (id.length < 2) throw new DomainError("Plan name needs at least 2 letters or digits");
  return id;
}

function intField(v: string, label: string, opts: { allowEmpty?: boolean } = {}): number | null {
  if (v === "") {
    if (opts.allowEmpty) return null;
    throw new DomainError(`${label} is required`);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new DomainError(`${label} must be a whole number of 0 or more`);
  return n;
}

export async function createPlan(input: {
  name: string;
  monthlyPrice: string;
  signupFee: string;
  maxStaff: string;
  maxWarehouses: string;
  sortOrder: string;
  features: string[];
}): Promise<string> {
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Plan name must be at least 2 characters");
  const id = planIdFromName(name);
  const monthlyPrice = intField(input.monthlyPrice, "Monthly price");
  const signupFee = intField(input.signupFee, "Sign-up fee");
  const maxStaff = intField(input.maxStaff, "Staff seats", { allowEmpty: true });
  const maxWarehouses = intField(input.maxWarehouses, "Warehouses", { allowEmpty: true });
  const sortOrder = intField(input.sortOrder, "Sort order", { allowEmpty: true }) ?? 99;
  const features = sanitizeFeatures(input.features);
  if (features.length === 0) throw new DomainError("A plan needs at least one feature");

  const [existing] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, id));
  if (existing) throw new DomainError(`A plan with id "${id}" already exists`);
  const [max] = await db.select({ m: sql<number>`coalesce(max(${plans.sortOrder}), 0)` }).from(plans);
  await db.insert(plans).values({
    id,
    name,
    monthlyPrice: monthlyPrice!,
    signupFee: signupFee!,
    maxStaff,
    maxWarehouses,
    sortOrder: sortOrder ?? (max?.m ?? 0) + 1,
    features,
    isActive: true,
  });
  return id;
}

export async function updatePlan(
  id: string,
  input: { name: string; monthlyPrice: number; signupFee: number; maxStaff: number | null; maxWarehouses: number | null; isActive: boolean; sortOrder: number | null; features: string[] },
) {
  const name = input.name.trim();
  if (name.length < 2) throw new DomainError("Plan name must be at least 2 characters");
  const features = sanitizeFeatures(input.features);
  if (features.length === 0) throw new DomainError("A plan needs at least one feature");
  const res = await db
    .update(plans)
    .set({
      name,
      monthlyPrice: input.monthlyPrice,
      signupFee: input.signupFee,
      maxStaff: input.maxStaff,
      maxWarehouses: input.maxWarehouses,
      isActive: input.isActive,
      ...(input.sortOrder === null ? {} : { sortOrder: input.sortOrder }),
      features,
    })
    .where(eq(plans.id, id))
    .returning({ id: plans.id });
  if (!res.length) throw new DomainError("Plan not found");
}

/**
 * Soft-deletes a plan: shops can never reference it (blocked here), the row
 * stays for history and so re-seeding does not resurrect it.
 */
export async function deletePlan(id: string) {
  const [p] = await db.select().from(plans).where(eq(plans.id, id));
  if (!p || p.deletedAt) throw new DomainError("Plan not found");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tenants)
    .where(eq(tenants.planId, id));
  if (n > 0) throw new DomainError(`${n} shop${n > 1 ? "s are" : " is"} on this plan — move them to another plan first`);
  await db.update(plans).set({ deletedAt: new Date() }).where(eq(plans.id, id));
}
