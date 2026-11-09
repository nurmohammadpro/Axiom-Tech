import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { txDb, db } from "@/db";
import { getScope } from "@/lib/authz";
import {
  auditLog,
  inventory,
  inventoryBalances,
  inventoryBatches,
  inventoryMovements,
  inventoryUnits,
  locations,
  productVariants,
  purchaseOrderItems,
  purchaseOrders,
  unitSpecs,
  productSpecs,
} from "@/db/schema";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { nextBatchNumber } from "@/lib/identifiers";
import { generateUnitCode } from "@/lib/barcode";
import { pgErrorCode } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

async function resolveLocation(locationId?: string): Promise<string> {
  if (locationId) {
    const [loc] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.name, locationId))
      .limit(1);
    if (loc) return loc.name;
  }
  const [def] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.isDefault, true))
    .limit(1);
  if (!def?.name) throw new Error("No default warehouse configured");
  return def.name;
}

interface ReceiveUnit {
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  barcode?: string;
  conditionGrade?: string;
  batteryHealth?: number;
  acquisitionCost?: number;
  currentPrice?: number;
  specs?: Record<string, string>;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  color?: string;
}

interface ReceiveItem {
  variantId: number;
  /** For plain accessories: quantity to receive (no unit rows) */
  quantity?: number;
  /** For devices and tracked accessories: per-unit intake. A unit with no
   * IMEI and no serial gets a system-generated PSU- identity. */
  units?: ReceiveUnit[];
}

interface ReceiveBody {
  items: ReceiveItem[];
  locationId?: string;
  /** Optional PO ID to link receiving and update qtyReceived */
  purchaseOrderId?: string;
}

/** Treat "", whitespace and null like undefined so sloppy clients can't crash the insert. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ReceiveBody;
  const scope = await getScope(request.headers);
  const actorId = scope.userId;

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: "items array is required and must not be empty" },
      { status: 400 },
    );
  }

  const locationId = scope.isScoped
    ? (scope.storeLocation ?? (await resolveLocation(body.locationId)))
    : await resolveLocation(body.locationId);

  // Validate all variants exist
  for (const item of body.items) {
    if (!item.variantId) {
      return NextResponse.json({ error: "variantId is required for each item" }, { status: 400 });
    }
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, item.variantId))
      .limit(1);
    if (!variant) {
      return NextResponse.json({ error: `Variant ${item.variantId} not found` }, { status: 404 });
    }
  }

  // Validate IMEIs for device items
  for (const item of body.items) {
    if (item.units && item.units.length > 0) {
      const normalized = item.units.map((u) => ({
        ...u,
        imei1: u.imei1 ? normalizeImei(u.imei1) : undefined,
        imei2: u.imei2 ? normalizeImei(u.imei2) : undefined,
        serialNumber: str(u.serialNumber),
        barcode: str(u.barcode),
        conditionGrade: str(u.conditionGrade),
        batteryHealth: num(u.batteryHealth),
        acquisitionCost: num(u.acquisitionCost),
        currentPrice: num(u.currentPrice),
        costCode: str(u.costCode),
        dCode: str(u.dCode),
        sellCode: str(u.sellCode),
        color: str(u.color),
        specs: u.specs
          ? Object.fromEntries(Object.entries(u.specs).filter(([, v]) => v && v.trim()))
          : undefined,
      }));

      for (const u of normalized) {
        for (const field of ["imei1", "imei2"] as const) {
          const imei = u[field];
          if (!imei) continue;
          if (imei.length !== 15 || !luhnValid(imei)) {
            return NextResponse.json(
              { error: `Invalid IMEI ${imei} in ${field} (must be 15-digit Luhn-valid)` },
              { status: 400 },
            );
          }
        }
      }

      const imeis = normalized.flatMap((u) => [u.imei1, u.imei2]).filter(Boolean) as string[];
      const dupInBatch = imeis.filter((v, i) => imeis.indexOf(v) !== i);
      if (dupInBatch.length) {
        return NextResponse.json(
          { error: `Duplicate IMEI in batch: ${[...new Set(dupInBatch)].join(", ")}` },
          { status: 400 },
        );
      }
      if (imeis.length) {
        const [existing] = await db
          .select({ id: inventoryUnits.id })
          .from(inventoryUnits)
          .where(
            or(
              ...imeis.map((imei) =>
                or(eq(inventoryUnits.imei1, imei), eq(inventoryUnits.imei2, imei)),
              ),
            ),
          )
          .limit(1);
        if (existing) {
          return NextResponse.json(
            { error: "IMEI already registered in inventory" },
            { status: 409 },
          );
        }
      }

      // Serials are unique like IMEIs (serial_number and unit_code are unique
      // columns) — reject early with a clear message instead of a raw PG error.
      const serials = normalized.map((u) => u.serialNumber).filter(Boolean) as string[];
      const dupSerials = serials.filter((v, i) => serials.indexOf(v) !== i);
      if (dupSerials.length) {
        return NextResponse.json(
          { error: `Duplicate serial in batch: ${[...new Set(dupSerials)].join(", ")}` },
          { status: 400 },
        );
      }
      if (serials.length) {
        const [existingSerial] = await db
          .select({ serial: inventoryUnits.serialNumber })
          .from(inventoryUnits)
          .where(
            or(
              ...serials.map((s) =>
                or(eq(inventoryUnits.serialNumber, s), eq(inventoryUnits.unitCode, s)),
              ),
            ),
          )
          .limit(1);
        if (existingSerial) {
          return NextResponse.json(
            { error: `Serial ${existingSerial.serial} is already registered in inventory` },
            { status: 409 },
          );
        }
      }
    }
  }

  try {
    const result = await txDb.transaction(async (tx) => {
      const now = new Date();
      const results: {
        variantId: number;
        qty: number;
        units?: { id: string; unitCode: string | null }[];
      }[] = [];

      // Batch provenance for a PO-linked receipt (supplier stamped on the batch).
      let poSupplierId: string | null = null;
      if (body.purchaseOrderId) {
        const [po] = await tx
          .select({ supplierId: purchaseOrders.supplierId })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, body.purchaseOrderId))
          .limit(1);
        poSupplierId = po?.supplierId ?? null;
      }

      for (const item of body.items) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (item.units && item.units.length > 0) {
          // Device receiving: create inventory units
          const normalized = item.units.map((u) => ({
            ...u,
            imei1: u.imei1 ? normalizeImei(u.imei1) : undefined,
            imei2: u.imei2 ? normalizeImei(u.imei2) : undefined,
            serialNumber: str(u.serialNumber),
            barcode: str(u.barcode),
            conditionGrade: str(u.conditionGrade),
            batteryHealth: num(u.batteryHealth),
            acquisitionCost: num(u.acquisitionCost),
            currentPrice: num(u.currentPrice),
          }));

          // One batch per variant per receiving event. The PO line's cost is the
          // batch rate when receiving against a purchase order.
          let batchUnitCost =
            normalized.find((u) => u.acquisitionCost != null)?.acquisitionCost ??
            variant?.costPrice ??
            0;
          if (body.purchaseOrderId) {
            const [poItem] = await tx
              .select({ costPrice: purchaseOrderItems.costPrice })
              .from(purchaseOrderItems)
              .where(
                and(
                  eq(purchaseOrderItems.poId, body.purchaseOrderId),
                  eq(purchaseOrderItems.variantId, item.variantId),
                ),
              )
              .limit(1);
            if (poItem?.costPrice) batchUnitCost = poItem.costPrice;
          }
          const [batch] = await tx
            .insert(inventoryBatches)
            .values({
              batchNumber: nextBatchNumber(now),
              variantId: item.variantId,
              locationId,
              purchaseOrderId: body.purchaseOrderId ?? null,
              supplierId: poSupplierId,
              source: body.purchaseOrderId ? "purchase_order" : "manual",
              unitCost: batchUnitCost,
              quantityReceived: normalized.length,
              receivedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: inventoryBatches.id });

          // Units without a manufacturer identity (no IMEI, no serial) get a
          // generated PSU- code. Continue the per-variant sequence after the
          // highest existing code so partial receipts never collide; the
          // unique indexes on unit_code/barcode are the backstop.
          const codePrefix = `PSU-${item.variantId}-`;
          const [seqRow] = await tx
            .select({ maxCode: sql<string | null>`max(${inventoryUnits.unitCode})` })
            .from(inventoryUnits)
            .where(sql`${inventoryUnits.unitCode} like ${codePrefix + "%"}`);
          let seq = Number.parseInt(seqRow?.maxCode?.slice(codePrefix.length) ?? "", 10);
          if (!Number.isFinite(seq)) seq = 0;

          const identities = normalized.map((u) => {
            const real = u.serialNumber ?? u.imei1;
            if (real) return { code: real, identityType: u.imei1 ? "imei" : "serial" };
            seq += 1;
            return { code: generateUnitCode(item.variantId, seq), identityType: "internal" };
          });

          const unitRows = await tx
            .insert(inventoryUnits)
            .values(
              normalized.map((u, i) => ({
                variantId: item.variantId,
                batchId: batch.id,
                locationId,
                unitCode: identities[i].code,
                // Every unit gets a scannable barcode: client-supplied wins,
                // otherwise the unit code itself (serial/IMEI or generated).
                barcode: u.barcode ?? identities[i].code,
                identityType: identities[i].identityType,
                imei1: u.imei1 ?? null,
                imei2: u.imei2 ?? null,
                serialNumber: u.serialNumber ?? null,
                conditionGrade: u.conditionGrade ?? "New",
                batteryHealth: u.batteryHealth ?? null,
                inspectionStatus: "passed",
                acquisitionCost: u.acquisitionCost ?? batchUnitCost,
                currentPrice: u.currentPrice ?? null,
                costCode: u.costCode ?? null,
                dCode: u.dCode ?? null,
                sellCode: u.sellCode ?? null,
                color: u.color ?? null,
                status: "available",
                receivedAt: now,
                createdAt: now,
                updatedAt: now,
              })),
            )
            .returning({ id: inventoryUnits.id, unitCode: inventoryUnits.unitCode });

          // Save per-unit specs and sync common ones to product catalog
          if (normalized.some((u) => u.specs && Object.keys(u.specs).length > 0)) {
            const productId = variant?.productId;
            const specEntries: { unitId: string; label: string; value: string }[] = [];

            for (let i = 0; i < normalized.length; i++) {
              const u = normalized[i];
              if (u.specs) {
                for (const [label, value] of Object.entries(u.specs)) {
                  if (value && value.trim()) {
                    specEntries.push({
                      unitId: unitRows[i].id,
                      label,
                      value: value.trim(),
                    });
                  }
                }
              }
            }

            if (specEntries.length > 0) {
              // Insert unit specs
              await tx.insert(unitSpecs).values(specEntries).onConflictDoNothing();

              // Sync common specs to product catalog (most frequent value per label across ALL units)
              if (productId) {
                // Get all unit IDs for this product's variants
                const allVariantIds = await tx
                  .select({ id: productVariants.id })
                  .from(productVariants)
                  .where(eq(productVariants.productId, productId));

                const variantIds = allVariantIds.map((v) => v.id);
                if (variantIds.length > 0) {
                  const allUnitIds = await tx
                    .select({ id: inventoryUnits.id })
                    .from(inventoryUnits)
                    .where(inArray(inventoryUnits.variantId, variantIds));

                  const unitIds = allUnitIds.map((u) => u.id);
                  if (unitIds.length > 0) {
                    const allUnitSpecs = await tx
                      .select({ label: unitSpecs.label, value: unitSpecs.value })
                      .from(unitSpecs)
                      .where(inArray(unitSpecs.unitId, unitIds));

                    const specCounts = new Map<string, Map<string, number>>();
                    for (const entry of allUnitSpecs) {
                      if (!specCounts.has(entry.label)) specCounts.set(entry.label, new Map());
                      const counts = specCounts.get(entry.label)!;
                      counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
                    }

                    for (const [label, counts] of specCounts) {
                      let topValue = "";
                      let topCount = 0;
                      for (const [value, count] of counts) {
                        if (count > topCount) {
                          topCount = count;
                          topValue = value;
                        }
                      }
                      if (topValue) {
                        await tx
                          .insert(productSpecs)
                          .values({ productId, label, value: topValue })
                          .onConflictDoUpdate({
                            target: [productSpecs.productId, productSpecs.label],
                            set: { value: topValue },
                          });
                      }
                    }
                  }
                }
              }
            }
          }

          const qty = normalized.length;
          await updateStockCounts(tx, item.variantId, locationId, qty, variant?.quantity ?? 0, now);

          results.push({ variantId: item.variantId, qty, units: unitRows });
        } else if (item.quantity && item.quantity > 0) {
          // Accessory receiving: increment quantity
          await updateStockCounts(
            tx,
            item.variantId,
            locationId,
            item.quantity,
            variant?.quantity ?? 0,
            now,
          );

          results.push({ variantId: item.variantId, qty: item.quantity });
        }
      }

      // If linked to a PO, update qtyReceived on PO items and sync cost price
      if (body.purchaseOrderId) {
        for (const item of body.items) {
          const qty = item.units?.length ?? item.quantity ?? 0;
          if (qty > 0 && item.variantId) {
            // Find the PO item matching this variant
            const [poItem] = await tx
              .select()
              .from(purchaseOrderItems)
              .where(
                and(
                  eq(purchaseOrderItems.poId, body.purchaseOrderId),
                  eq(purchaseOrderItems.variantId, item.variantId),
                ),
              )
              .limit(1);

            if (poItem) {
              await tx
                .update(purchaseOrderItems)
                .set({ qtyReceived: (poItem.qtyReceived ?? 0) + qty })
                .where(eq(purchaseOrderItems.id, poItem.id));

              // Sync cost price and sell price from PO item to product variant.
              // Official devices: the first batch anchors the variant cost — later
              // batches never move it. Per-unit economics stay batch-accurate via
              // the acquisitionCost stamped on each unit.
              const isOfficial = (poItem.category ?? "")
                .trim()
                .toLowerCase()
                .startsWith("official");
              if (poItem.costPrice && poItem.costPrice > 0) {
                const [currentVariant] = await tx
                  .select({ costPrice: productVariants.costPrice })
                  .from(productVariants)
                  .where(eq(productVariants.id, item.variantId))
                  .limit(1);

                // Official: only fill an empty cost. Others: lowest batch cost wins.
                if (
                  !currentVariant?.costPrice ||
                  (!isOfficial && poItem.costPrice < currentVariant.costPrice)
                ) {
                  await tx
                    .update(productVariants)
                    .set({ costPrice: poItem.costPrice, updatedAt: now })
                    .where(eq(productVariants.id, item.variantId));
                }
              }

              // Sync sell price from PO item to product variant
              if (poItem.sellPrice && poItem.sellPrice > 0) {
                await tx
                  .update(productVariants)
                  .set({ sellingPrice: poItem.sellPrice, updatedAt: now })
                  .where(eq(productVariants.id, item.variantId));
              }

              // Sync cost/d/s codes from PO item to product variant
              const codePatch: Record<string, string | null> = {};
              if (poItem.costCode) codePatch.costCode = poItem.costCode;
              if (poItem.dCode) codePatch.dCode = poItem.dCode;
              if (poItem.sellCode) codePatch.sellCode = poItem.sellCode;
              if (Object.keys(codePatch).length > 0) {
                await tx
                  .update(productVariants)
                  .set({ ...codePatch, updatedAt: now })
                  .where(eq(productVariants.id, item.variantId));
              }
            }
          }
        }

        // Check if all PO items are fully received
        const poItems = await tx
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.poId, body.purchaseOrderId));

        const allReceived = poItems.every((pi) => (pi.qtyReceived ?? 0) >= pi.qtyOrdered);
        const anyReceived = poItems.some((pi) => (pi.qtyReceived ?? 0) > 0);

        if (allReceived) {
          await tx
            .update(purchaseOrders)
            .set({ status: "received", receivedAt: now })
            .where(eq(purchaseOrders.id, body.purchaseOrderId));
        } else if (anyReceived) {
          await tx
            .update(purchaseOrders)
            .set({ status: "partial" })
            .where(eq(purchaseOrders.id, body.purchaseOrderId));
        }
      }

      return results;
    });

    return NextResponse.json({ success: true, received: result }, { status: 201 });
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return NextResponse.json(
        { error: "Duplicate unit — an IMEI/serial/barcode in this batch is already registered" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function updateStockCounts(
  tx: any,
  variantId: number,
  locationId: string,
  qty: number,
  currentQty: number,
  now: Date,
) {
  // Update variant quantity
  await tx
    .update(productVariants)
    .set({ quantity: currentQty + qty, updatedAt: now })
    .where(eq(productVariants.id, variantId));

  // Update or create inventory row (legacy)
  const [variant] = await tx
    .select({ sku: productVariants.sku, productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (variant) {
    const [inv] = await tx.select().from(inventory).where(eq(inventory.sku, variant.sku));
    if (inv) {
      await tx
        .update(inventory)
        .set({ quantity: inv.quantity + qty, updatedAt: now })
        .where(eq(inventory.id, inv.id));
    } else {
      await tx.insert(inventory).values({
        productId: variant.productId,
        sku: variant.sku,
        quantity: qty,
        location: locationId,
      });
    }
  }

  // Update or create inventory balance (per location)
  const [bal] = await tx
    .select()
    .from(inventoryBalances)
    .where(
      and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)),
    )
    .limit(1);
  if (bal) {
    await tx
      .update(inventoryBalances)
      .set({ availableQty: bal.availableQty + qty, updatedAt: now })
      .where(eq(inventoryBalances.id, bal.id));
  } else {
    await tx.insert(inventoryBalances).values({
      variantId,
      locationId,
      availableQty: qty,
    });
  }

  // Write movement log
  await tx.insert(inventoryMovements).values({
    variantId,
    locationId,
    movementType: "receive",
    quantity: qty,
    beforeQty: currentQty,
    afterQty: currentQty + qty,
    sourceType: "receive",
    reason: "Stock receiving",
    createdAt: now,
  });

  // Audit log
  await tx.insert(auditLog).values({
    action: "inventory.receive",
    entityType: "product_variant",
    entityId: String(variantId),
    metadata: { quantity: qty, locationId },
  });
}
