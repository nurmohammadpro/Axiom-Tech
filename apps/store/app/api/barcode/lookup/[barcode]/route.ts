import { NextRequest, NextResponse } from "next/server";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, inventoryUnits, products, productVariants } from "@/db/schema";
import { getBatchById, isUnitSellable } from "@/lib/fifo";
import { isUnitTracked } from "@/lib/product-tracking";

export const dynamic = "force-dynamic";

type UnitRow = {
  id: string;
  variantId: number;
  barcode: string | null;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  status: string;
  currentPrice: number | null;
  batchId: string | null;
  locationId: string | null;
};

/** Category slug of a product's taxonomy category ("pre-owned-phones", ...). */
async function categorySlugFor(productId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: categories.slug })
    .from(categories)
    .innerJoin(products, eq(products.categoryId, categories.id))
    .where(eq(products.id, productId))
    .limit(1);
  return row?.slug ?? null;
}

async function unitLookupResponse(unit: UnitRow) {
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, unit.variantId))
    .limit(1);
  if (!variant) return null;
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, variant.productId))
    .limit(1);
  if (!product) return null;

  // FIFO state so the POS can block a scan from a newer, still-locked batch.
  const unitBatch = unit.batchId ? await getBatchById(db, unit.batchId) : null;
  const { sellable, oldest, oldestAvailable } = await isUnitSellable(db, unit);

  return {
    match: "unit" as const,
    unit: {
      id: unit.id,
      imei1: unit.imei1,
      imei2: unit.imei2,
      serialNumber: unit.serialNumber,
      status: unit.status,
      currentPrice: unit.currentPrice,
    },
    batch: unitBatch
      ? {
          id: unitBatch.id,
          batchNumber: unitBatch.batchNumber,
          receivedAt: unitBatch.receivedAt,
          unitCost: unitBatch.unitCost,
        }
      : null,
    sellable,
    blockedByBatch:
      !sellable && oldest ? { batchNumber: oldest.batchNumber, available: oldestAvailable } : null,
    variant: {
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      attribute: variant.attribute,
      sellingPrice: unit.currentPrice ?? variant.sellingPrice,
    },
    product: {
      id: product.id,
      name: product.name,
      productType: product.productType,
      warrantyPolicyId: product.warrantyPolicyId,
      categorySlug: await categorySlugFor(product.id),
    },
    requiresUnit: isUnitTracked(product),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ barcode: string }> },
) {
  const { barcode } = await params;
  if (!barcode) {
    return NextResponse.json({ error: "Missing barcode" }, { status: 400 });
  }

  const exact = barcode.replace(/[\s-]/g, "").toUpperCase();

  // Serialized unit barcode takes priority: a unit scan maps to exactly one item.
  const [unitByBarcode] = await db
    .select({
      id: inventoryUnits.id,
      variantId: inventoryUnits.variantId,
      barcode: inventoryUnits.barcode,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      status: inventoryUnits.status,
      currentPrice: inventoryUnits.currentPrice,
      batchId: inventoryUnits.batchId,
      locationId: inventoryUnits.locationId,
    })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.barcode, barcode))
    .limit(1);

  if (unitByBarcode) {
    const payload = await unitLookupResponse(unitByBarcode);
    if (payload) return NextResponse.json(payload);
  }

  // IMEI / serial lookup for serialized stock units.
  const [unitByImei] = await db
    .select({
      id: inventoryUnits.id,
      variantId: inventoryUnits.variantId,
      barcode: inventoryUnits.barcode,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      status: inventoryUnits.status,
      currentPrice: inventoryUnits.currentPrice,
      batchId: inventoryUnits.batchId,
      locationId: inventoryUnits.locationId,
    })
    .from(inventoryUnits)
    .where(
      or(
        eq(inventoryUnits.imei1, barcode),
        eq(inventoryUnits.imei2, barcode),
        eq(inventoryUnits.serialNumber, barcode),
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei1}, ' ', ''), '-', '')) = ${exact}`,
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei2}, ' ', ''), '-', '')) = ${exact}`,
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.serialNumber}, ' ', ''), '-', '')) = ${exact}`,
      ),
    )
    .limit(1);

  if (unitByImei) {
    const payload = await unitLookupResponse(unitByImei);
    if (payload) return NextResponse.json(payload);
  }

  // Fall back to the variant's product barcode — but the same printed label
  // barcode can exist on several variants (legacy duplicate EANs), since the
  // old EAN generator had a ~10k item space. Return every match and let the
  // seller pick the product instead of silently guessing.
  const variantMatches = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.barcode, barcode));

  if (variantMatches.length > 1) {
    const candidates = await Promise.all(
      variantMatches.map(async (v) => {
        const [p] = await db.select().from(products).where(eq(products.id, v.productId)).limit(1);
        return {
          variantId: v.id,
          variantName: v.name,
          sku: v.sku,
          sellingPrice: v.sellingPrice,
          productName: p?.name ?? "",
          productType: p?.productType ?? "new",
          requiresUnit: !p || isUnitTracked(p),
          warrantyPolicyId: p?.warrantyPolicyId ?? null,
        };
      }),
    );
    return NextResponse.json({ match: "multi", candidates });
  }

  const [variant] = variantMatches;

  if (variant) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, variant.productId))
      .limit(1);

    return NextResponse.json({
      match: "variant",
      variant: {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        attribute: variant.attribute,
        sellingPrice: variant.sellingPrice,
        quantity: variant.quantity,
      },
      product: {
        id: product.id,
        name: product.name,
        productType: product.productType,
        warrantyPolicyId: product.warrantyPolicyId,
        categorySlug: await categorySlugFor(product.id),
      },
      requiresUnit: isUnitTracked(product),
    });
  }

  return NextResponse.json({ match: "none" }, { status: 200 });
}
