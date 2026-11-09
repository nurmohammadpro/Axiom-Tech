export const dynamic = "force-dynamic";

import { db } from "@/db";
import {
  orders,
  orderItems,
  shipments,
  categories,
  products,
  productVariants,
  inventory,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  sales,
  saleLines,
  salePayments,
  users,
} from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { fifoSellableUnits } from "@/lib/fifo";
import { getScope, requireStaff } from "@/lib/authz";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;

  // Online order (storefront / dashboard).
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (order) {
    // Customers may only open their own orders.
    if (scope.role === "customer" && order.userId !== scope.userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const [tracking] = await db.select().from(shipments).where(eq(shipments.orderId, id));

    let customerName: string | null = null;
    if (order.userId) {
      const [u] = await db.select().from(users).where(eq(users.id, order.userId)).limit(1);
      if (u) customerName = `${u.firstName} ${u.lastName}`.trim();
    }

    return NextResponse.json({
      ...order,
      customerName,
      channel: "Online",
      items,
      tracking: tracking ?? null,
    });
  }

  // POS sale (UUID id) — unified shape so the dashboard order view works for both.
  const [sale] = await db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, id));

  // Category slugs per line (variant → product → category) so the receipt can
  // fold a pre-owned phone's discount into its printed price.
  const variantIds = [
    ...new Set(lines.map((l) => l.variantId).filter((v): v is number => v !== null)),
  ];
  const slugByVariant = new Map<number, string>();
  if (variantIds.length > 0) {
    const slugRows = await db
      .select({ id: productVariants.id, slug: categories.slug })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(productVariants.id, variantIds));
    for (const r of slugRows) slugByVariant.set(r.id, r.slug);
  }
  const [payment] = await db
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, id))
    .limit(1);

  return NextResponse.json({
    id: sale.id,
    channel: "POS",
    saleNumber: sale.saleNumber,
    invoiceNumber: sale.invoiceNumber,
    barcodeValue: sale.barcodeValue,
    status: sale.status,
    subtotal: sale.subtotal,
    shipping: 0,
    tax: sale.taxAmount,
    total: sale.totalAmount,
    paidAmount: sale.paidAmount,
    discountAmount: sale.discountAmount,
    changeAmount: sale.changeAmount,
    paymentMethod: payment?.method ?? "cash",
    customerName: sale.customerName || "Walk-in",
    customerEmail: sale.customerEmail,
    customerPhone: sale.customerPhone,
    storeId: sale.storeId,
    shippingAddress: null,
    notes: null,
    tracking: null,
    createdAt: sale.createdAt,
    items: lines.map((l) => {
      const imeis = (l.imeiSnapshot as string[]) ?? [];
      return {
        productId: l.variantId ? String(l.variantId) : null,
        name: l.productNameSnapshot,
        price: l.unitPrice,
        qty: l.quantity,
        sku: l.sku,
        imei1: imeis[0] || undefined,
        imei2: imeis[1] || undefined,
        serialNumber: l.serialSnapshot || undefined,
        discountAmount: l.discountAmount ?? 0,
        categorySlug: l.variantId ? (slugByVariant.get(l.variantId) ?? null) : null,
        totalPrice: l.unitPrice * l.quantity,
      };
    }),
  });
}

/**
 * Deduct product stock for a confirmed online order. Online orders only carry
 * a product id (no variant), so the quantity is taken from the product's
 * variants oldest-first, mirroring the POS sale deduction: for serialized
 * products the oldest available units are marked sold (so POS can't re-sell
 * the same IMEI), and the variant counter, legacy inventory row and
 * per-location balance are decremented + a movement row is logged. Idempotent
 * via the movement log — a prior deduction for this order short-circuits.
 */
async function deductStockForOrder(orderId: string) {
  const [prior] = await db
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(eq(inventoryMovements.sourceType, "order"), eq(inventoryMovements.sourceId, orderId)),
    )
    .limit(1);
  if (prior) return;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const now = new Date();

  for (const item of items) {
    const [product] = await db
      .select({ productType: products.productType })
      .from(products)
      .where(eq(products.id, item.productId))
      .limit(1);
    const requiresUnit = product?.productType !== "accessory";

    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, item.productId))
      .orderBy(productVariants.id);

    let remaining = item.qty;

    for (const variant of variants) {
      if (remaining <= 0) break;

      // Serialized stock is capped by the number of available units; quantity
      // stock by the variant's declared counter.
      let availableUnits: (typeof inventoryUnits.$inferSelect)[] = [];
      let take: number;
      if (requiresUnit) {
        // Same batch FIFO as the POS: oldest open batch first, per warehouse.
        availableUnits = await fifoSellableUnits(db, variant.id, null, remaining);
        take = availableUnits.length;
        if (take <= 0) continue;
      } else {
        const available = variant.quantity ?? 0;
        if (available <= 0) continue;
        take = Math.min(remaining, available);
      }

      const beforeQty = variant.quantity ?? 0;

      if (requiresUnit) {
        for (const unit of availableUnits) {
          await db
            .update(inventoryUnits)
            .set({ status: "sold", soldAt: now, updatedAt: now })
            .where(eq(inventoryUnits.id, unit.id));
        }
      }

      await db
        .update(productVariants)
        .set({ quantity: Math.max(0, beforeQty - take), updatedAt: now })
        .where(eq(productVariants.id, variant.id));

      const [inv] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.sku, variant.sku))
        .limit(1);
      if (inv) {
        await db
          .update(inventory)
          .set({ quantity: Math.max(0, inv.quantity - take), updatedAt: now })
          .where(eq(inventory.id, inv.id));
      }

      const [bal] = await db
        .select()
        .from(inventoryBalances)
        .where(eq(inventoryBalances.variantId, variant.id))
        .limit(1);
      if (bal) {
        await db
          .update(inventoryBalances)
          .set({ availableQty: Math.max(0, bal.availableQty - take), updatedAt: now })
          .where(eq(inventoryBalances.id, bal.id));
      }

      // One movement per marked unit for serialized stock (restore needs the
      // exact units); a single row for quantity-based stock.
      const unitIds = availableUnits.map((u) => u.id);
      const rows = unitIds.length > 0 ? unitIds.map((unitId) => ({ unitId })) : [{}];
      for (const extra of rows) {
        await db.insert(inventoryMovements).values({
          variantId: variant.id,
          ...extra,
          locationId: bal?.locationId ?? null,
          movementType: "order_confirmed",
          quantity: -take / rows.length,
          beforeQty,
          afterQty: Math.max(0, beforeQty - take),
          sourceType: "order",
          sourceId: orderId,
          reason: "Order confirmed",
        });
      }

      remaining -= take;
    }
  }
}

/** Reverse a confirmation deduction when an order is returned. */
async function restoreStockForOrder(orderId: string) {
  const movements = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(eq(inventoryMovements.sourceType, "order"), eq(inventoryMovements.sourceId, orderId)),
    );

  for (const m of movements) {
    const add = Math.abs(m.quantity);
    if (!m.variantId) continue;

    if (m.unitId) {
      const [unit] = await db
        .select()
        .from(inventoryUnits)
        .where(eq(inventoryUnits.id, m.unitId))
        .limit(1);
      if (unit && unit.status === "sold") {
        await db
          .update(inventoryUnits)
          .set({ status: "available", soldAt: null, warrantyStartAt: null, updatedAt: new Date() })
          .where(eq(inventoryUnits.id, unit.id));
      }
    }

    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, m.variantId))
      .limit(1);
    if (variant) {
      await db
        .update(productVariants)
        .set({ quantity: (variant.quantity ?? 0) + add, updatedAt: new Date() })
        .where(eq(productVariants.id, variant.id));

      const [inv] = await db
        .select()
        .from(inventory)
        .where(eq(inventory.sku, variant.sku))
        .limit(1);
      if (inv) {
        await db
          .update(inventory)
          .set({ quantity: inv.quantity + add, updatedAt: new Date() })
          .where(eq(inventory.id, inv.id));
      }
    }

    if (m.locationId) {
      const [bal] = await db
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.variantId, m.variantId),
            eq(inventoryBalances.locationId, m.locationId),
          ),
        )
        .limit(1);
      if (bal) {
        await db
          .update(inventoryBalances)
          .set({ availableQty: bal.availableQty + add, updatedAt: new Date() })
          .where(eq(inventoryBalances.id, bal.id));
      }
    }
  }

  if (movements.length > 0) {
    await db
      .delete(inventoryMovements)
      .where(
        and(eq(inventoryMovements.sourceType, "order"), eq(inventoryMovements.sourceId, orderId)),
      );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    const validStatuses = [
      "pending",
      "confirmed",
      "payment confirmed",
      "sent to courier",
      "completed",
      "returned",
    ];

    const newStatus = status.toLowerCase();
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(orders.id, id));

    // Stock moves with the status: confirming (moving past "pending") deducts
    // inventory once; returning a fulfilled order restores it. Already-confirmed
    // orders created before this logic also get caught by the idempotent check.
    const wasConfirmed = existing.status !== "pending" && existing.status !== "returned";
    if (newStatus === "returned") {
      if (wasConfirmed) await restoreStockForOrder(id);
    } else if (newStatus !== "pending") {
      await deductStockForOrder(id);
    }

    const [updated] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);

    return NextResponse.json({
      message: "Status updated",
      order: updated,
    });
  } catch (error) {
    console.error("Order update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update order" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const { id } = await params;

    // Delete order items first
    await db.delete(orderItems).where(eq(orderItems.orderId, id));

    // Delete order
    const [deleted] = await db.delete(orders).where(eq(orders.id, id)).returning();

    if (!deleted) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Order deleted",
    });
  } catch (error) {
    console.error("Order deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete order" },
      { status: 500 },
    );
  }
}
