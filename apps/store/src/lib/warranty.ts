import type { warrantyPolicies } from "@/db/schema";

export type WarrantyPolicy = typeof warrantyPolicies.$inferSelect;

export interface WarrantySelection {
  policyId: number | null;
  startsAt: Date;
  expiresAt: Date | null;
}

const UNIT_MS: Record<string, number> = {
  days: 24 * 60 * 60 * 1000,
  months: 30 * 24 * 60 * 60 * 1000,
  years: 365 * 24 * 60 * 60 * 1000,
};

export function warrantyEndAt(policy: WarrantyPolicy, from: Date): Date | null {
  if (!policy.durationValue || policy.durationValue <= 0) return null;
  const unit = policy.durationUnit in UNIT_MS ? policy.durationUnit : "days";
  return new Date(from.getTime() + policy.durationValue * UNIT_MS[unit]);
}

export function warrantySnapshot(policy: WarrantyPolicy, startsAt: Date, expiresAt: Date | null) {
  return {
    policyId: policy.id,
    name: policy.name,
    durationValue: policy.durationValue,
    durationUnit: policy.durationUnit,
    coverageType: policy.coverageType,
    terms: policy.terms,
    exclusions: policy.exclusions,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

export function calculateWarrantyDates(
  policy: WarrantyPolicy,
  fromDate: Date = new Date(),
): WarrantySelection {
  if (!policy) {
    return {
      policyId: null,
      startsAt: fromDate,
      expiresAt: null,
    };
  }

  const startsAt = fromDate;
  const expiresAt = warrantyEndAt(policy, fromDate);

  return {
    policyId: policy.id,
    startsAt,
    expiresAt,
  };
}
