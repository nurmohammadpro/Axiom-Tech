export const dynamic = "force-dynamic";

import { db } from "@/db";
import {
  products,
  brands,
  categories,
  productVariants,
  inventoryUnits,
  inventoryBalances,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { isUnitTracked } from "@/lib/product-tracking";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brand = searchParams.get("brand");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const withStock = searchParams.get("withStock") === "1";

  const conditions = [];
  if (brand) {
    const brandSlug = brand.replace(/\+/g, " ");
    const sub = db.select({ id: brands.id }).from(brands).where(eq(brands.slug, brandSlug));
    conditions.push(sql`${products.brandId} = ANY(ARRAY(${sub}))`);
  }
  if (category) {
    conditions.push(eq(products.categoryId, Number(category)));
  }
  if (search) {
    conditions.push(sql`${products.name} ILIKE ${`%${search}%`}`);
  }

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      brand: brands.name,
      category: categories.name,
      price: products.price,
      originalPrice: products.originalPrice,
      short: products.short,
      description: products.description,
      bgColor: products.bgColor,
      textColor: products.textColor,
      inStock: products.inStock,
      images: products.images,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined);

  // Dashboard catalog needs REAL on-hand stock; the storefront doesn't, so this is
  // opt-in via ?withStock=1 to avoid extra queries on every storefront listing.
  if (!withStock) return NextResponse.json(rows);

  const productIds = rows.map((r) => r.id);

  const variants = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      quantity: productVariants.quantity,
      sku: productVariants.sku,
      productType: products.productType,
      trackUnits: products.trackUnits,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(inArray(productVariants.productId, productIds));

  const unitCounts = await db
    .select({ variantId: inventoryUnits.variantId, count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"))
    .groupBy(inventoryUnits.variantId);

  const balanceSums = await db
    .select({
      variantId: inventoryBalances.variantId,
      total: sql<number>`coalesce(sum(${inventoryBalances.availableQty}), 0)::int`,
    })
    .from(inventoryBalances)
    .groupBy(inventoryBalances.variantId);

  const unitsByVariant = new Map(unitCounts.map((r) => [r.variantId, r.count]));
  const balanceByVariant = new Map(balanceSums.map((r) => [r.variantId, r.total]));
  const skuByProduct = new Map<string, string>();
  for (const v of variants) {
    if (v.sku && !skuByProduct.has(v.productId)) skuByProduct.set(v.productId, v.sku);
  }

  // Serialized products (phones) count physically-received units; quantity-based
  // products (accessories) count their per-location balances (falling back to the
  // variant's declared quantity).
  const stockByProduct = new Map<string, number>();
  for (const v of variants) {
    const requiresUnit = isUnitTracked(v);
    const available = requiresUnit
      ? (unitsByVariant.get(v.id) ?? 0)
      : (balanceByVariant.get(v.id) ?? v.quantity ?? 0);
    stockByProduct.set(v.productId, (stockByProduct.get(v.productId) ?? 0) + available);
  }

  const enriched = rows.map((r) => {
    const available = stockByProduct.get(r.id) ?? 0;
    const stockStatus = available <= 0 ? "out" : available < 5 ? "low" : "ok";
    return { ...r, available, stockStatus, sku: skuByProduct.get(r.id) };
  });

  return NextResponse.json(enriched);
}
