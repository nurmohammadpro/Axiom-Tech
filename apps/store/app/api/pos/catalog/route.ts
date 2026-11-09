import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  brands,
  categories,
  inventoryBalances,
  inventoryBatches,
  inventoryUnits,
  products,
  productVariants,
  warrantyPolicies,
} from "@/db/schema";
import { batchLocKey, fifoEnforcedVariantIds, oldestOpenBatchIds } from "@/lib/fifo";
import { isUnitTracked } from "@/lib/product-tracking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  // When a location is selected, availability reflects only that warehouse.
  const location = searchParams.get("location")?.trim();

  const conditions = [eq(productVariants.active, true), eq(products.publishStatus, "published")];
  if (category) {
    conditions.push(eq(categories.name, category));
  }
  // Track whether the search term looks like an IMEI/serial (digits only, 15+ chars)
  const isImeiSearch = /^\d{15,}$/.test(search?.replace(/[\s-]/g, "") ?? "");

  if (search) {
    if (isImeiSearch) {
      // IMEI/serial search: find variants that have an inventory unit matching the IMEI
      const exact = search.replace(/[\s-]/g, "").toUpperCase();
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${inventoryUnits}
          WHERE ${inventoryUnits.variantId} = ${productVariants.id}
            AND ${inventoryUnits.status} = 'available'
            AND (
              ${inventoryUnits.imei1} = ${search}
              OR ${inventoryUnits.imei2} = ${search}
              OR ${inventoryUnits.serialNumber} = ${search}
              OR UPPER(REPLACE(REPLACE(${inventoryUnits.imei1}, ' ', ''), '-', '')) = ${exact}
              OR UPPER(REPLACE(REPLACE(${inventoryUnits.imei2}, ' ', ''), '-', '')) = ${exact}
              OR UPPER(REPLACE(REPLACE(${inventoryUnits.serialNumber}, ' ', ''), '-', '')) = ${exact}
            )
        )`,
      );
    } else {
      conditions.push(
        sql`(${products.name} ILIKE ${`%${search}%`} OR ${productVariants.sku} ILIKE ${`%${search}%`} OR ${productVariants.name} ILIKE ${`%${search}%`} OR ${productVariants.barcode} ILIKE ${`%${search}%`})`,
      );
    }
  }

  const variants = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      attribute: productVariants.attribute,
      sellingPrice: productVariants.sellingPrice,
      quantity: productVariants.quantity,
      productType: products.productType,
      trackUnits: products.trackUnits,
      warrantyPolicyId: products.warrantyPolicyId,
      warrantyName: warrantyPolicies.name,
      warrantyDurationValue: warrantyPolicies.durationValue,
      warrantyDurationUnit: warrantyPolicies.durationUnit,
      category: categories.name,
      categorySlug: categories.slug,
      brand: brands.name,
      bg: products.bgColor,
      costCode: productVariants.costCode,
      dCode: productVariants.dCode,
      sellCode: productVariants.sellCode,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(warrantyPolicies, eq(products.warrantyPolicyId, warrantyPolicies.id))
    .where(and(...conditions))
    .orderBy(desc(products.createdAt));

  // Available units (used by client-side search + the batch-aware unit panel).
  // Ordered oldest batch first so the panel reads in sell order, and scoped to
  // the selected warehouse so it matches the availability count.
  const unitRows = await db
    .select({
      variantId: inventoryUnits.variantId,
      id: inventoryUnits.id,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      unitLocation: inventoryUnits.locationId,
      batchId: inventoryBatches.id,
      batchNumber: inventoryBatches.batchNumber,
      batchReceivedAt: inventoryBatches.receivedAt,
      unitCost: inventoryBatches.unitCost,
      currentPrice: inventoryUnits.currentPrice,
      costCode: inventoryUnits.costCode,
      dCode: inventoryUnits.dCode,
      sellCode: inventoryUnits.sellCode,
      color: inventoryUnits.color,
    })
    .from(inventoryUnits)
    .leftJoin(inventoryBatches, eq(inventoryUnits.batchId, inventoryBatches.id))
    .where(
      location
        ? and(eq(inventoryUnits.status, "available"), eq(inventoryUnits.locationId, location))
        : eq(inventoryUnits.status, "available"),
    )
    .orderBy(asc(inventoryBatches.receivedAt), asc(inventoryUnits.receivedAt));

  // Group units by variant
  const unitsByVariant = new Map<number, typeof unitRows>();
  for (const row of unitRows) {
    const arr = unitsByVariant.get(row.variantId) ?? [];
    arr.push(row);
    unitsByVariant.set(row.variantId, arr);
  }

  // Oldest open batch per variant+warehouse — the one that must sell first.
  // Only official-category variants are FIFO-locked; the rest sell freely.
  const allVariantIds = [...new Set(variants.map((v) => v.variantId))];
  const oldestByKey = await oldestOpenBatchIds(db, allVariantIds);
  const enforcedVariants = await fifoEnforcedVariantIds(db, allVariantIds);

  const unitCounts = await db
    .select({ variantId: inventoryUnits.variantId, count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(
      location
        ? and(eq(inventoryUnits.status, "available"), eq(inventoryUnits.locationId, location))
        : eq(inventoryUnits.status, "available"),
    )
    .groupBy(inventoryUnits.variantId);

  const countByVariant = new Map(unitCounts.map((r) => [r.variantId, r.count]));

  // Quantity-based items (accessories) read their stock from per-location balances.
  let balanceByVariant = new Map<number, number>();
  if (location) {
    const balances = await db
      .select({
        variantId: inventoryBalances.variantId,
        availableQty: inventoryBalances.availableQty,
      })
      .from(inventoryBalances)
      .where(eq(inventoryBalances.locationId, location));
    balanceByVariant = new Map(balances.map((r) => [r.variantId, r.availableQty]));
  }

  const items = variants.map((v) => {
    const requiresUnit = isUnitTracked(v);
    const available = requiresUnit
      ? (countByVariant.get(v.variantId) ?? 0)
      : location
        ? (balanceByVariant.get(v.variantId) ?? 0)
        : (v.quantity ?? 0);
    const warranty =
      v.warrantyName && v.warrantyDurationValue
        ? `${v.warrantyDurationValue} ${v.warrantyDurationUnit}`
        : null;

    const units = (unitsByVariant.get(v.variantId) ?? []).map((u) => {
      const enforced = enforcedVariants.has(v.variantId);
      const oldestId = enforced
        ? (oldestByKey.get(batchLocKey(v.variantId, u.unitLocation)) ?? null)
        : null;
      const sellable = !enforced || (u.batchId ? u.batchId === oldestId : oldestId === null);
      return {
        id: u.id,
        imei1: u.imei1,
        imei2: u.imei2,
        serialNumber: u.serialNumber,
        batchId: u.batchId,
        batchNumber: u.batchNumber,
        batchReceivedAt: u.batchReceivedAt,
        unitCost: u.unitCost,
        currentPrice: u.currentPrice,
        costCode: u.costCode,
        dCode: u.dCode,
        sellCode: u.sellCode,
        color: u.color,
        location: u.unitLocation,
        sellable,
      };
    });

    // Per-batch summary for the POS unit panel. Units arrive oldest-batch first,
    // so insertion order matches sell order.
    const batchMap = new Map<
      string,
      {
        id: string | null;
        batchNumber: string;
        receivedAt: Date | null;
        unitCost: number | null;
        available: number;
        locked: boolean;
      }
    >();
    let sellableAvailable = 0;
    for (const u of units) {
      if (u.sellable) sellableAvailable += 1;
      const key = u.batchId ?? "__unbatched__";
      let entry = batchMap.get(key);
      if (!entry) {
        entry = {
          id: u.batchId,
          batchNumber: u.batchNumber ?? "Unbatched",
          receivedAt: u.batchReceivedAt,
          unitCost: u.unitCost,
          available: 0,
          locked: !u.sellable,
        };
        batchMap.set(key, entry);
      }
      entry.available += 1;
    }

    return {
      ...v,
      requiresUnit,
      available,
      sellableAvailable,
      warranty,
      units,
      batches: [...batchMap.values()],
    };
  });

  return NextResponse.json(items);
}
