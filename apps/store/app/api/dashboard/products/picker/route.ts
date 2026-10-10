import { db } from "@/db";
import { products, productVariants, brands, categories } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, or, ilike, desc, sql } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") ?? undefined;

  const conditions = [];

  if (q) {
    conditions.push(or(ilike(products.name, `%${q}%`), ilike(productVariants.sku, `%${q}%`)));
  }

  if (type) {
    conditions.push(eq(products.productType, type));
  }

  const where = conditions.length > 0 ? conditions : undefined;

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productType: products.productType,
      trackUnits: products.trackUnits,
      brandId: products.brandId,
      brandName: brands.name,
      categoryId: products.categoryId,
      // The intake line-item dropdown lists leaf categories, so return the
      // product's own category slug (legacy text column as fallback).
      categorySlug: sql`COALESCE(${categories.slug}, ${products.category})`,
      variantId: productVariants.id,
      variantName: productVariants.name,
      sku: productVariants.sku,
      sellingPrice: productVariants.sellingPrice,
      costPrice: productVariants.costPrice,
      costCode: sql`COALESCE(${productVariants.costCode}, ${products.costCode})`,
      dCode: sql`COALESCE(${productVariants.dCode}, ${products.dCode})`,
      sellCode: sql`COALESCE(${productVariants.sellCode}, ${products.sellCode})`,
      quantity: productVariants.quantity,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .where(where?.length === 1 ? where[0] : where?.length ? or(...where) : undefined)
    .orderBy(desc(products.createdAt))
    .limit(50);

  return NextResponse.json(rows);
}
