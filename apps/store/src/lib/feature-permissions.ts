import { db } from "@/db";
import { featureSettings, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type FeatureKey =
  | "pos"
  | "inventory"
  | "customers"
  | "reports"
  | "staff"
  | "warehouses"
  | "transfers"
  | "products"
  | "pricing"
  | "orders"
  | "warranty"
  | "suppliers"
  | "audit"
  | "settings"
  | "analytics"
  | "barcodes"
  | "campaigns"
  | "cash"
  | "purchases"
  | "exchanges"
  | "returns"
  | "hardware"
  | "guide"
  | "expenses"
  | "petty_cash"
  | "budgets"
  | "recurring_expenses"
  | "expense_reports"
  | "cash_flow"
  | "expense_approvals"
  | "hr"
  | "leave"
  | "payroll";

export type Role = "owner" | "manager" | "salesman" | "customer";

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  description: string;
  category: "sales" | "inventory" | "admin" | "reports";
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { key: "analytics", name: "Analytics", description: "Analytics dashboard", category: "reports" },
  { key: "pos", name: "POS System", description: "Point of sale system", category: "sales" },
  {
    key: "orders",
    name: "Orders",
    description: "Order management and invoice lookup",
    category: "sales",
  },
  { key: "campaigns", name: "Campaigns", description: "Marketing campaigns", category: "sales" },
  {
    key: "cash",
    name: "Cash Management",
    description: "Cash register and drawer management",
    category: "sales",
  },
  {
    key: "inventory",
    name: "Inventory",
    description: "Inventory management",
    category: "inventory",
  },
  { key: "products", name: "Products", description: "Product catalog", category: "inventory" },
  {
    key: "barcodes",
    name: "Barcodes",
    description: "Barcode label printing",
    category: "inventory",
  },
  { key: "customers", name: "Customers", description: "Customer management", category: "sales" },
  {
    key: "purchases",
    name: "Purchases",
    description: "Purchase order management",
    category: "inventory",
  },
  {
    key: "exchanges",
    name: "Exchanges",
    description: "Device exchange management",
    category: "sales",
  },
  { key: "warranty", name: "Warranty", description: "Warranty management", category: "sales" },
  {
    key: "returns",
    name: "Returns",
    description: "Return and exchange management",
    category: "sales",
  },
  {
    key: "hardware",
    name: "Hardware & Media",
    description: "Hardware and media management",
    category: "inventory",
  },
  { key: "reports", name: "Reports", description: "Reports and analytics", category: "reports" },
  { key: "staff", name: "Staff", description: "Staff management", category: "admin" },
  { key: "settings", name: "Settings", description: "System settings", category: "admin" },
  { key: "guide", name: "Guide", description: "User guide", category: "admin" },
  {
    key: "warehouses",
    name: "Warehouses",
    description: "Warehouse management",
    category: "inventory",
  },
  { key: "transfers", name: "Transfers", description: "Stock transfers", category: "inventory" },
  {
    key: "pricing",
    name: "Pricing",
    description: "Price and discount settings",
    category: "admin",
  },
  {
    key: "suppliers",
    name: "Suppliers",
    description: "Supplier management",
    category: "inventory",
  },
  { key: "audit", name: "Audit Log", description: "Audit log viewing", category: "admin" },
  // Expense Management
  {
    key: "expenses",
    name: "Expenses",
    description: "Expense tracking and management",
    category: "reports",
  },
  {
    key: "petty_cash",
    name: "Petty Cash",
    description: "Petty cash fund management",
    category: "reports",
  },
  {
    key: "budgets",
    name: "Budgets",
    description: "Budget allocation and tracking",
    category: "reports",
  },
  {
    key: "recurring_expenses",
    name: "Recurring Expenses",
    description: "Recurring expense templates and scheduling",
    category: "reports",
  },
  {
    key: "expense_reports",
    name: "Expense Reports",
    description: "Expense analytics and reports",
    category: "reports",
  },
  {
    key: "cash_flow",
    name: "Cash Flow",
    description: "Cash flow projections and analysis",
    category: "reports",
  },
  {
    key: "expense_approvals",
    name: "Expense Approvals",
    description: "Expense approval workflow",
    category: "reports",
  },
  // HR
  { key: "hr", name: "HR", description: "Staff HR profiles", category: "admin" },
  { key: "leave", name: "Leave", description: "Leave requests and balances", category: "admin" },
  { key: "payroll", name: "Payroll", description: "Monthly payroll runs", category: "admin" },
];

export const DEFAULT_FEATURE_VISIBILITY: Record<Role, FeatureKey[]> = {
  owner: Object.values(FEATURE_DEFINITIONS).map((f) => f.key),
  manager: [
    "analytics",
    "pos",
    "orders",
    "campaigns",
    "cash",
    "inventory",
    "products",
    "barcodes",
    "customers",
    "purchases",
    "exchanges",
    "warranty",
    "returns",
    "hardware",
    "reports",
    "audit",
    "guide",
    "expenses",
    "petty_cash",
    "budgets",
    "recurring_expenses",
    "expense_reports",
    "expense_approvals",
    "hr",
    "leave",
    "payroll",
  ],
  salesman: ["pos", "orders", "inventory", "customers", "warranty", "reports", "guide"],
  customer: ["orders", "warranty"],
};

export async function getFeatureVisibility(role: Role): Promise<Record<FeatureKey, boolean>> {
  const settings = await db.query.featureSettings.findMany({
    where: eq(featureSettings.role, role),
  });

  const visibility: Record<FeatureKey, boolean> = {} as any;

  // Start with defaults
  const defaultFeatures = DEFAULT_FEATURE_VISIBILITY[role] || [];
  FEATURE_DEFINITIONS.forEach((feature) => {
    visibility[feature.key] = defaultFeatures.includes(feature.key);
  });

  // Override with database settings
  settings.forEach((setting) => {
    visibility[setting.featureKey as FeatureKey] = setting.isVisible;
  });

  return visibility;
}

export async function canAccessFeature(role: Role, featureKey: FeatureKey): Promise<boolean> {
  const [setting] = await db
    .select()
    .from(featureSettings)
    .where(and(eq(featureSettings.role, role), eq(featureSettings.featureKey, featureKey)))
    .limit(1);

  if (setting) {
    return setting.isVisible;
  }

  // Fall back to defaults
  const defaultFeatures = DEFAULT_FEATURE_VISIBILITY[role] || [];
  return defaultFeatures.includes(featureKey);
}

export async function setFeatureVisibility(
  role: Role,
  featureKey: FeatureKey,
  isVisible: boolean,
  updatedBy: string,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(featureSettings)
    .where(and(eq(featureSettings.role, role), eq(featureSettings.featureKey, featureKey)))
    .limit(1);

  if (existing) {
    await db
      .update(featureSettings)
      .set({ isVisible, updatedAt: new Date(), updatedBy })
      .where(eq(featureSettings.id, existing.id));
  } else {
    await db.insert(featureSettings).values({
      role,
      featureKey,
      isVisible,
      updatedBy,
    });
  }
}

export async function initializeDefaultFeatureSettings(): Promise<void> {
  const roles: Role[] = ["owner", "manager", "salesman", "customer"];

  for (const role of roles) {
    const defaultFeatures = DEFAULT_FEATURE_VISIBILITY[role] || [];

    for (const featureDef of FEATURE_DEFINITIONS) {
      const [existing] = await db
        .select()
        .from(featureSettings)
        .where(and(eq(featureSettings.role, role), eq(featureSettings.featureKey, featureDef.key)))
        .limit(1);

      if (!existing) {
        await db.insert(featureSettings).values({
          role,
          featureKey: featureDef.key,
          isVisible: defaultFeatures.includes(featureDef.key),
          updatedBy: "system",
        });
      }
    }
  }
}

export async function getAllFeatureSettings(): Promise<
  Array<{
    role: Role;
    features: Array<{
      key: FeatureKey;
      name: string;
      description: string;
      isVisible: boolean;
    }>;
  }>
> {
  const roles: Role[] = ["owner", "manager", "salesman", "customer"];
  const result = [];

  for (const role of roles) {
    const visibility = await getFeatureVisibility(role);
    result.push({
      role,
      features: FEATURE_DEFINITIONS.map((def) => ({
        key: def.key,
        name: def.name,
        description: def.description,
        category: def.category,
        isVisible: visibility[def.key],
      })),
    });
  }

  return result;
}
