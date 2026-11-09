import { txDb } from "@/db";
import {
  auditLog,
  customers,
  exchangeOrders,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  products,
  productVariants,
  returns,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, or } from "drizzle-orm";
import { getScope, requireStaff } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Return of a device that was handed over through an exchange.
 *
 * Exchanges don't create a POS sale line, so the counter return flow can't find
 * them. This endpoint takes the exchange order, matches the exact unit handed
 * over (by its IMEI/serial snapshot), and restocks it as immediately sellable
 * stock — mirroring the in-store return: fresh counter-set pricing, warranty
 * cleared, and variant/balance/movement/audit bookkeeping — in one transaction.
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

  const exchangeOrderId = typeof body?.exchangeOrderId === "string" ? body.exchangeOrderId : null;
  const refund = Math.round(Number(body?.refundAmount));
  const rawMethod = typeof body?.refundMethod === "string" ? body.refundMethod : "cash";
  const refundMethod = ["cash", "card", "mobile"].includes(rawMethod) ? rawMethod : "cash";
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "other";
  const condition =
    typeof body?.condition === "string" && body.condition.trim() ? body.condition.trim() : "used";
  const adminNotes = codeOrNull(body?.adminNotes);
  const repricing = body?.repricing ?? null;

  if (!exchangeOrderId) {
    return NextResponse.json({ error: "exchangeOrderId is required" }, { status: 400 });
  }
  if (!Number.isFinite(refund) || refund < 0) {
    return NextResponse.json({ error: "Refund amount must be a number ≥ 0" }, { status: 400 });
  }

  try {
    const outcome = await txDb.transaction(async (tx) => {
      const [ex] = await tx
        .select()
        .from(exchangeOrders)
        .where(eq(exchangeOrders.id, exchangeOrderId))
        .limit(1);
      if (!ex) throw new HttpError(404, "Exchange order not found");

      const handover = (ex.newDeviceUnit ?? {}) as {
        imei1?: string | null;
        imei2?: string | null;
        serial?: string | null;
      };
      const matchValues = [handover.imei1, handover.imei2, handover.serial].filter(
        (v): v is string => Boolean(v),
      );
      if (matchValues.length === 0) {
        throw new HttpError(409, "This exchange has no device IMEI/serial to return");
      }

      // Row-lock the exact handed-over unit so two counters can't double-return.
      const [unit] = await tx
        .select()
        .from(inventoryUnits)
        .where(
          and(
            ex.newProductVariantId
              ? eq(inventoryUnits.variantId, ex.newProductVariantId)
              : undefined,
            or(
              ...matchValues.flatMap((v) => [
                eq(inventoryUnits.imei1, v),
                eq(inventoryUnits.imei2, v),
                eq(inventoryUnits.serialNumber, v),
              ]),
            ),
          ),
        )
        .for("update");
      if (!unit) {
        throw new HttpError(404, "The device handed over in this exchange was not found");
      }
      if (unit.status !== "sold") {
        throw new HttpError(
          409,
          `This unit is not marked sold (status: ${unit.status}) — it may already have been returned.`,
        );
      }

      // One active return per exchange order.
      const [dupe] = await tx
        .select({ id: returns.id })
        .from(returns)
        .where(and(eq(returns.exchangeOrderId, exchangeOrderId), ne(returns.status, "rejected")))
        .limit(1);
      if (dupe) {
        throw new HttpError(409, `This exchange already has a return (${dupe.id}).`);
      }

      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, unit.variantId))
        .limit(1);
      if (!variant) throw new HttpError(400, "Cannot resolve the product for this device");

      const [product] = await tx
        .select({ name: products.name })
        .from(products)
        .where(eq(products.id, variant.productId))
        .limit(1);

      const [customer] = await tx
        .select({ name: customers.name, phone: customers.phone, email: customers.email })
        .from(customers)
        .where(eq(customers.id, ex.customerId))
        .limit(1);

      const now = new Date();
      const returnId = `RET-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      await tx.insert(returns).values({
        id: returnId,
        channel: "in_store",
        exchangeOrderId,
        userId: scope.userId,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        customerEmail: customer?.email ?? null,
        productId: variant.productId,
        productName: product?.name ?? variant.name ?? "Device",
        qty: 1,
        reason,
        condition,
        resolutionType: "exchange",
        status: "refunded",
        adminNotes,
        refundAmount: refund,
        refundMethod,
        refundedAt: now,
        resolvedAt: now,
      });

      // Restock the unit as immediately sellable with counter-set pricing.
      await tx
        .update(inventoryUnits)
        .set({
          status: "available",
          soldAt: null,
          receivedAt: now,
          warrantyStartAt: null,
          warrantyEndAt: null,
          ...repricingSet(repricing ?? {}),
          updatedAt: now,
        })
        .where(eq(inventoryUnits.id, unit.id));

      // Variant counter, per-location balance, and movement.
      const beforeQty = variant.quantity;
      const afterQty = beforeQty + 1;
      await tx
        .update(productVariants)
        .set({ quantity: afterQty, updatedAt: now })
        .where(eq(productVariants.id, variant.id));

      const loc = unit.locationId ?? ex.locationId ?? null;
      if (loc) {
        const [bal] = await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(eq(inventoryBalances.variantId, variant.id), eq(inventoryBalances.locationId, loc)),
          )
          .limit(1);
        if (bal) {
          await tx
            .update(inventoryBalances)
            .set({ availableQty: bal.availableQty + 1, updatedAt: now })
            .where(eq(inventoryBalances.id, bal.id));
        } else {
          await tx
            .insert(inventoryBalances)
            .values({ variantId: variant.id, locationId: loc, availableQty: 1 });
        }
      }

      await tx.insert(inventoryMovements).values({
        variantId: variant.id,
        unitId: unit.id,
        locationId: loc,
        movementType: "return",
        quantity: 1,
        beforeQty,
        afterQty,
        sourceType: "exchange_return",
        sourceId: exchangeOrderId,
        reason: "Exchange hand-over returned",
        actorId: scope.userId,
      });

      await tx.insert(auditLog).values({
        userId: scope.userId,
        action: "return.complete",
        entityType: "return",
        entityId: returnId,
        metadata: {
          origin: "exchange",
          exchangeOrderId,
          exchangeInvoice: ex.invoiceNumber,
          imei: unit.imei1 ?? unit.imei2 ?? unit.serialNumber ?? null,
          refundAmount: refund,
          refundMethod,
          repricing: repricing ?? null,
        },
      });

      return {
        returnId,
        refund,
        refundMethod,
        variantId: variant.id,
        qty: 1,
        beforeQty,
        afterQty,
        loc,
      };
    });

    return NextResponse.json(
      { success: true, id: outcome.returnId, return: outcome },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Exchange return error:", error);
    return NextResponse.json({ error: "Failed to complete the exchange return" }, { status: 500 });
  }
}
