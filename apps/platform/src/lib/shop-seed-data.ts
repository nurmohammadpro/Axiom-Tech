// Defaults written into every new shop database. Expense categories mirror
// apps/store/src/db/seed-expense-categories.ts (tests keep them in sync).

export const DEFAULT_SUPPLIER_TYPES = [
  { name: "Company", slug: "company", description: "Registered companies and corporations", tone: "info", sortOrder: 1 },
  { name: "Importer", slug: "importer", description: "Authorized importers and distributors", tone: "success", sortOrder: 2 },
  { name: "Dealer", slug: "dealer", description: "Authorized dealers and resellers", tone: "info", sortOrder: 3 },
  { name: "Individual", slug: "individual", description: "Individual suppliers and freelancers", tone: "warn", sortOrder: 4 },
  { name: "Customer", slug: "customer", description: "Customers selling pre-owned items", tone: "muted", sortOrder: 5 },
] as const;

/**
 * Category slugs drive store behaviour: slugs starting with "official" use FIFO batch selling,
 * "pre-owned-phones" gets net-price receipts. Parents first; children name a parent slug.
 */
export const DEFAULT_CATEGORIES = [
  { slug: "phones", name: "Phones", parent: null },
  { slug: "official-new", name: "Official New", parent: "phones" },
  { slug: "unofficial-new", name: "Unofficial New", parent: "phones" },
  { slug: "pre-owned-phones", name: "Pre-Owned Phones", parent: "phones" },
  { slug: "accessories", name: "Accessories", parent: null },
  { slug: "portable-speakers", name: "Portable Speakers", parent: "accessories" },
  { slug: "tws", name: "TWS Earbuds", parent: "accessories" },
  { slug: "wireless-neckband", name: "Wireless Neckband", parent: "accessories" },
  { slug: "smart-watch", name: "Smart Watch", parent: "accessories" },
  { slug: "power-bank", name: "Power Bank", parent: "accessories" },
  { slug: "wireless-microphones", name: "Wireless Microphones", parent: "accessories" },
] as const;

export const DEFAULT_LOCATION = { name: "Main Store", code: "MAIN" } as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  {
    "name": "Office Rent",
    "code": "RENT",
    "icon": "🏢",
    "color": "#3B82F6",
    "isTaxDeductible": true,
    "tdsRate": 1000,
    "vatApplicable": true,
    "sortOrder": 1
  },
  {
    "name": "Warehouse Rent",
    "code": "RENT-WH",
    "icon": "🏭",
    "color": "#3B82F6",
    "isTaxDeductible": true,
    "tdsRate": 1000,
    "vatApplicable": true,
    "sortOrder": 2
  },
  {
    "name": "Electricity Bill",
    "code": "UTIL-ELEC",
    "icon": "⚡",
    "color": "#EAB308",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 10
  },
  {
    "name": "Gas Bill",
    "code": "UTIL-GAS",
    "icon": "🔥",
    "color": "#F97316",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 11
  },
  {
    "name": "Water Bill",
    "code": "UTIL-WATER",
    "icon": "💧",
    "color": "#06B6D4",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 12
  },
  {
    "name": "Internet Bill",
    "code": "UTIL-INT",
    "icon": "🌐",
    "color": "#8B5CF6",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 13
  },
  {
    "name": "Mobile Data",
    "code": "UTIL-NET",
    "icon": "📱",
    "color": "#A855F7",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 14
  },
  {
    "name": "Transport & Delivery",
    "code": "TRANSPORT",
    "icon": "🚗",
    "color": "#10B981",
    "isTaxDeductible": true,
    "tdsRate": 1000,
    "vatApplicable": false,
    "sortOrder": 20
  },
  {
    "name": "Fuel & Vehicle",
    "code": "FUEL",
    "icon": "⛽",
    "color": "#14B8A6",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 21
  },
  {
    "name": "Staff Salaries",
    "code": "SALARY",
    "icon": "👥",
    "color": "#6366F1",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 30
  },
  {
    "name": "Bonuses & Incentives",
    "code": "BONUS",
    "icon": "🎁",
    "color": "#818CF8",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 31
  },
  {
    "name": "Marketing & Advertising",
    "code": "MARKETING",
    "icon": "📣",
    "color": "#EC4899",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 40
  },
  {
    "name": "Repair & Maintenance",
    "code": "REPAIR",
    "icon": "🔧",
    "color": "#EF4444",
    "isTaxDeductible": true,
    "tdsRate": 1000,
    "vatApplicable": true,
    "sortOrder": 50
  },
  {
    "name": "Office Supplies",
    "code": "OFFICE",
    "icon": "📝",
    "color": "#22C55E",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 60
  },
  {
    "name": "Packaging Materials",
    "code": "PACKAGING",
    "icon": "📦",
    "color": "#16A34A",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 61
  },
  {
    "name": "Insurance Premiums",
    "code": "INSURANCE",
    "icon": "🛡️",
    "color": "#0EA5E9",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 70
  },
  {
    "name": "Professional Services",
    "code": "PROFESSIONAL",
    "icon": "👔",
    "color": "#1E40AF",
    "isTaxDeductible": true,
    "tdsRate": 1000,
    "vatApplicable": false,
    "sortOrder": 80
  },
  {
    "name": "Travel & Accommodation",
    "code": "TRAVEL",
    "icon": "✈️",
    "color": "#7C3AED",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 90
  },
  {
    "name": "Staff Training",
    "code": "TRAINING",
    "icon": "📚",
    "color": "#A3E635",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 100
  },
  {
    "name": "Equipment & Tools",
    "code": "EQUIPMENT",
    "icon": "🖥️",
    "color": "#64748B",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": true,
    "sortOrder": 110
  },
  {
    "name": "Software & Subscriptions",
    "code": "SOFTWARE",
    "icon": "💻",
    "color": "#475569",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 120
  },
  {
    "name": "Client Entertainment",
    "code": "ENTERTAINMENT",
    "icon": "🎬",
    "color": "#F472B6",
    "isTaxDeductible": false,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 130
  },
  {
    "name": "Courier & Shipping",
    "code": "COURIER",
    "icon": "📮",
    "color": "#6366F1",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 140
  },
  {
    "name": "Donations & Charity",
    "code": "DONATION",
    "icon": "🎀",
    "color": "#F43F5E",
    "isTaxDeductible": false,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 150
  },
  {
    "name": "Miscellaneous",
    "code": "MISC",
    "icon": "❓",
    "color": "#9CA3AF",
    "isTaxDeductible": true,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 200
  },
  {
    "name": "Custom",
    "code": "CUSTOM",
    "icon": "📋",
    "color": "#6B7280",
    "isTaxDeductible": false,
    "tdsRate": 0,
    "vatApplicable": false,
    "sortOrder": 201
  }
] as const;
