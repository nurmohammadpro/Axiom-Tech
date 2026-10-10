import { db } from "@/db";
import {
  brands,
  categories,
  products,
  productVariants,
  productSpecs,
  inventoryUnits,
  unitSpecs,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq, desc, inArray, sql } from "drizzle-orm";
import { isUnitTracked } from "@/lib/product-tracking";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  let conditions = undefined;
  if (search) {
    conditions = sql`${products.name} ILIKE ${`%${search}%`} OR ${productVariants.sku} ILIKE ${`%${search}%`} OR ${productVariants.barcode} ILIKE ${`%${search}%`} OR ${brands.name} ILIKE ${`%${search}%`} OR ${categories.name} ILIKE ${`%${search}%`}`;
  }

  const imei1Sub = sql`(SELECT imei_1 FROM inventory_units WHERE variant_id = ${productVariants.id} AND status = 'available' LIMIT 1)`;
  const imei2Sub = sql`(SELECT imei_2 FROM inventory_units WHERE variant_id = ${productVariants.id} AND status = 'available' LIMIT 1)`;
  const serialSub = sql`(SELECT serial_number FROM inventory_units WHERE variant_id = ${productVariants.id} AND status = 'available' LIMIT 1)`;
  const batteryHealthSub = sql`(SELECT battery_health FROM inventory_units WHERE variant_id = ${productVariants.id} AND status = 'available' LIMIT 1)`;

  // Count available serialized units per variant
  const unitCounts = await db
    .select({ variantId: inventoryUnits.variantId, count: sql<number>`count(*)::int` })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"))
    .groupBy(inventoryUnits.variantId);

  const stockByVariant = new Map(unitCounts.map((r) => [r.variantId, r.count]));

  // Per-unit identities for unit-tracked stock — the labels page prints one
  // label per physical unit, with the unit's serial/IMEI or generated PSU-
  // code as the value.
  const unitRows = await db
    .select({
      variantId: inventoryUnits.variantId,
      id: inventoryUnits.id,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      unitCode: inventoryUnits.unitCode,
      barcode: inventoryUnits.barcode,
      identityType: inventoryUnits.identityType,
      batteryHealth: inventoryUnits.batteryHealth,
      currentPrice: inventoryUnits.currentPrice,
      costCode: inventoryUnits.costCode,
      dCode: inventoryUnits.dCode,
      sellCode: inventoryUnits.sellCode,
      color: inventoryUnits.color,
    })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"))
    .orderBy(asc(inventoryUnits.receivedAt), asc(inventoryUnits.id));

  // Per-unit specs captured at intake (RAM/Storage/Color) — these are the
  // authoritative values for the unit's label, winning over the catalog-level
  // specs.
  const unitIds = unitRows.map((u) => u.id);
  const unitSpecRows = unitIds.length
    ? await db
        .select({
          unitId: unitSpecs.unitId,
          label: unitSpecs.label,
          value: unitSpecs.value,
        })
        .from(unitSpecs)
        .where(inArray(unitSpecs.unitId, unitIds))
    : [];
  const specsByUnit = new Map<string, { label: string; value: string }[]>();
  for (const s of unitSpecRows) {
    const arr = specsByUnit.get(s.unitId) ?? [];
    arr.push({ label: s.label, value: s.value });
    specsByUnit.set(s.unitId, arr);
  }

  const unitsByVariant = new Map<
    number,
    (Omit<(typeof unitRows)[number], "variantId"> & { specs: { label: string; value: string }[] })[]
  >();
  for (const u of unitRows) {
    const { variantId, ...unit } = u;
    const arr = unitsByVariant.get(variantId) ?? [];
    arr.push({ ...unit, specs: specsByUnit.get(unit.id) ?? [] });
    unitsByVariant.set(variantId, arr);
  }

  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      name: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      sellingPrice: productVariants.sellingPrice,
      costPrice: productVariants.costPrice,
      costCode: sql`COALESCE(${productVariants.costCode}, ${products.costCode})`,
      dCode: sql<string | null>`COALESCE(${productVariants.dCode}, ${products.dCode})`,
      sellCode: sql`COALESCE(${productVariants.sellCode}, ${products.sellCode})`,
      brand: brands.name,
      category: categories.name,
      productType: products.productType,
      trackUnits: products.trackUnits,
      active: productVariants.active,
      variantQuantity: productVariants.quantity,
      attribute: productVariants.attribute,
      imei1: imei1Sub,
      imei2: imei2Sub,
      serialNumber: serialSub,
      batteryHealth: batteryHealthSub,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(conditions)
    .orderBy(desc(products.createdAt));

  // Device specs for the labels page: variant attributes (Storage, Color…) are
  // the per-variant source; product_specs rows (RAM etc.) are product-level.
  // Merged per variant, case-insensitive by label with the variant value winning.
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const specRows = productIds.length
    ? await db.select().from(productSpecs).where(inArray(productSpecs.productId, productIds))
    : [];
  const specsByProduct = new Map<string, { label: string; value: string }[]>();
  for (const s of specRows) {
    const arr = specsByProduct.get(s.productId) ?? [];
    arr.push({ label: s.label, value: s.value });
    specsByProduct.set(s.productId, arr);
  }

  const mergeSpecs = (
    productId: string,
    attribute: unknown,
  ): { label: string; value: string }[] => {
    const merged: { label: string; value: string }[] = [];
    const seen = new Set<string>();
    const push = (label: unknown, value: unknown) => {
      const l = String(label ?? "").trim();
      const v = String(value ?? "").trim();
      if (!l || !v) return;
      const k = l.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      merged.push({ label: l, value: v });
    };
    const attrs = Array.isArray(attribute) ? attribute : [];
    for (const a of attrs) push(a?.name, a?.value);
    for (const s of specsByProduct.get(productId) ?? []) push(s.label, s.value);
    return merged;
  };

  // Compute stock: plain accessories use variant.quantity, unit-tracked
  // products (devices and tracked accessories) use available unit count.
  const result = rows
    .map((r) => {
      const unitCounted = isUnitTracked(r);
      const stock = unitCounted ? (stockByVariant.get(r.variantId) ?? 0) : (r.variantQuantity ?? 0);
      const units = unitsByVariant.get(r.variantId) ?? [];
      const specs = mergeSpecs(r.productId, r.attribute);
      const { attribute: _attribute, ...rest } = r;
      return { ...rest, stock, units, specs };
    })
    .filter((r) => r.stock > 0);

  return NextResponse.json(result);
}
