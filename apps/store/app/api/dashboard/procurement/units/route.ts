// PO intake correction: inspect, edit, add and remove the inventory units a
// purchase order brought in — the undo path for a wrong intake.
//
// GET    ?poId=                                → { items, units } for the fix-intake dialog
// PATCH  { unitId, ...fields, specs }          → edit one available unit
// DELETE { unitId }                            → remove one available unit (reverses stock + PO counts)
// POST   { poId, variantId, ...fields, specs } → add a unit the receive missed
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, txDb } from "@/db";
import { getScope } from "@/lib/authz";
import {
  auditLog,
  barcodes,
  inventory,
  inventoryBalances,
  inventoryBatches,
  inventoryMovements,
  inventoryUnits,
  locations,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  unitSpecs,
} from "@/db/schema";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { nextBatchNumber } from "@/lib/identifiers";
import { generateUnitCode } from "@/lib/barcode";
import { pgErrorCode } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

// ─── Shared helpers ─────────────────────────────────────────────

/** Treat "", whitespace and null like undefined so sloppy clients can't crash the insert. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

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

/** Error that carries an HTTP status through the tx rollback to the response. */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Continue the per-variant PSU- unit-code sequence after the highest code. */
async function nextSeqForPrefix(tx: unknown, variantId: number): Promise<number> {
  const codePrefix = `PSU-${variantId}-`;
  const [seqRow] = await (tx as any)
    .select({ maxCode: sql<string | null>`max(${inventoryUnits.unitCode})` })
    .from(inventoryUnits)
    .where(sql`${inventoryUnits.unitCode} like ${codePrefix + "%"}`);
  const seq = Number.parseInt(seqRow?.maxCode?.slice(codePrefix.length) ?? "", 10);
  return Number.isFinite(seq) ? seq : 0;
}

// ─── GET: everything received against a PO ─────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const poId = searchParams.get("poId");
  if (!poId) {
    return NextResponse.json({ error: "poId is required" }, { status: 400 });
  }

  // PO line items + the units their receives created. Two queries then a JS
  // group-by (not a variantId join) — a PO can carry the same variant on two
  // lines, and a join would multiply unit rows.
  const items = await db
    .select({
      id: purchaseOrderItems.id,
      variantId: purchaseOrderItems.variantId,
      qtyOrdered: purchaseOrderItems.qtyOrdered,
      qtyReceived: purchaseOrderItems.qtyReceived,
      costPrice: purchaseOrderItems.costPrice,
      sellPrice: purchaseOrderItems.sellPrice,
      costCode: purchaseOrderItems.costCode,
      dCode: purchaseOrderItems.dCode,
      sellCode: purchaseOrderItems.sellCode,
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

  const unitRows = await db
    .select({
      unitId: inventoryUnits.id,
      batchId: inventoryBatches.id,
      variantId: inventoryBatches.variantId,
      unitCode: inventoryUnits.unitCode,
      barcode: inventoryUnits.barcode,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      identityType: inventoryUnits.identityType,
      conditionGrade: inventoryUnits.conditionGrade,
      batteryHealth: inventoryUnits.batteryHealth,
      acquisitionCost: inventoryUnits.acquisitionCost,
      currentPrice: inventoryUnits.currentPrice,
      costCode: inventoryUnits.costCode,
      dCode: inventoryUnits.dCode,
      sellCode: inventoryUnits.sellCode,
      color: inventoryUnits.color,
      status: inventoryUnits.status,
      locationId: inventoryUnits.locationId,
      receivedAt: inventoryUnits.receivedAt,
      createdAt: inventoryUnits.createdAt,
    })
    .from(inventoryUnits)
    .innerJoin(inventoryBatches, eq(inventoryUnits.batchId, inventoryBatches.id))
    .where(eq(inventoryBatches.purchaseOrderId, poId))
    .orderBy(inventoryUnits.receivedAt, inventoryUnits.createdAt);

  const specsByUnit = new Map<string, { label: string; value: string }[]>();
  if (unitRows.length > 0) {
    const specRows = await db
      .select({ unitId: unitSpecs.unitId, label: unitSpecs.label, value: unitSpecs.value })
      .from(unitSpecs)
      .where(
        inArray(
          unitSpecs.unitId,
          unitRows.map((r) => r.unitId),
        ),
      );
    for (const s of specRows) {
      const arr = specsByUnit.get(s.unitId) ?? [];
      arr.push({ label: s.label, value: s.value });
      specsByUnit.set(s.unitId, arr);
    }
  }

  return NextResponse.json({
    items,
    units: unitRows.map((r) => ({ ...r, specs: specsByUnit.get(r.unitId) ?? [] })),
  });
}

// ─── PATCH: edit one available unit ─────────────────────────────

interface UnitPatch {
  unitId?: string;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  batteryHealth?: string | number | null;
  conditionGrade?: string;
  acquisitionCost?: string | number | null;
  currentPrice?: string | number | null;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  color?: string;
  specs?: Record<string, string>;
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as UnitPatch;

  // Identity values are presence-based: absent key = leave unchanged,
  // empty string = clear the field.
  const next = {
    imei1: "imei1" in body ? (str(body.imei1) ? normalizeImei(str(body.imei1)!) : null) : undefined,
    imei2: "imei2" in body ? (str(body.imei2) ? normalizeImei(str(body.imei2)!) : null) : undefined,
    serialNumber: "serialNumber" in body ? (str(body.serialNumber) ?? null) : undefined,
    batteryHealth:
      "batteryHealth" in body
        ? body.batteryHealth === ""
          ? null
          : (num(body.batteryHealth) ?? null)
        : undefined,
    conditionGrade: "conditionGrade" in body ? (str(body.conditionGrade) ?? null) : undefined,
    acquisitionCost:
      "acquisitionCost" in body
        ? body.acquisitionCost === ""
          ? null
          : (num(body.acquisitionCost) ?? null)
        : undefined,
    currentPrice:
      "currentPrice" in body
        ? body.currentPrice === ""
          ? null
          : (num(body.currentPrice) ?? null)
        : undefined,
    costCode: "costCode" in body ? (str(body.costCode) ?? null) : undefined,
    dCode: "dCode" in body ? (str(body.dCode) ?? null) : undefined,
    sellCode: "sellCode" in body ? (str(body.sellCode) ?? null) : undefined,
    color: "color" in body ? (str(body.color) ?? null) : undefined,
  };

  try {
    const result = await txDb.transaction(async (tx) => {
      const [unit] = await tx
        .select()
        .from(inventoryUnits)
        .where(eq(inventoryUnits.id, body.unitId ?? ""))
        .limit(1);
      if (!unit) throw new HttpError(404, "Unit not found");
      if (unit.status !== "available") {
        throw new HttpError(
          409,
          "Only units still in stock can be edited — this one is already sold or transferred",
        );
      }

      const nextImei1 = next.imei1 !== undefined ? next.imei1 : unit.imei1;
      const nextImei2 = next.imei2 !== undefined ? next.imei2 : unit.imei2;
      const nextSerial = next.serialNumber !== undefined ? next.serialNumber : unit.serialNumber;

      // Luhn-validate every IMEI that stays on the unit after the edit.
      for (const [field, imei] of [
        ["imei1", nextImei1],
        ["imei2", nextImei2],
      ] as const) {
        if (imei && (imei.length !== 15 || !luhnValid(imei))) {
          throw new HttpError(
            400,
            `Invalid IMEI ${imei} in ${field} (must be 15-digit Luhn-valid)`,
          );
        }
      }

      // Identities are unique across units — check each candidate against
      // other units' imei1/imei2/serial/unit_code before writing.
      const candidates = [nextImei1, nextImei2, nextSerial].filter(Boolean) as string[];
      if (candidates.length > 0) {
        const [dupe] = await tx
          .select({ unitCode: inventoryUnits.unitCode })
          .from(inventoryUnits)
          .where(
            and(
              ne(inventoryUnits.id, unit.id),
              or(
                ...candidates.map((v) =>
                  or(
                    eq(inventoryUnits.imei1, v),
                    eq(inventoryUnits.imei2, v),
                    eq(inventoryUnits.serialNumber, v),
                    eq(inventoryUnits.unitCode, v),
                  ),
                ),
              ),
            ),
          )
          .limit(1);
        if (dupe) {
          throw new HttpError(409, `IMEI/serial already belongs to unit ${dupe.unitCode ?? "?"}`);
        }
      }

      // Re-derive the scannable code when the identity changed. At receive
      // time unit_code = serial ?? imei1, so mirror that; a previously
      // generated code survives an identity clear, and a cleared real
      // identity mints a fresh PSU- code.
      const oldIdentity = unit.serialNumber ?? unit.imei1;
      const newIdentity = nextSerial ?? nextImei1;
      let unitCode = unit.unitCode;
      let identityType = unit.identityType;
      if (newIdentity) {
        unitCode = newIdentity;
        identityType = nextImei1 ? "imei" : "serial";
      } else if (unit.identityType !== "internal") {
        const seq = await nextSeqForPrefix(tx, unit.variantId);
        unitCode = generateUnitCode(unit.variantId, seq + 1);
        identityType = "internal";
      }

      const patch: Partial<typeof inventoryUnits.$inferInsert> = {
        unitCode,
        identityType,
        updatedAt: new Date(),
      };
      // The barcode follows the identity unless it was customized to
      // something else at receive time.
      if (!unit.barcode || unit.barcode === oldIdentity) {
        patch.barcode = unitCode;
      }
      for (const key of [
        "imei1",
        "imei2",
        "serialNumber",
        "batteryHealth",
        "conditionGrade",
        "acquisitionCost",
        "currentPrice",
        "costCode",
        "dCode",
        "sellCode",
        "color",
      ] as const) {
        if (next[key] !== undefined) {
          patch[key] = next[key] as never;
        }
      }

      await tx.update(inventoryUnits).set(patch).where(eq(inventoryUnits.id, unit.id));

      // Specs: replace the unit's spec sheet with the sent map (blank = remove).
      if (body.specs && typeof body.specs === "object") {
        const wanted = Object.entries(body.specs).filter(
          ([, v]) => typeof v === "string" && v.trim(),
        ) as [string, string][];
        const wantedLabels = wanted.map(([label]) => label);
        const existing = await tx
          .select({ label: unitSpecs.label })
          .from(unitSpecs)
          .where(eq(unitSpecs.unitId, unit.id));
        for (const ex of existing) {
          if (!wantedLabels.includes(ex.label)) {
            await tx
              .delete(unitSpecs)
              .where(and(eq(unitSpecs.unitId, unit.id), eq(unitSpecs.label, ex.label)));
          }
        }
        for (const [label, value] of wanted) {
          await tx
            .insert(unitSpecs)
            .values({ unitId: unit.id, label, value: value.trim() })
            .onConflictDoUpdate({
              target: [unitSpecs.unitId, unitSpecs.label],
              set: { value: value.trim() },
            });
        }
      }

      return { success: true, unitCode };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (pgErrorCode(e) === "23505") {
      return NextResponse.json(
        { error: "IMEI/serial already registered on another unit" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── DELETE: remove one available unit, reversing its stock ─────

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const unitId = str(body.unitId);
  if (!unitId) {
    return NextResponse.json({ error: "unitId is required" }, { status: 400 });
  }

  try {
    const result = await txDb.transaction(async (tx) => {
      const [unit] = await tx
        .select()
        .from(inventoryUnits)
        .where(eq(inventoryUnits.id, unitId))
        .limit(1);
      if (!unit) throw new HttpError(404, "Unit not found");
      if (unit.status !== "available") {
        throw new HttpError(
          409,
          "Only units still in stock can be removed — this one is already sold or transferred",
        );
      }

      const now = new Date();

      // PO provenance comes from the unit's batch before anything is deleted.
      const [batch] = await tx
        .select({ poId: inventoryBatches.purchaseOrderId })
        .from(inventoryBatches)
        .where(eq(inventoryBatches.id, unit.batchId ?? ""))
        .limit(1);

      const [variant] = await tx
        .select({
          sku: productVariants.sku,
          quantity: productVariants.quantity,
        })
        .from(productVariants)
        .where(eq(productVariants.id, unit.variantId))
        .limit(1);
      if (!variant) throw new HttpError(404, "Variant not found");

      // Stock counters down by one — the exact reverse of receiving.
      const before = variant.quantity ?? 0;
      const after = Math.max(0, before - 1);
      await tx
        .update(productVariants)
        .set({ quantity: after, updatedAt: now })
        .where(eq(productVariants.id, unit.variantId));

      if (variant.sku) {
        const [inv] = await tx
          .select()
          .from(inventory)
          .where(eq(inventory.sku, variant.sku))
          .limit(1);
        if (inv) {
          await tx
            .update(inventory)
            .set({ quantity: Math.max(0, inv.quantity - 1), updatedAt: now })
            .where(eq(inventory.id, inv.id));
        }
      }

      if (unit.locationId) {
        const [bal] = await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.variantId, unit.variantId),
              eq(inventoryBalances.locationId, unit.locationId),
            ),
          )
          .limit(1);
        if (bal) {
          await tx
            .update(inventoryBalances)
            .set({ availableQty: Math.max(0, bal.availableQty - 1), updatedAt: now })
            .where(eq(inventoryBalances.id, bal.id));
        }
      }

      // Detach rows that point at this unit so the delete doesn't hit the FK:
      // movements and printed barcode rows keep their history, minus the link.
      await tx
        .update(inventoryMovements)
        .set({ unitId: null })
        .where(eq(inventoryMovements.unitId, unitId));
      await tx
        .update(barcodes)
        .set({ inventoryUnitId: null })
        .where(eq(barcodes.inventoryUnitId, unitId));

      await tx.insert(inventoryMovements).values({
        variantId: unit.variantId,
        locationId: unit.locationId,
        movementType: "adjustment",
        quantity: -1,
        beforeQty: before,
        afterQty: after,
        sourceType: "adjustment",
        sourceId: unit.unitCode,
        reason: "Removed via PO intake fix",
        createdAt: now,
      });

      await tx.insert(auditLog).values({
        action: "inventory.remove_unit",
        entityType: "inventory_unit",
        entityId: unitId,
        metadata: { unitCode: unit.unitCode, poId: batch?.poId ?? null },
      });

      // unit_specs rows cascade with the unit.
      await tx.delete(inventoryUnits).where(eq(inventoryUnits.id, unitId));

      // Roll the PO side back: one fewer received on the matching line, and
      // recompute the header status exactly like receiving does.
      if (batch?.poId) {
        const [poItem] = await tx
          .select()
          .from(purchaseOrderItems)
          .where(
            and(
              eq(purchaseOrderItems.poId, batch.poId),
              eq(purchaseOrderItems.variantId, unit.variantId),
            ),
          )
          .limit(1);
        if (poItem) {
          await tx
            .update(purchaseOrderItems)
            .set({ qtyReceived: Math.max(0, (poItem.qtyReceived ?? 0) - 1) })
            .where(eq(purchaseOrderItems.id, poItem.id));
        }

        const poItems = await tx
          .select({
            qtyOrdered: purchaseOrderItems.qtyOrdered,
            qtyReceived: purchaseOrderItems.qtyReceived,
          })
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.poId, batch.poId));
        const allReceived = poItems.every((pi) => (pi.qtyReceived ?? 0) >= pi.qtyOrdered);
        const anyReceived = poItems.some((pi) => (pi.qtyReceived ?? 0) > 0);
        if (allReceived) {
          await tx
            .update(purchaseOrders)
            .set({ status: "received", receivedAt: now })
            .where(eq(purchaseOrders.id, batch.poId));
        } else if (anyReceived) {
          await tx
            .update(purchaseOrders)
            .set({ status: "partial" })
            .where(eq(purchaseOrders.id, batch.poId));
        } else {
          await tx
            .update(purchaseOrders)
            .set({ status: "pending", receivedAt: null })
            .where(eq(purchaseOrders.id, batch.poId));
        }
      }

      return { success: true };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (pgErrorCode(e) === "23503") {
      return NextResponse.json(
        { error: "This unit is referenced elsewhere (e.g. a sale) and can't be removed" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── POST: add a unit the receive missed ────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json();
  const poId = str(body.poId);
  const variantId = num(body.variantId);
  if (!poId || !variantId) {
    return NextResponse.json({ error: "poId and variantId are required" }, { status: 400 });
  }

  const scope = await getScope(request.headers);
  const locationId = scope.isScoped
    ? (scope.storeLocation ?? (await resolveLocation(body.locationId)))
    : await resolveLocation(body.locationId);

  // Same identity hygiene as stock receiving: normalize, Luhn-validate, and
  // reject duplicates before opening a transaction.
  const imei1 = str(body.imei1) ? normalizeImei(str(body.imei1)!) : null;
  const imei2 = str(body.imei2) ? normalizeImei(str(body.imei2)!) : null;
  const serialNumber = str(body.serialNumber) ?? null;
  const batteryHealth = num(body.batteryHealth) ?? null;
  const conditionGrade = str(body.conditionGrade) ?? "New";
  const acquisitionCost = num(body.acquisitionCost);
  const currentPrice = num(body.currentPrice);
  const costCode = str(body.costCode) ?? null;
  const dCode = str(body.dCode) ?? null;
  const sellCode = str(body.sellCode) ?? null;
  const color = str(body.color) ?? null;
  const specs =
    body.specs && typeof body.specs === "object"
      ? Object.fromEntries(
          Object.entries(body.specs as Record<string, string>).filter(([, v]) => str(v)),
        )
      : {};

  for (const [field, imei] of [
    ["imei1", imei1],
    ["imei2", imei2],
  ] as const) {
    if (imei && (imei.length !== 15 || !luhnValid(imei))) {
      return NextResponse.json(
        { error: `Invalid IMEI ${imei} in ${field} (must be 15-digit Luhn-valid)` },
        { status: 400 },
      );
    }
  }
  if (imei1 && imei2 && imei1 === imei2) {
    return NextResponse.json({ error: "IMEI 1 and IMEI 2 can't be the same" }, { status: 400 });
  }
  const imeis = [imei1, imei2].filter(Boolean) as string[];
  if (imeis.length > 0) {
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
      return NextResponse.json({ error: "IMEI already registered in inventory" }, { status: 409 });
    }
  }
  if (serialNumber) {
    const [existingSerial] = await db
      .select({ serial: inventoryUnits.serialNumber })
      .from(inventoryUnits)
      .where(
        or(
          eq(inventoryUnits.serialNumber, serialNumber),
          eq(inventoryUnits.unitCode, serialNumber),
        ),
      )
      .limit(1);
    if (existingSerial) {
      return NextResponse.json(
        { error: `Serial ${serialNumber} is already registered in inventory` },
        { status: 409 },
      );
    }
  }

  try {
    const created = await txDb.transaction(async (tx) => {
      const now = new Date();
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, poId))
        .limit(1);
      if (!po) throw new HttpError(404, "Purchase order not found");
      const [poItem] = await tx
        .select()
        .from(purchaseOrderItems)
        .where(and(eq(purchaseOrderItems.poId, poId), eq(purchaseOrderItems.variantId, variantId)))
        .limit(1);
      if (!poItem) throw new HttpError(404, "This PO has no line for that product");

      const [variant] = await tx
        .select({
          sku: productVariants.sku,
          costPrice: productVariants.costPrice,
          quantity: productVariants.quantity,
        })
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);
      if (!variant) throw new HttpError(404, "Variant not found");

      // Reuse the batch earlier receives created for this (PO, variant) so the
      // unit keeps its PO provenance; mint one when the line never received.
      let batchId: string;
      const [existingBatch] = await tx
        .select({ id: inventoryBatches.id })
        .from(inventoryBatches)
        .where(
          and(
            eq(inventoryBatches.purchaseOrderId, poId),
            eq(inventoryBatches.variantId, variantId),
          ),
        )
        .limit(1);
      if (existingBatch) {
        batchId = existingBatch.id;
        await tx
          .update(inventoryBatches)
          .set({ quantityReceived: sql`coalesce(${inventoryBatches.quantityReceived}, 0) + 1` })
          .where(eq(inventoryBatches.id, batchId));
      } else {
        const batchUnitCost = poItem.costPrice ?? variant.costPrice ?? 0;
        const [batch] = await tx
          .insert(inventoryBatches)
          .values({
            batchNumber: nextBatchNumber(now),
            variantId,
            locationId,
            purchaseOrderId: poId,
            supplierId: po.supplierId,
            source: "purchase_order",
            unitCost: batchUnitCost,
            quantityReceived: 1,
            receivedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: inventoryBatches.id });
        batchId = batch.id;
      }

      // Identity → unit code, same rule as receiving: serial ?? imei1, else a
      // generated PSU- code continuing the per-variant sequence.
      const real = serialNumber ?? imei1;
      let unitCode: string;
      let identityType: string;
      if (real) {
        unitCode = real;
        identityType = imei1 ? "imei" : "serial";
      } else {
        const seq = await nextSeqForPrefix(tx, variantId);
        unitCode = generateUnitCode(variantId, seq + 1);
        identityType = "internal";
      }

      const [unit] = await tx
        .insert(inventoryUnits)
        .values({
          variantId,
          batchId,
          locationId,
          unitCode,
          barcode: unitCode,
          identityType,
          imei1,
          imei2,
          serialNumber,
          conditionGrade,
          batteryHealth,
          inspectionStatus: "passed",
          acquisitionCost: acquisitionCost ?? poItem.costPrice ?? variant.costPrice ?? 0,
          currentPrice,
          costCode: costCode ?? poItem.costCode,
          dCode: dCode ?? poItem.dCode,
          sellCode: sellCode ?? poItem.sellCode,
          color,
          status: "available",
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: inventoryUnits.id, unitCode: inventoryUnits.unitCode });

      if (Object.keys(specs).length > 0) {
        await tx.insert(unitSpecs).values(
          Object.entries(specs).map(([label, value]) => ({
            unitId: unit.id,
            label,
            value: value.trim(),
          })),
        );
      }

      // Stock counters up by one — same invariants as stock receiving.
      const before = variant.quantity ?? 0;
      await tx
        .update(productVariants)
        .set({ quantity: before + 1, updatedAt: now })
        .where(eq(productVariants.id, variantId));

      const [inv] = await tx
        .select()
        .from(inventory)
        .where(eq(inventory.sku, variant.sku))
        .limit(1);
      if (inv) {
        await tx
          .update(inventory)
          .set({ quantity: inv.quantity + 1, updatedAt: now })
          .where(eq(inventory.id, inv.id));
      } else {
        await tx
          .insert(inventory)
          .values({
            productId: poItem.productId,
            sku: variant.sku,
            quantity: 1,
            location: locationId,
          });
      }

      const [bal] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.variantId, variantId),
            eq(inventoryBalances.locationId, locationId),
          ),
        )
        .limit(1);
      if (bal) {
        await tx
          .update(inventoryBalances)
          .set({ availableQty: bal.availableQty + 1, updatedAt: now })
          .where(eq(inventoryBalances.id, bal.id));
      } else {
        await tx.insert(inventoryBalances).values({ variantId, locationId, availableQty: 1 });
      }

      await tx.insert(inventoryMovements).values({
        variantId,
        unitId: unit.id,
        locationId,
        movementType: "receive",
        quantity: 1,
        beforeQty: before,
        afterQty: before + 1,
        sourceType: "receive",
        sourceId: unit.unitCode,
        reason: "Added via PO intake fix",
        createdAt: now,
      });

      await tx.insert(auditLog).values({
        action: "procurement.add_unit",
        entityType: "inventory_unit",
        entityId: unit.id,
        metadata: { poId, variantId, unitCode: unit.unitCode },
      });

      // PO side: +1 on the matching line and recompute the header status.
      await tx
        .update(purchaseOrderItems)
        .set({ qtyReceived: (poItem.qtyReceived ?? 0) + 1 })
        .where(eq(purchaseOrderItems.id, poItem.id));
      const poItems = await tx
        .select({
          qtyOrdered: purchaseOrderItems.qtyOrdered,
          qtyReceived: purchaseOrderItems.qtyReceived,
        })
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.poId, poId));
      const allReceived = poItems.every((pi) => (pi.qtyReceived ?? 0) >= pi.qtyOrdered);
      const anyReceived = poItems.some((pi) => (pi.qtyReceived ?? 0) > 0);
      if (allReceived) {
        await tx
          .update(purchaseOrders)
          .set({ status: "received", receivedAt: now })
          .where(eq(purchaseOrders.id, poId));
      } else if (anyReceived) {
        await tx
          .update(purchaseOrders)
          .set({ status: "partial" })
          .where(eq(purchaseOrders.id, poId));
      }

      return { unitId: unit.id, unitCode: unit.unitCode };
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (pgErrorCode(e) === "23505") {
      return NextResponse.json(
        { error: "Duplicate unit — this IMEI/serial/barcode is already registered" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
