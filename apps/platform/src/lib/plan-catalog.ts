/**
 * Plan definitions seeded into the `plans` table (BDT, whole taka).
 * Feature keys match apps/store `FeatureKey`. Plans are cumulative. See docs/PRICING.md.
 */
const STARTER = [
  "pos",
  "inventory",
  "products",
  "barcodes",
  "customers",
  "reports",
  "settings",
  "guide",
  "hardware",
  "staff",
];
const GROWTH = [
  ...STARTER,
  "suppliers",
  "purchases",
  "returns",
  "exchanges",
  "cash",
  "warehouses",
  "transfers",
  "analytics",
  "pricing",
];
const PRO = [
  ...GROWTH,
  "warranty",
  "audit",
  "campaigns",
  "orders",
  "expenses",
  "petty_cash",
  "budgets",
  "recurring_expenses",
  "expense_reports",
  "cash_flow",
  "expense_approvals",
  "hr",
  "leave",
  "payroll",
];

export const PLAN_CATALOG = [
  { id: "starter", name: "Starter", monthlyPrice: 1000, signupFee: 5000, maxStaff: 1, maxWarehouses: 1, features: STARTER, sortOrder: 1 },
  { id: "growth", name: "Growth", monthlyPrice: 2000, signupFee: 10000, maxStaff: 2, maxWarehouses: 2, features: GROWTH, sortOrder: 2 },
  { id: "pro", name: "Pro", monthlyPrice: 3000, signupFee: 15000, maxStaff: null, maxWarehouses: null, features: PRO, sortOrder: 3 },
] as const;
