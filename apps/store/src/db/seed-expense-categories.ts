import { db } from "./index";
import { expenseCategories } from "./schema";
import { sql } from "drizzle-orm";

const EXPENSE_CATEGORIES_SEED = [
  // Rent
  { name: "Office Rent", code: "RENT", icon: "🏢", color: "#3B82F6", isTaxDeductible: true, tdsRate: 1000, vatApplicable: true, sortOrder: 1 },
  { name: "Warehouse Rent", code: "RENT-WH", icon: "🏭", color: "#3B82F6", isTaxDeductible: true, tdsRate: 1000, vatApplicable: true, sortOrder: 2 },

  // Utilities
  { name: "Electricity Bill", code: "UTIL-ELEC", icon: "⚡", color: "#EAB308", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 10 },
  { name: "Gas Bill", code: "UTIL-GAS", icon: "🔥", color: "#F97316", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 11 },
  { name: "Water Bill", code: "UTIL-WATER", icon: "💧", color: "#06B6D4", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 12 },
  { name: "Internet Bill", code: "UTIL-INT", icon: "🌐", color: "#8B5CF6", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 13 },
  { name: "Mobile Data", code: "UTIL-NET", icon: "📱", color: "#A855F7", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 14 },

  // Transport
  { name: "Transport & Delivery", code: "TRANSPORT", icon: "🚗", color: "#10B981", isTaxDeductible: true, tdsRate: 1000, vatApplicable: false, sortOrder: 20 },
  { name: "Fuel & Vehicle", code: "FUEL", icon: "⛽", color: "#14B8A6", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 21 },

  // Staff
  { name: "Staff Salaries", code: "SALARY", icon: "👥", color: "#6366F1", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 30 },
  { name: "Bonuses & Incentives", code: "BONUS", icon: "🎁", color: "#818CF8", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 31 },

  // Marketing
  { name: "Marketing & Advertising", code: "MARKETING", icon: "📣", color: "#EC4899", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 40 },

  // Maintenance
  { name: "Repair & Maintenance", code: "REPAIR", icon: "🔧", color: "#EF4444", isTaxDeductible: true, tdsRate: 1000, vatApplicable: true, sortOrder: 50 },

  // Office
  { name: "Office Supplies", code: "OFFICE", icon: "📝", color: "#22C55E", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 60 },
  { name: "Packaging Materials", code: "PACKAGING", icon: "📦", color: "#16A34A", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 61 },

  // Insurance
  { name: "Insurance Premiums", code: "INSURANCE", icon: "🛡️", color: "#0EA5E9", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 70 },

  // Professional
  { name: "Professional Services", code: "PROFESSIONAL", icon: "👔", color: "#1E40AF", isTaxDeductible: true, tdsRate: 1000, vatApplicable: false, sortOrder: 80 },

  // Travel
  { name: "Travel & Accommodation", code: "TRAVEL", icon: "✈️", color: "#7C3AED", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 90 },

  // Training
  { name: "Staff Training", code: "TRAINING", icon: "📚", color: "#A3E635", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 100 },

  // Equipment
  { name: "Equipment & Tools", code: "EQUIPMENT", icon: "🖥️", color: "#64748B", isTaxDeductible: true, tdsRate: 0, vatApplicable: true, sortOrder: 110 },

  // Software
  { name: "Software & Subscriptions", code: "SOFTWARE", icon: "💻", color: "#475569", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 120 },

  // Entertainment
  { name: "Client Entertainment", code: "ENTERTAINMENT", icon: "🎬", color: "#F472B6", isTaxDeductible: false, tdsRate: 0, vatApplicable: false, sortOrder: 130 },

  // Courier
  { name: "Courier & Shipping", code: "COURIER", icon: "📮", color: "#6366F1", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 140 },

  // Donation
  { name: "Donations & Charity", code: "DONATION", icon: "🎀", color: "#F43F5E", isTaxDeductible: false, tdsRate: 0, vatApplicable: false, sortOrder: 150 },

  // Custom
  { name: "Miscellaneous", code: "MISC", icon: "❓", color: "#9CA3AF", isTaxDeductible: true, tdsRate: 0, vatApplicable: false, sortOrder: 200 },
  { name: "Custom", code: "CUSTOM", icon: "📋", color: "#6B7280", isTaxDeductible: false, tdsRate: 0, vatApplicable: false, sortOrder: 201 },
];

async function seedExpenseCategories() {
  console.log("Seeding expense categories...");

  try {
    // Check if categories already exist
    const existing = await db.select({ count: sql<number>`count(*)::int` }).from(expenseCategories);
    if (existing[0]?.count > 0) {
      console.log(`Found ${existing[0].count} existing categories, skipping seed.`);
      return;
    }

    // Insert categories
    for (const cat of EXPENSE_CATEGORIES_SEED) {
      await db.insert(expenseCategories).values({
        name: cat.name,
        code: cat.code,
        icon: cat.icon,
        color: cat.color,
        isTaxDeductible: cat.isTaxDeductible,
        tdsRate: cat.tdsRate,
        vatApplicable: cat.vatApplicable,
        sortOrder: cat.sortOrder,
        isActive: true,
      });
    }

    console.log(`Seeded ${EXPENSE_CATEGORIES_SEED.length} expense categories.`);
  } catch (error) {
    console.error("Error seeding expense categories:", error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedExpenseCategories()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Failed:", error);
      process.exit(1);
    });
}

export { seedExpenseCategories, EXPENSE_CATEGORIES_SEED };
