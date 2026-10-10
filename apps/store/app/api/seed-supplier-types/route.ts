import { NextResponse } from "next/server";
import { db } from "@/db";
import { supplierTypes } from "@/db/schema";

export async function GET() {
  try {
    const initialTypes = [
      { name: "Company", slug: "company", description: "Registered companies and corporations", tone: "info", sortOrder: 1 },
      { name: "Importer", slug: "importer", description: "Authorized importers and distributors", tone: "success", sortOrder: 2 },
      { name: "Dealer", slug: "dealer", description: "Authorized dealers and resellers", tone: "info", sortOrder: 3 },
      { name: "Individual", slug: "individual", description: "Individual suppliers and freelancers", tone: "warn", sortOrder: 4 },
      { name: "Customer", slug: "customer", description: "Customers selling pre-owned items", tone: "muted", sortOrder: 5 },
    ];

    const results = [];
    for (const type of initialTypes) {
      try {
        const [created] = await db.insert(supplierTypes).values(type).returning();
        results.push(created);
      } catch (error: any) {
        if (error.code === '23505') {
          const existing = await db.query.supplierTypes.findFirst({
            where: (fields, { eq }) => eq(fields.slug, type.slug),
          });
          if (existing) results.push(existing);
        } else {
          throw error;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Supplier types seeded successfully",
      count: results.length,
      types: results
    });
  } catch (error) {
    console.error("Failed to seed supplier types:", error);
    return NextResponse.json({ error: "Failed to seed supplier types" }, { status: 500 });
  }
}
