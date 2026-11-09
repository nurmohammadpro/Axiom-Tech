import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  warranties,
  warrantyPolicies,
  warrantyClaims,
  inventoryUnits,
  saleLines,
  sales,
  productVariants,
  products,
  users,
} from "@/db/schema";
import { eq, desc, sql, and, like, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search")?.trim();
    const status = sp.get("status"); // "active" | "claimed" | "void"
    const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "25", 10)));
    const offset = page * limit;

    // Build the base query with all joins
    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      const searchCondition = or(
        like(users.firstName, pattern),
        like(users.lastName, pattern),
        like(users.email, pattern),
        like(products.name, pattern),
        like(productVariants.sku, pattern),
        like(inventoryUnits.imei1, pattern),
        like(inventoryUnits.serialNumber, pattern),
        like(inventoryUnits.unitCode, pattern),
        like(sales.customerPhone, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const where = conditions.length ? and(...conditions) : undefined;

    // Count total
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(warranties)
      .leftJoin(users, eq(warranties.customerId, users.id))
      .leftJoin(saleLines, eq(warranties.saleLineId, saleLines.id))
      .leftJoin(productVariants, eq(saleLines.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(inventoryUnits, eq(warranties.unitId, inventoryUnits.id))
      .leftJoin(sales, eq(saleLines.saleId, sales.id))
      .where(where);

    const total = countRow?.count ?? 0;

    // Fetch warranties with full joins
    const rows = await db
      .select({
        id: warranties.id,
        startsAt: warranties.startsAt,
        expiresAt: warranties.expiresAt,
        warrantyStatus: warranties.status,
        // Customer
        customerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${sales.customerName}, 'Unknown')`.as("customerName"),
        customerPhone: sql<string | null>`COALESCE(${users.phone}, ${sales.customerPhone})`.as("customerPhone"),
        // Product
        productName: sql<string>`COALESCE(${products.name}, ${saleLines.productNameSnapshot})`.as("productName"),
        variantName: productVariants.name,
        variantSku: productVariants.sku,
        // IMEI / serial
        imei1: inventoryUnits.imei1,
        imei2: inventoryUnits.imei2,
        serialNumber: inventoryUnits.serialNumber,
        unitCode: inventoryUnits.unitCode,
        // Purchase date
        purchaseDate: sales.createdAt,
        // Policy
        policyName: warrantyPolicies.name,
        // Claim count
        claimCount: sql<number>`(SELECT count(*)::int FROM warranty_claims wc WHERE wc.warranty_id = ${warranties.id})`.as("claimCount"),
      })
      .from(warranties)
      .leftJoin(users, eq(warranties.customerId, users.id))
      .leftJoin(saleLines, eq(warranties.saleLineId, saleLines.id))
      .leftJoin(productVariants, eq(saleLines.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(inventoryUnits, eq(warranties.unitId, inventoryUnits.id))
      .leftJoin(sales, eq(saleLines.saleId, sales.id))
      .leftJoin(warrantyPolicies, eq(warranties.policyId, warrantyPolicies.id))
      .where(where)
      .orderBy(desc(warranties.createdAt))
      .limit(limit)
      .offset(offset);

    // Derive display status
    const now = new Date();
    const enriched = rows.map((r) => {
      let displayStatus: string;
      if (r.claimCount > 0) {
        displayStatus = "claimed";
      } else if (r.expiresAt && new Date(r.expiresAt) < now) {
        displayStatus = "void";
      } else {
        displayStatus = "active";
      }
      return { ...r, displayStatus };
    });

    // Optionally filter by derived status
    const filtered = status ? enriched.filter((r) => r.displayStatus === status) : enriched;

    return NextResponse.json({ rows: filtered, total, page, limit });
  } catch (error) {
    console.error("Error fetching warranties:", error);
    return NextResponse.json({ error: "Failed to fetch warranties" }, { status: 500 });
  }
}
