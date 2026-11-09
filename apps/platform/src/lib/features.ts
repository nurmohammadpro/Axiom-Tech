/**
 * Canonical feature catalog shared by the plan definitions and the per-shop
 * feature toggles. Keys match apps/store `FeatureKey`.
 */

import { PLAN_CATALOG } from "./plan-catalog";

export const FEATURE_LABELS: Record<string, string> = {
  pos: "POS / Billing",
  inventory: "Inventory",
  products: "Products & Catalog",
  barcodes: "Barcode Labels",
  customers: "Customers",
  reports: "Reports & Exports",
  settings: "Settings",
  guide: "User Guide",
  hardware: "Hardware & Media",
  staff: "Staff Management",
  suppliers: "Suppliers",
  purchases: "Purchases",
  returns: "Returns",
  exchanges: "Exchanges / Trade-in",
  cash: "Cash Management",
  warehouses: "Extra Warehouses",
  transfers: "Stock Transfers",
  analytics: "Analytics",
  pricing: "Pricing Tools",
  warranty: "Warranties",
  audit: "Audit Log",
  campaigns: "Campaigns",
  orders: "Online Orders",
  expenses: "Expenses",
  petty_cash: "Petty Cash",
  budgets: "Budgets",
  recurring_expenses: "Recurring Expenses",
  expense_reports: "Expense Reports",
  cash_flow: "Cash Flow",
  expense_approvals: "Expense Approvals",
  hr: "HR & Payroll",
  leave: "Leave",
  payroll: "Payroll",
};

/** Every feature key any plan can include, in plan order. */
export const ALL_FEATURES: string[] = [...new Set(PLAN_CATALOG.flatMap((p) => [...p.features]))];

/**
 * Merge a plan's feature list with a shop's overrides:
 * `true` grants a feature the plan lacks, `false` revokes one it has,
 * an absent key inherits the plan.
 */
export function effectiveFeatures(planFeatures: string[], overrides: Record<string, boolean> | null | undefined): string[] {
  const set = new Set(planFeatures);
  for (const [key, on] of Object.entries(overrides ?? {})) {
    if (on) set.add(key);
    else set.delete(key);
  }
  // Preserve plan order first, then any granted extras in catalog order.
  return [...set].sort((a, b) => {
    const ia = planFeatures.indexOf(a);
    const ib = planFeatures.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return ALL_FEATURES.indexOf(a) - ALL_FEATURES.indexOf(b);
  });
}


/**
 * Validate/dedupe a set of feature keys (e.g. from the plan editor form) and
 * return them in catalog order. Unknown keys are dropped.
 */
export function sanitizeFeatures(keys: Iterable<string>): string[] {
  const wanted = new Set(keys);
  return ALL_FEATURES.filter((k) => wanted.has(k));
}
