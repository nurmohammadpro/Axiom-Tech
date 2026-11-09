import { db } from "@/db";
import { purchaseOrderItems, products, productVariants } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const poId = searchParams.get("poId");

  if (!poId) {
    return NextResponse.json({ error: "poId is required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: purchaseOrderItems.id,
      productId: purchaseOrderItems.productId,
      variantId: purchaseOrderItems.variantId,
      qtyOrdered: purchaseOrderItems.qtyOrdered,
      qtyReceived: purchaseOrderItems.qtyReceived,
      costPrice: purchaseOrderItems.costPrice,
      sellPrice: purchaseOrderItems.sellPrice,
      costCode: purchaseOrderItems.costCode,
      dCode: purchaseOrderItems.dCode,
      sellCode: purchaseOrderItems.sellCode,
      category: purchaseOrderItems.category,
      brandId: purchaseOrderItems.brandId,
      batteryHealth: purchaseOrderItems.batteryHealth,
      conditionGrade: purchaseOrderItems.conditionGrade,
      color: purchaseOrderItems.color,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
    })
    .from(purchaseOrderItems)
    .innerJoin(products, eq(purchaseOrderItems.productId, products.id))
    .leftJoin(productVariants, eq(purchaseOrderItems.variantId, productVariants.id))
    .where(eq(purchaseOrderItems.poId, poId));

  return NextResponse.json(rows);
}
