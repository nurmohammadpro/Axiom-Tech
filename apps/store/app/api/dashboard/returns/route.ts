import { db, txDb } from "@/db";
import {
  returns,
  orders,
  products,
  users,
  saleLines,
  sales,
  inventory,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  productVariants,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, and, ilike, or } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();

  const conditions = [];
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(sales.id, pattern),
        ilike(sales.customerName, pattern),
        ilike(sales.customerPhone, pattern),
        ilike(sales.customerEmail, pattern),
        ilike(returns.id, pattern),
        ilike(returns.customerName, pattern),
        ilike(returns.customerPhone, pattern),
        ilike(returns.customerEmail, pattern),
        ilike(returns.productName, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      id: returns.id,
      orderId: returns.orderId,
      userId: returns.userId,
      customerEmail: returns.customerEmail,
      customerPhone: returns.customerPhone,
      customerName: returns.customerName,
      productId: returns.productId,
      productName: returns.productName,
      qty: returns.qty,
      reason: returns.reason,
      condition: returns.condition,
      resolutionType: returns.resolutionType,
      channel: returns.channel,
      status: returns.status,
      adminNotes: returns.adminNotes,
      refundAmount: returns.refundAmount,
      refundMethod: returns.refundMethod,
      refundedAt: returns.refundedAt,
      saleId: returns.saleId,
      saleLineId: returns.saleLineId,
      exchangeOrderId: returns.exchangeOrderId,
      trackingNumber: returns.trackingNumber,
      createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
      resolvedAt: returns.resolvedAt,
      // Get customer name from users table if userId exists
      userFirstName: sql<string>`COALESCE(${users.firstName}, ${returns.customerName}, 'Guest')`.as(
        "userFirstName",
      ),
      userLastName: users.lastName,
    })
    .from(returns)
    .leftJoin(users, eq(returns.userId, users.id))
    .leftJoin(sales, eq(returns.saleId, sales.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(returns.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const body = await request.json();
    const [ret] = await db.insert(returns).values(body).returning();
    return NextResponse.json(ret, { status: 201 });
  } catch (error) {
    console.error("Return creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create return" },
      { status: 500 },
    );
  }
}

const FINAL_STATUSES = new Set(["refunded", "completed"]);

/**
 * Restore stock for an in-store return linked to a POS sale line. Mirrors the
 * sales-commit deduction in reverse: unit back to received, variant/inventory/
 * balance quantities incremented, and a "return" movement logged.
 */
async function restoreStockFromSaleLine(returnId: string, saleLineId: number) {
  await txDb.transaction(async (tx) => {
    const [line] = await tx.select().from(saleLines).where(eq(saleLines.id, saleLineId)).limit(1);
    if (!line) throw new Error(`Sale line ${saleLineId} not found`);
    if (!line.variantId) throw new Error(`Sale line ${saleLineId} has no variant`);
    const variantId = line.variantId;

    const sale = line.saleId
      ? (
          await tx
            .select({ storeId: sales.storeId })
            .from(sales)
            .where(eq(sales.id, line.saleId))
            .limit(1)
        )[0]
      : undefined;
    const [variant] = await tx
      .select({ quantity: productVariants.quantity, sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);
    if (!variant) throw new Error(`Variant ${variantId} not found`);

    const unit = line.inventoryUnitId
      ? await tx
          .select({ locationId: inventoryUnits.locationId })
          .from(inventoryUnits)
          .where(eq(inventoryUnits.id, line.inventoryUnitId))
          .limit(1)
          .then((r) => r[0])
      : undefined;

    const qty = line.quantity;
    const loc = unit?.locationId ?? sale?.storeId ?? null;
    const beforeQty = variant.quantity;
    const afterQty = beforeQty + qty;

    if (line.inventoryUnitId) {
      await tx
        .update(inventoryUnits)
        .set({ status: "received", soldAt: null })
        .where(eq(inventoryUnits.id, line.inventoryUnitId));
    }

    await tx
      .update(productVariants)
      .set({ quantity: afterQty })
      .where(eq(productVariants.id, variantId));

    const [inv] = await tx.select().from(inventory).where(eq(inventory.sku, variant.sku));
    if (inv) {
      await tx
        .update(inventory)
        .set({ quantity: inv.quantity + qty })
        .where(eq(inventory.id, inv.id));
    }

    const [bal] = loc
      ? await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)),
          )
          .limit(1)
      : await tx
          .select()
          .from(inventoryBalances)
          .where(eq(inventoryBalances.variantId, variantId))
          .limit(1);
    if (bal) {
      await tx
        .update(inventoryBalances)
        .set({ availableQty: bal.availableQty + qty })
        .where(eq(inventoryBalances.id, bal.id));
    }

    await tx.insert(inventoryMovements).values({
      variantId,
      unitId: line.inventoryUnitId ?? null,
      locationId: loc,
      movementType: "return",
      quantity: qty,
      beforeQty,
      afterQty,
      sourceType: "return",
      sourceId: returnId,
      reason: "Return restock",
    });
  });
}

export async function PATCH(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const [existing] = await db
      .select({
        status: returns.status,
        saleLineId: returns.saleLineId,
        resolutionType: returns.resolutionType,
        refundMethod: returns.refundMethod,
        refundedAt: returns.refundedAt,
      })
      .from(returns)
      .where(eq(returns.id, id))
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const now = new Date().toISOString();
    const updateData = { ...data };

    // A refunded/completed transition is final: record when it was resolved and,
    // when a payment method is supplied, when the refund itself was issued.
    if (FINAL_STATUSES.has(data.status)) {
      if (!updateData.resolvedAt) updateData.resolvedAt = now;
      if (data.status === "refunded" && !updateData.refundedAt) updateData.refundedAt = now;
    }

    const [updated] = await db
      .update(returns)
      .set(updateData)
      .where(eq(returns.id, id))
      .returning();

    // Restore stock exactly once: only when the return moves INTO a final state
    // and it is linked to a POS sale line. Repairs return the item to the
    // customer, so completed repairs do not restock.
    const isFinalNow = FINAL_STATUSES.has(updated.status ?? "");
    const wasFinalBefore = FINAL_STATUSES.has(existing.status ?? "");
    const shouldRestock =
      isFinalNow &&
      !wasFinalBefore &&
      updated.saleLineId != null &&
      !(updated.status === "completed" && updated.resolutionType === "repair");

    if (shouldRestock) {
      await restoreStockFromSaleLine(updated.id, updated.saleLineId!);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Return update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update return" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const [deleted] = await db.delete(returns).where(eq(returns.id, id)).returning();
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Return deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete return" },
      { status: 500 },
    );
  }
}
