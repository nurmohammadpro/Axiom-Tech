import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, txDb } from "@/db";
import { getScope } from "@/lib/authz";
import { isUnitTracked } from "@/lib/product-tracking";
import {
  barcodes,
  brands,
  categories,
  inventory,
  inventoryBatches,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  orderItems,
  products,
  productVariants,
  saleLines,
  warrantyPolicies,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const barcodeSub = sql<
    string | null
  >`(SELECT barcode FROM inventory_units WHERE variant_id = product_variants.id AND status = 'available' LIMIT 1)`;
  const imei1Sub = sql<
    string | null
  >`(SELECT imei_1 FROM inventory_units WHERE variant_id = product_variants.id AND status = 'available' LIMIT 1)`;
  const imei2Sub = sql<
    string | null
  >`(SELECT imei_2 FROM inventory_units WHERE variant_id = product_variants.id AND status = 'available' LIMIT 1)`;
  const serialSub = sql<
    string | null
  >`(SELECT serial_number FROM inventory_units WHERE variant_id = product_variants.id AND status = 'available' LIMIT 1)`;
  const unitCodeSub = sql<
    string | null
  >`(SELECT unit_code FROM inventory_units WHERE variant_id = product_variants.id AND status = 'available' LIMIT 1)`;
  // Every available unit's identity (IMEI 1/2, serial, unit code) concatenated
  // into one searchable string — the LIMIT 1 subqueries above only carry the
  // first unit, so searching any other unit's IMEI found nothing.
  const identitiesSub = sql<string | null>`
    (SELECT string_agg(concat_ws(' ', imei_1, imei_2, serial_number, unit_code), ' ')
     FROM inventory_units
     WHERE variant_id = product_variants.id AND status = 'available')`;

  const variants = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      attribute: productVariants.attribute,
      costPrice: productVariants.costPrice,
      sellingPrice: productVariants.sellingPrice,
      costCode: productVariants.costCode,
      dCode: productVariants.dCode,
      sellCode: productVariants.sellCode,
      quantity: productVariants.quantity,
      active: productVariants.active,
      productType: products.productType,
      trackUnits: products.trackUnits,
      publishStatus: products.publishStatus,
      inStock: products.inStock,
      lowStockThreshold: inventory.lowStockThreshold,
      location: inventory.location,
      warrantyName: warrantyPolicies.name,
      warrantyDurationValue: warrantyPolicies.durationValue,
      warrantyDurationUnit: warrantyPolicies.durationUnit,
      category: categories.name,
      brand: brands.name,
      barcode: barcodeSub,
      imei1: imei1Sub,
      imei2: imei2Sub,
      serialNumber: serialSub,
      unitCode: unitCodeSub,
      unitIdentities: identitiesSub,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(inventory, eq(inventory.sku, productVariants.sku))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(warrantyPolicies, eq(products.warrantyPolicyId, warrantyPolicies.id))
    .where(
      search
        ? or(
            ilike(products.name, `%${search}%`),
            ilike(productVariants.sku, `%${search}%`),
            ilike(productVariants.name, `%${search}%`),
            ilike(productVariants.costCode, `%${search}%`),
            ilike(productVariants.dCode, `%${search}%`),
            ilike(productVariants.sellCode, `%${search}%`),
            ilike(barcodeSub, `%${search}%`),
            ilike(imei1Sub, `%${search}%`),
            ilike(imei2Sub, `%${search}%`),
            ilike(serialSub, `%${search}%`),
            ilike(identitiesSub, `%${search}%`),
          )
        : undefined,
    )
    .orderBy(desc(products.createdAt));

  const unitCounts = await db
    .select({ variantId: inventoryUnits.variantId, count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"))
    .groupBy(inventoryUnits.variantId);

  const countByVariant = new Map(unitCounts.map((r) => [r.variantId, r.count]));

  // Value serialized stock at its recorded acquisition cost. Older units without
  // a snapshot fall back to the current variant cost and are flagged below.
  const unitValueRows = await db
    .select({
      variantId: inventoryUnits.variantId,
      costValue: sql<number>`coalesce(sum(coalesce(inventory_units.acquisition_cost, inventory_batches.unit_cost, product_variants.cost_price, 0)), 0)::int`,
      estimatedUnits: sql<number>`count(*) filter (where inventory_units.acquisition_cost is null)::int`,
    })
    .from(inventoryUnits)
    .innerJoin(productVariants, eq(productVariants.id, inventoryUnits.variantId))
    .leftJoin(inventoryBatches, eq(inventoryBatches.id, inventoryUnits.batchId))
    .where(
      scope.isScoped && scope.storeLocation
        ? and(
            eq(inventoryUnits.status, "available"),
            eq(inventoryUnits.locationId, scope.storeLocation),
          )
        : eq(inventoryUnits.status, "available"),
    )
    .groupBy(inventoryUnits.variantId);

  const valueByVariant = new Map(unitValueRows.map((r) => [r.variantId, r.costValue]));
  const estimatedUnitsByVariant = new Map(
    unitValueRows.map((r) => [r.variantId, r.estimatedUnits]),
  );

  // Fetch all units per variant for expandable IMEI display (with status column)
  // We return both available and sold so the Status column can distinguish "In Stock" vs "Sold".
  const allUnits = await db
    .select({
      variantId: inventoryUnits.variantId,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      status: inventoryUnits.status,
      locationId: inventoryUnits.locationId,
    })
    .from(inventoryUnits)
    .orderBy(inventoryUnits.status, inventoryUnits.createdAt);

  const unitsByVariant = new Map<
    number,
    {
      imei1: string | null;
      imei2: string | null;
      serialNumber: string | null;
      status: string;
      locationId: string | null;
    }[]
  >();
  for (const row of allUnits) {
    // Respect warehouse scoping for non-owners: only show their warehouse's units in the expandable list.
    if (
      scope.isScoped &&
      scope.storeLocation &&
      row.locationId &&
      row.locationId !== scope.storeLocation
    ) {
      continue;
    }
    const arr = unitsByVariant.get(row.variantId) ?? [];
    arr.push({
      imei1: row.imei1,
      imei2: row.imei2,
      serialNumber: row.serialNumber,
      status: row.status,
      locationId: row.locationId,
    });
    unitsByVariant.set(row.variantId, arr);
  }

  // Per-location breakdown: available serialized units per (variant, location)
  // and quantity balances per (variant, location).
  const unitByLocation = await db
    .select({
      variantId: inventoryUnits.variantId,
      locationId: inventoryUnits.locationId,
      count: sql<number>`count(*)::int`,
    })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"))
    .groupBy(inventoryUnits.variantId, inventoryUnits.locationId);
  const balanceByLocation = await db
    .select({
      variantId: inventoryBalances.variantId,
      locationId: inventoryBalances.locationId,
      availableQty: inventoryBalances.availableQty,
    })
    .from(inventoryBalances);

  const unitsPerVariantLocation = new Map<string, number>();
  for (const r of unitByLocation) {
    unitsPerVariantLocation.set(`${r.variantId}|${r.locationId}`, r.count);
  }
  const balancePerVariantLocation = new Map<string, number>();
  for (const r of balanceByLocation) {
    balancePerVariantLocation.set(`${r.variantId}|${r.locationId}`, r.availableQty);
  }

  const items = variants.map((v) => {
    const requiresUnit = isUnitTracked(v);
    const available = requiresUnit ? (countByVariant.get(v.variantId) ?? 0) : (v.quantity ?? 0);
    const costValue = requiresUnit
      ? (valueByVariant.get(v.variantId) ?? available * (v.costPrice ?? 0))
      : available * (v.costPrice ?? 0);
    const estimatedUnits = requiresUnit ? (estimatedUnitsByVariant.get(v.variantId) ?? 0) : 0;
    const warranty =
      v.warrantyName && v.warrantyDurationValue
        ? `${v.warrantyDurationValue} ${v.warrantyDurationUnit}`
        : null;

    // Aggregate per-location counts from both sources (unit-based and quantity-based).
    const byLocationMap = new Map<string, number>();

    // Only get location keys for THIS variant, not all variants
    const currentVariantPrefix = `${v.variantId}|`;
    const locKeys = new Set([
      ...[...unitsPerVariantLocation.keys()].filter((key) => key.startsWith(currentVariantPrefix)),
      ...[...balancePerVariantLocation.keys()].filter((key) =>
        key.startsWith(currentVariantPrefix),
      ),
    ]);

    for (const key of locKeys) {
      const [, locationId] = key.split("|");
      if (!locationId) continue;
      if (requiresUnit) {
        byLocationMap.set(
          locationId,
          (byLocationMap.get(locationId) ?? 0) + (unitsPerVariantLocation.get(key) ?? 0),
        );
      } else {
        byLocationMap.set(
          locationId,
          (byLocationMap.get(locationId) ?? 0) + (balancePerVariantLocation.get(key) ?? 0),
        );
      }
    }

    let byLocation = [...byLocationMap.entries()].map(([location, qty]) => ({
      location,
      available: qty,
    }));
    // Fall back to the legacy aggregate row so pre-location data still shows up.
    if (byLocation.length === 0 && v.location) {
      byLocation = [{ location: v.location, available }];
    }
    byLocation.sort((a, b) => a.location.localeCompare(b.location));

    // Managers/salesmen only see their own warehouse's stock.
    if (scope.isScoped && scope.storeLocation) {
      byLocation = byLocation.filter((b) => b.location === scope.storeLocation);
    }

    const scopedAvailable = scope.isScoped ? (byLocation[0]?.available ?? 0) : available;

    return {
      ...v,
      requiresUnit,
      available: scopedAvailable,
      costValue,
      retailValue: scopedAvailable * (v.sellingPrice ?? 0),
      estimatedUnits,
      warranty,
      byLocation,
      units: unitsByVariant.get(v.variantId) ?? [],
    };
  });

  return NextResponse.json(items);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  // Toggle a variant's active flag (row-level activate/deactivate).
  if (typeof body.variantId === "number" && typeof body.active === "boolean") {
    const [updated] = await db
      .update(productVariants)
      .set({ active: body.active, updatedAt: new Date() })
      .where(eq(productVariants.id, body.variantId))
      .returning({ variantId: productVariants.id, active: productVariants.active });
    if (!updated) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    return NextResponse.json(updated);
  }

  // Inline edit variant fields (costPrice, sellingPrice, costCode, sellCode).
  if (typeof body.variantId === "number") {
    const fields: Record<string, unknown> = {};
    if ("costPrice" in body) fields.costPrice = body.costPrice === "" ? null : body.costPrice;
    if ("sellingPrice" in body) fields.sellingPrice = body.sellingPrice;
    if ("costCode" in body) fields.costCode = body.costCode === "" ? null : body.costCode;
    if ("dCode" in body) fields.dCode = body.dCode === "" ? null : body.dCode;
    if ("sellCode" in body) fields.sellCode = body.sellCode === "" ? null : body.sellCode;
    if ("quantity" in body) fields.quantity = body.quantity;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }
    fields.updatedAt = new Date();
    const [updated] = await db
      .update(productVariants)
      .set(fields)
      .where(eq(productVariants.id, body.variantId))
      .returning({ variantId: productVariants.id });
    if (!updated) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    return NextResponse.json(updated);
  }

  // Legacy: update the aggregate inventory row (quantity / threshold / location).
  const { id, quantity, lowStockThreshold, location } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [updated] = await db
    .update(inventory)
    .set({ quantity, lowStockThreshold, location, updatedAt: new Date() })
    .where(eq(inventory.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const variantId = body.variantId;
  if (typeof variantId !== "number") {
    return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
  }

  const [variant] = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      productId: productVariants.productId,
    })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);
  if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  // Guard: never hard-delete a variant with sale history or received serialized units.
  const [sold] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(saleLines)
    .where(eq(saleLines.variantId, variantId));
  const [units] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.variantId, variantId));
  if (sold.count > 0 || units.count > 0) {
    return NextResponse.json(
      { error: "This variant has sales or received units — deactivate it instead of deleting" },
      { status: 409 },
    );
  }

  const [orders] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(eq(orderItems.productId, variant.productId));
  if (orders.count > 0) {
    return NextResponse.json(
      { error: "This product has order history and cannot be deleted" },
      { status: 409 },
    );
  }

  const { productDeleted } = await txDb.transaction(async (tx) => {
    await tx.delete(barcodes).where(eq(barcodes.variantId, variantId));
    await tx.delete(inventory).where(eq(inventory.sku, variant.sku));
    await tx.delete(inventoryBalances).where(eq(inventoryBalances.variantId, variantId));
    // Movements reference the variant without a cascade; clear them so variants that
    // had received stock (units already removed) can still be deleted.
    await tx.delete(inventoryMovements).where(eq(inventoryMovements.variantId, variantId));
    await tx.delete(productVariants).where(eq(productVariants.id, variantId));

    // variant_attribute_values cascades on variant delete.

    const remaining = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, variant.productId))
      .limit(1);
    if (remaining.length > 0) return { productDeleted: false };

    await tx.delete(products).where(eq(products.id, variant.productId));
    return { productDeleted: true };
  });

  return NextResponse.json({ deleted: true, productDeleted });
}
