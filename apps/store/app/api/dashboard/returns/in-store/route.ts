import { txDb } from "@/db";
import {
  auditLog,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  productVariants,
  returns,
  saleLines,
  sales,
  warranties,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getScope, requireStaff } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * One-shot in-store counter returns.
 *
 * POST creates a return already refunded (instant cash/card/mobile payout),
 * restocks the device as immediately sellable stock with fresh counter-set
 * pricing codes, voids its warranty, and logs movement + audit — in a single
 * transaction. Replaces the old two-step RMA flow for the counter.
 *
 * PATCH edits an EXISTING (older) return with the same features: updating the
 * refund amount/method/reason/condition/notes and the unit's resale pricing.
 * Completing a legacy non-final return runs the same restock; editing an
 * already-refunded return only updates fields + unit pricing (never restocks
 * twice).
 */

/** Error carrying an HTTP status through the transaction. */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Int-coerce a counter-entered price; blank/NaN becomes null (keep old value). */
function priceOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

/** Trim-or-null for counter-entered codes/notes. */
function codeOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Counter-entered resale pricing → unit columns (only provided fields). */
function repricingSet(repricing: any) {
  return {
    ...(repricing.costCode !== undefined ? { costCode: codeOrNull(repricing.costCode) } : {}),
    ...(repricing.acquisitionCost !== undefined
      ? { acquisitionCost: priceOrNull(repricing.acquisitionCost) }
      : {}),
    ...(repricing.dCode !== undefined ? { dCode: codeOrNull(repricing.dCode) } : {}),
    ...(repricing.sellCode !== undefined ? { sellCode: codeOrNull(repricing.sellCode) } : {}),
    ...(repricing.currentPrice !== undefined
      ? { currentPrice: priceOrNull(repricing.currentPrice) }
      : {}),
  };
}

/**
 * Shared restock: unit back as immediately sellable ("available", not the old
 * unsellable "received") with counter-set pricing, warranty voided, and the
 * variant/balance/movement bookkeeping mirroring the sales-commit deduction
 * in reverse. Caller has row-locked the unit and verified it is sold.
 */
async function restockReturnedUnit(
  tx: Parameters<Parameters<typeof txDb.transaction>[0]>[0],
  args: {
    line: typeof saleLines.$inferSelect;
    sale: typeof sales.$inferSelect;
    unit: typeof inventoryUnits.$inferSelect | null;
    returnId: string;
    actorId: string | null;
    repricing: any;
    reason: string;
  },
) {
  const { line, sale, unit, returnId, actorId, repricing, reason } = args;
  const now = new Date();

  if (unit) {
    await tx
      .update(inventoryUnits)
      .set({
        status: "available",
        soldAt: null,
        receivedAt: now,
        warrantyStartAt: null,
        warrantyEndAt: null,
        ...repricingSet(repricing ?? {}),
      })
      .where(eq(inventoryUnits.id, unit.id));
  }

  // Void the sale's active warranty rows for this line/unit.
  await tx
    .update(warranties)
    .set({ status: "voided" })
    .where(
      unit
        ? and(
            eq(warranties.saleLineId, line.id),
            eq(warranties.unitId, unit.id),
            eq(warranties.status, "active"),
          )
        : and(eq(warranties.saleLineId, line.id), eq(warranties.status, "active")),
    );

  // Stock counters + balance + movement.
  const variantId = line.variantId;
  const restockInfo = { variantId, qty: 0, beforeQty: 0, afterQty: 0, loc: null as string | null };
  if (variantId) {
    const qty = unit ? 1 : Math.max(1, line.quantity);
    const [variant] = await tx
      .select({ quantity: productVariants.quantity })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant) throw new HttpError(404, "Variant not found");
    const beforeQty = variant.quantity;
    const afterQty = beforeQty + qty;
    const loc = unit?.locationId ?? sale.storeId ?? null;

    await tx
      .update(productVariants)
      .set({ quantity: afterQty, updatedAt: now })
      .where(eq(productVariants.id, variantId));

    if (loc) {
      const [bal] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)),
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
          locationId: loc,
          availableQty: qty,
        });
      }
    }

    await tx.insert(inventoryMovements).values({
      variantId,
      unitId: unit?.id ?? null,
      locationId: loc,
      movementType: "return",
      quantity: qty,
      beforeQty,
      afterQty,
      sourceType: "in_store_return",
      sourceId: returnId,
      reason,
      actorId,
    });

    restockInfo.qty = qty;
    restockInfo.beforeQty = beforeQty;
    restockInfo.afterQty = afterQty;
    restockInfo.loc = loc;
  }

  return restockInfo;
}

/** Load + lock the return's sale line, sale and unit; shared by POST/PATCH. */
async function loadReturnContext(
  tx: Parameters<Parameters<typeof txDb.transaction>[0]>[0],
  saleLineId: number,
) {
  const [line] = await tx.select().from(saleLines).where(eq(saleLines.id, saleLineId)).limit(1);
  if (!line) throw new HttpError(404, "Sale line not found");
  const [sale] = await tx.select().from(sales).where(eq(sales.id, line.saleId)).limit(1);
  if (!sale) throw new HttpError(404, "Sale not found");
  let unit: typeof inventoryUnits.$inferSelect | null = null;
  if (line.inventoryUnitId) {
    const [locked] = await tx
      .select()
      .from(inventoryUnits)
      .where(eq(inventoryUnits.id, line.inventoryUnitId))
      .for("update");
    unit = locked ?? null;
  }
  return { line, sale, unit };
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const saleId = typeof body?.saleId === "string" ? body.saleId : null;
  const saleLineId = Number(body?.saleLineId);
  const refund = Math.round(Number(body?.refundAmount));
  const rawMethod = typeof body?.refundMethod === "string" ? body.refundMethod : "cash";
  const refundMethod = ["cash", "card", "mobile"].includes(rawMethod) ? rawMethod : "cash";
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "other";
  const condition =
    typeof body?.condition === "string" && body.condition.trim() ? body.condition.trim() : "used";
  const adminNotes = codeOrNull(body?.adminNotes);
  const repricing = body?.repricing ?? null;

  if (!saleId || !Number.isInteger(saleLineId)) {
    return NextResponse.json({ error: "saleId and saleLineId are required" }, { status: 400 });
  }
  if (!Number.isFinite(refund) || refund < 0) {
    return NextResponse.json({ error: "Refund amount must be a number ≥ 0" }, { status: 400 });
  }

  try {
    const outcome = await txDb.transaction(async (tx) => {
      const { line, sale, unit } = await loadReturnContext(tx, saleLineId);
      if (line.saleId !== saleId) {
        throw new HttpError(404, "Sale line not found for this sale");
      }

      // productId is NOT NULL on returns — resolve it via the line's variant.
      let productId: string | null = null;
      if (line.variantId) {
        const [variant] = await tx
          .select({ productId: productVariants.productId })
          .from(productVariants)
          .where(eq(productVariants.id, line.variantId))
          .limit(1);
        productId = variant?.productId ?? null;
      }
      if (!productId) {
        throw new HttpError(400, "Cannot resolve the product for this sale line");
      }

      // Guard A: the unit must currently be sold. Row-locked so two
      // simultaneous counter terminals can't both return the same device.
      if (line.inventoryUnitId) {
        if (!unit) throw new HttpError(404, "Device unit not found");
        if (unit.status !== "sold") {
          throw new HttpError(
            409,
            `This unit is not marked sold (status: ${unit.status}) — it may already have been returned.`,
          );
        }
      }

      // Guard B: one active return per sale line.
      const [dupe] = await tx
        .select({ id: returns.id })
        .from(returns)
        .where(and(eq(returns.saleLineId, saleLineId), ne(returns.status, "rejected")))
        .limit(1);
      if (dupe) {
        throw new HttpError(409, `This item already has an active return (${dupe.id}).`);
      }

      const now = new Date();
      const returnId = `RET-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const qty = unit ? 1 : Math.max(1, line.quantity);

      // Insert the return — born refunded.
      await tx.insert(returns).values({
        id: returnId,
        channel: "in_store",
        saleId: line.saleId,
        saleLineId,
        userId: scope.userId,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerEmail: sale.customerEmail,
        productId,
        productName: line.productNameSnapshot,
        qty,
        reason,
        condition,
        resolutionType: "refund",
        status: "refunded",
        adminNotes,
        refundAmount: refund,
        refundMethod,
        refundedAt: now,
        resolvedAt: now,
      });

      const restockInfo = await restockReturnedUnit(tx, {
        line,
        sale,
        unit,
        returnId,
        actorId: scope.userId,
        repricing,
        reason: "In-store counter return",
      });

      // Audit trail entry.
      await tx.insert(auditLog).values({
        userId: scope.userId,
        action: "return.complete",
        entityType: "return",
        entityId: returnId,
        metadata: {
          saleNumber: sale.saleNumber,
          imei: unit?.imei1 ?? unit?.imei2 ?? unit?.serialNumber ?? null,
          refundAmount: refund,
          refundMethod,
          repricing: repricing ?? null,
        },
      });

      return { returnId, refund, refundMethod, ...restockInfo };
    });

    return NextResponse.json(
      { success: true, id: outcome.returnId, return: outcome },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("In-store return error:", error);
    return NextResponse.json({ error: "Failed to complete the return" }, { status: 500 });
  }
}

const FINAL_STATUSES = new Set(["refunded", "completed"]);

export async function PATCH(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "Return id is required" }, { status: 400 });
  }

  const refund =
    body?.refundAmount !== undefined && body?.refundAmount !== null && body?.refundAmount !== ""
      ? Math.round(Number(body.refundAmount))
      : null;
  if (refund !== null && (!Number.isFinite(refund) || refund < 0)) {
    return NextResponse.json({ error: "Refund amount must be a number ≥ 0" }, { status: 400 });
  }
  const rawMethod = typeof body?.refundMethod === "string" ? body.refundMethod : null;
  const refundMethod = rawMethod
    ? ["cash", "card", "mobile"].includes(rawMethod)
      ? rawMethod
      : null
    : null;
  if (rawMethod && !refundMethod) {
    return NextResponse.json({ error: "Invalid refund method" }, { status: 400 });
  }
  const repricing = body?.repricing ?? null;

  try {
    const outcome = await txDb.transaction(async (tx) => {
      const [ret] = await tx.select().from(returns).where(eq(returns.id, id)).limit(1);
      if (!ret) throw new HttpError(404, "Return not found");
      if (ret.channel !== "in_store" || ret.saleLineId == null) {
        throw new HttpError(400, "Only in-store returns linked to a sale can be edited here");
      }

      const { line, sale, unit } = await loadReturnContext(tx, ret.saleLineId);
      const wasFinal = FINAL_STATUSES.has(ret.status ?? "");
      const completing = !wasFinal;

      // Completing a legacy RMA restocks exactly like a fresh counter return;
      // editing an already-final return never touches stock twice — only the
      // unit's resale pricing may move.
      let restockInfo = { qty: 0, beforeQty: 0, afterQty: 0, loc: null as string | null };
      if (completing) {
        if (line.inventoryUnitId) {
          if (!unit) throw new HttpError(404, "Device unit not found");
          if (unit.status !== "sold") {
            throw new HttpError(
              409,
              `This unit is not marked sold (status: ${unit.status}) — stock was already restored for this return.`,
            );
          }
        }
        restockInfo = await restockReturnedUnit(tx, {
          line,
          sale,
          unit,
          returnId: ret.id,
          actorId: scope.userId,
          repricing,
          reason: "In-store return restock",
        });
      } else if (unit && repricing) {
        await tx
          .update(inventoryUnits)
          .set(repricingSet(repricing))
          .where(eq(inventoryUnits.id, unit.id));
      }

      const now = new Date();
      const [updated] = await tx
        .update(returns)
        .set({
          ...(refund !== null ? { refundAmount: refund } : {}),
          ...(refundMethod ? { refundMethod } : {}),
          ...(typeof body?.reason === "string" && body.reason.trim()
            ? { reason: body.reason.trim() }
            : {}),
          ...(typeof body?.condition === "string" && body.condition.trim()
            ? { condition: body.condition.trim() }
            : {}),
          ...(body?.adminNotes !== undefined ? { adminNotes: codeOrNull(body.adminNotes) } : {}),
          ...(completing
            ? { status: "refunded", refundedAt: ret.refundedAt ?? now, resolvedAt: now }
            : {}),
          updatedAt: now,
        })
        .where(eq(returns.id, id))
        .returning();

      await tx.insert(auditLog).values({
        userId: scope.userId,
        action: completing ? "return.complete" : "return.edit",
        entityType: "return",
        entityId: ret.id,
        metadata: {
          saleNumber: sale.saleNumber,
          imei: unit?.imei1 ?? unit?.imei2 ?? unit?.serialNumber ?? null,
          refundAmount: updated.refundAmount,
          refundMethod: updated.refundMethod,
          repricing: repricing ?? null,
          previousStatus: ret.status,
        },
      });

      return { completed: completing, restock: restockInfo, returnRow: updated };
    });

    return NextResponse.json({
      success: true,
      id,
      completed: outcome.completed,
      return: outcome.returnRow,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("In-store return edit error:", error);
    return NextResponse.json({ error: "Failed to update the return" }, { status: 500 });
  }
}
