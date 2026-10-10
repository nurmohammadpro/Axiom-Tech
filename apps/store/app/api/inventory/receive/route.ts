import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
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
} from "@/db/schema";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { nextBatchNumber } from "@/lib/identifiers";
import { pgErrorCode } from "@/lib/pg-errors";

export const dynamic = "force-dynamic";

/** Resolve the receive location: explicit > default location. */
async function resolveLocation(locationId?: string): Promise<string> {
  if (locationId) {
    const [loc] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.name, locationId))
      .limit(1);
    if (loc) return loc.name;
    throw new Error(`Location "${locationId}" not found`);
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
}

interface ReceiveBody {
  variantId: number;
  locationId?: string;
  /** Landed cost per unit for this receiving batch; falls back to unit/variant cost. */
  unitCost?: number;
  units: ReceiveUnit[];
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

  if (!body.variantId || !Array.isArray(body.units) || body.units.length === 0) {
    return NextResponse.json(
      { error: "variantId and a non-empty units array are required" },
      { status: 400 },
    );
  }

  const [variant] = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.id, body.variantId))
    .limit(1);
  if (!variant) {
    return NextResponse.json({ error: `Variant ${body.variantId} not found` }, { status: 404 });
  }

  // Managers/salesmen can only receive into their own warehouse.
  const locationId = scope.isScoped
    ? (scope.storeLocation ?? (await resolveLocation(body.locationId)))
    : await resolveLocation(body.locationId);
  const normalized = body.units.map((u) => ({
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

  // Pre-validate IMEIs: format + duplicate-in-batch.
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
      return NextResponse.json({ error: "IMEI already registered in inventory" }, { status: 409 });
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

  try {
    const created = await txDb.transaction(async (tx) => {
      const now = new Date();
      // One batch per receiving event, carrying the rate for FIFO/cost.
      const batchUnitCost =
        body.unitCost ??
        normalized.find((u) => u.acquisitionCost != null)?.acquisitionCost ??
        variant.costPrice ??
        0;
      const [batch] = await tx
        .insert(inventoryBatches)
        .values({
          batchNumber: nextBatchNumber(now),
          variantId: body.variantId,
          locationId,
          source: "manual",
          unitCost: batchUnitCost,
          quantityReceived: normalized.length,
          receivedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: inventoryBatches.id });

      const unitRows = await tx
        .insert(inventoryUnits)
        .values(
          normalized.map((u) => ({
            variantId: body.variantId,
            batchId: batch.id,
            locationId,
            unitCode: u.serialNumber ?? u.imei1 ?? null,
            barcode: u.barcode ?? null,
            identityType: u.imei1 ? "imei" : u.serialNumber ? "serial" : "none",
            imei1: u.imei1 ?? null,
            imei2: u.imei2 ?? null,
            serialNumber: u.serialNumber ?? null,
            conditionGrade: u.conditionGrade ?? "New",
            batteryHealth: u.batteryHealth ?? null,
            inspectionStatus: "passed",
            acquisitionCost: u.acquisitionCost ?? batchUnitCost,
            currentPrice: u.currentPrice ?? null,
            status: "available",
            receivedAt: now,
            createdAt: now,
            updatedAt: now,
          })),
        )
        .returning({ id: inventoryUnits.id, unitCode: inventoryUnits.unitCode });

      const qty = normalized.length;

      const [curVariant] = await tx
        .select({ quantity: productVariants.quantity })
        .from(productVariants)
        .where(eq(productVariants.id, body.variantId))
        .limit(1);
      await tx
        .update(productVariants)
        .set({ quantity: (curVariant?.quantity ?? 0) + qty, updatedAt: now })
        .where(eq(productVariants.id, body.variantId));

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

      // Per-location balance row (multi-warehouse): key by variant + location so
      // receiving into a second warehouse creates its own balance instead of
      // bumping the first warehouse's row.
      const [bal] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.variantId, body.variantId),
            eq(inventoryBalances.locationId, locationId),
          ),
        )
        .limit(1);
      if (bal) {
        await tx
          .update(inventoryBalances)
          .set({ availableQty: bal.availableQty + qty, updatedAt: now })
          .where(eq(inventoryBalances.id, bal.id));
      } else {
        await tx.insert(inventoryBalances).values({
          variantId: body.variantId,
          locationId,
          availableQty: qty,
        });
      }

      await tx.insert(inventoryMovements).values({
        variantId: body.variantId,
        locationId,
        movementType: "receive",
        quantity: qty,
        beforeQty: curVariant?.quantity ?? 0,
        afterQty: (curVariant?.quantity ?? 0) + qty,
        sourceType: "receive",
        reason: "Stock receiving",
        actorId,
        createdAt: now,
      });

      await tx.insert(auditLog).values({
        userId: actorId,
        action: "inventory.receive",
        entityType: "product_variant",
        entityId: String(body.variantId),
        metadata: { unitCount: qty, locationId },
      });

      return unitRows;
    });

    return NextResponse.json({ created: created.length, units: created }, { status: 201 });
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return NextResponse.json(
        { error: "Duplicate unit — an IMEI/serial in this batch is already registered" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
