import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  warrantyClaims,
  warranties,
  warrantyPolicies,
  warrantyEvents,
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
    const statusFilter = sp.get("status");
    const page = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "25", 10)));
    const offset = page * limit;

    const conditions = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          like(warrantyClaims.claimNumber, pattern),
          like(warrantyClaims.issueDescription, pattern),
          like(users.firstName, pattern),
          like(users.lastName, pattern),
          like(products.name, pattern),
          like(inventoryUnits.imei1, pattern),
          like(inventoryUnits.serialNumber, pattern),
          like(sales.customerPhone, pattern),
        )!,
      );
    }

    if (statusFilter) {
      conditions.push(eq(warrantyClaims.status, statusFilter));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    // Count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(warrantyClaims)
      .leftJoin(users, eq(warrantyClaims.customerId, users.id))
      .leftJoin(inventoryUnits, eq(warrantyClaims.unitId, inventoryUnits.id))
      .leftJoin(productVariants, eq(inventoryUnits.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(warranties, eq(warrantyClaims.warrantyId, warranties.id))
      .leftJoin(saleLines, eq(warranties.saleLineId, saleLines.id))
      .leftJoin(sales, eq(saleLines.saleId, sales.id))
      .where(where);

    const total = countRow?.count ?? 0;

    // Fetch claims with full joins
    const rows = await db
      .select({
        id: warrantyClaims.id,
        claimNumber: warrantyClaims.claimNumber,
        issueDescription: warrantyClaims.issueDescription,
        intakeCondition: warrantyClaims.intakeCondition,
        status: warrantyClaims.status,
        diagnosis: warrantyClaims.diagnosis,
        resolution: warrantyClaims.resolution,
        cost: warrantyClaims.cost,
        receivedAt: warrantyClaims.receivedAt,
        resolvedAt: warrantyClaims.resolvedAt,
        // Customer
        customerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${sales.customerName}, 'Unknown')`.as("customerName"),
        customerPhone: sql<string | null>`${users.phone}`.as("customerPhone"),
        // Product
        productName: sql<string>`COALESCE(${products.name}, ${saleLines.productNameSnapshot}, 'Unknown')`.as("productName"),
        variantName: productVariants.name,
        variantSku: productVariants.sku,
        // IMEI / serial
        imei1: inventoryUnits.imei1,
        serialNumber: inventoryUnits.serialNumber,
        unitCode: inventoryUnits.unitCode,
        // Warranty info
        warrantyId: warrantyClaims.warrantyId,
        policyName: warrantyPolicies.name,
        warrantyExpiresAt: warranties.expiresAt,
      })
      .from(warrantyClaims)
      .leftJoin(users, eq(warrantyClaims.customerId, users.id))
      .leftJoin(inventoryUnits, eq(warrantyClaims.unitId, inventoryUnits.id))
      .leftJoin(productVariants, eq(inventoryUnits.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(warranties, eq(warrantyClaims.warrantyId, warranties.id))
      .leftJoin(warrantyPolicies, eq(warranties.policyId, warrantyPolicies.id))
      .leftJoin(saleLines, eq(warranties.saleLineId, saleLines.id))
      .leftJoin(sales, eq(saleLines.saleId, sales.id))
      .where(where)
      .orderBy(desc(warrantyClaims.receivedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ rows, total, page, limit });
  } catch (error) {
    console.error("Error fetching warranty claims:", error);
    return NextResponse.json({ error: "Failed to fetch claims" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { unitId, warrantyId, issueDescription, customerId, intakeCondition } = body;

    if (!unitId || !issueDescription) {
      return NextResponse.json({ error: "Missing required fields (unitId, issueDescription)" }, { status: 400 });
    }

    // Validate unit exists
    const [unit] = await db
      .select({ id: inventoryUnits.id })
      .from(inventoryUnits)
      .where(eq(inventoryUnits.id, unitId))
      .limit(1);
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    // If no warrantyId provided, try to find an active warranty for this unit
    let resolvedWarrantyId = warrantyId || null;
    if (!resolvedWarrantyId) {
      const [warranty] = await db
        .select({ id: warranties.id })
        .from(warranties)
        .where(eq(warranties.unitId, unitId))
        .limit(1);
      resolvedWarrantyId = warranty?.id ?? null;
    }

    const claimNumber = `WCR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const [newClaim] = await db
      .insert(warrantyClaims)
      .values({
        unitId,
        warrantyId: resolvedWarrantyId,
        customerId: customerId || null,
        claimNumber,
        issueDescription,
        intakeCondition: intakeCondition || null,
        status: "requested",
        receivedAt: new Date(),
      })
      .returning();

    // Audit event
    await db.insert(warrantyEvents).values({
      claimId: newClaim.id,
      eventType: "created",
      note: `Claim created: ${issueDescription}`,
    });

    return NextResponse.json(newClaim, { status: 201 });
  } catch (error) {
    console.error("Error creating warranty claim:", error);
    return NextResponse.json({ error: "Failed to create claim" }, { status: 500 });
  }
}
