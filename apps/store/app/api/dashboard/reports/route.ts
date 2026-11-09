import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql, type Column } from "drizzle-orm";
import { db } from "@/db";
import { getScope } from "@/lib/authz";
import { computePnl } from "@/lib/profit";
import {
  categories,
  customers,
  exchangeOrders,
  inventoryBatches,
  inventoryUnits,
  orderItems,
  orders,
  products,
  productVariants,
  returns,
  saleLines,
  salePayments,
  sales,
  users,
} from "@/db/schema";

export const dynamic = "force-dynamic";

/** Inclusive `created_at::date` window from `?from=&to=` (YYYY-MM-DD). */
function rangeWhere(col: Column, from: string | null, to: string | null) {
  const parts = [];
  if (from) parts.push(sql`${col}::date >= ${from}::date`);
  if (to) parts.push(sql`${col}::date <= ${to}::date`);
  return parts.length ? and(...parts) : undefined;
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const scopedTo = scope.isScoped ? (scope.storeLocation ?? null) : null;

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  // ── Online (storefront) orders ──────────────────────────────────────────
  // Managers/salesmen are pinned to their own warehouse and don't fulfill
  // online orders, so only the owner sees the orders report.
  const onlineRows = scopedTo
    ? []
    : await db
        .select({
          id: orders.id,
          customerName: users.firstName,
          customerEmail: users.email,
          customerPhone: users.phone,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(rangeWhere(orders.createdAt, from, to))
        .orderBy(desc(orders.createdAt));

  let orderItemRows: (typeof orderItems.$inferSelect & { costPrice: number | null })[] = [];
  if (onlineRows.length) {
    orderItemRows = await db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        name: orderItems.name,
        qty: orderItems.qty,
        price: orderItems.price,
        imeiSnapshot: orderItems.imeiSnapshot,
        warrantyPolicyId: orderItems.warrantyPolicyId,
        warrantySnapshot: orderItems.warrantySnapshot,
        warrantyStartsAt: orderItems.warrantyStartsAt,
        warrantyExpiresAt: orderItems.warrantyExpiresAt,
        costPrice: productVariants.costPrice,
      })
      .from(orderItems)
      .leftJoin(productVariants, eq(orderItems.productId, productVariants.productId))
      .where(
        inArray(
          orderItems.orderId,
          onlineRows.map((o) => o.id),
        ),
      );
  }

  // ── POS sales ───────────────────────────────────────────────────────────
  const saleRows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      invoiceNumber: sales.invoiceNumber,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      customerEmail: sales.customerEmail,
      status: sales.status,
      warehouse: sales.storeId,
      subtotal: sales.subtotal,
      discountAmount: sales.discountAmount,
      taxAmount: sales.taxAmount,
      total: sales.totalAmount,
      cashierId: sales.cashierId,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .where(
      and(
        scopedTo ? eq(sales.storeId, scopedTo) : undefined,
        rangeWhere(sales.createdAt, from, to),
      ),
    )
    .orderBy(desc(sales.createdAt));

  let saleLineRows: (typeof saleLines.$inferSelect & {
    costPrice: number | null;
    categorySlug: string | null;
  })[] = [];
  let paymentRows: (typeof salePayments.$inferSelect)[] = [];
  const cashierNameById = new Map<string, string>();
  if (saleRows.length) {
    const saleIds = saleRows.map((s) => s.id);
    [saleLineRows, paymentRows] = await Promise.all([
      db
        .select({
          id: saleLines.id,
          saleId: saleLines.saleId,
          productNameSnapshot: saleLines.productNameSnapshot,
          sku: saleLines.sku,
          quantity: saleLines.quantity,
          unitPrice: saleLines.unitPrice,
          lineTotal: saleLines.lineTotal,
          imeiSnapshot: saleLines.imeiSnapshot,
          categorySlug: categories.slug,
          // Frozen at sale time from the batch; falls back to the variant cost for
          // historical rows written before the snapshot existed.
          costPrice: sql<
            number | null
          >`coalesce(${saleLines.costPrice}, ${inventoryUnits.acquisitionCost}, ${inventoryBatches.unitCost}, ${productVariants.costPrice})`,
          variantId: saleLines.variantId,
          discountAmount: saleLines.discountAmount,
          taxAmount: saleLines.taxAmount,
          inventoryUnitId: saleLines.inventoryUnitId,
          attributesSnapshot: saleLines.attributesSnapshot,
          serialSnapshot: saleLines.serialSnapshot,
          warrantySnapshot: saleLines.warrantySnapshot,
          warrantyPolicyId: saleLines.warrantyPolicyId,
          warrantyStartsAt: saleLines.warrantyStartsAt,
          warrantyExpiresAt: saleLines.warrantyExpiresAt,
        })
        .from(saleLines)
        .leftJoin(productVariants, eq(saleLines.sku, productVariants.sku))
        .leftJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(inventoryUnits, eq(saleLines.inventoryUnitId, inventoryUnits.id))
        .leftJoin(inventoryBatches, eq(inventoryUnits.batchId, inventoryBatches.id))
        .where(inArray(saleLines.saleId, saleIds)),
      db.select().from(salePayments).where(inArray(salePayments.saleId, saleIds)),
    ]);
    const cashierIds = [...new Set(saleRows.map((s) => s.cashierId).filter(Boolean) as string[])];
    if (cashierIds.length) {
      const cashiers = await db
        .select({
          id: users.id,
          name: sql<string>`trim(concat(${users.firstName}, ' ', ${users.lastName}))`.as("name"),
        })
        .from(users)
        .where(inArray(users.id, cashierIds));
      for (const c of cashiers) cashierNameById.set(c.id, c.name);
    }
  }

  // ── Assemble per-record item + payment data ─────────────────────────────
  const itemsByOrder = new Map<string, typeof orderItemRows>();
  for (const oi of orderItemRows) {
    const list = itemsByOrder.get(oi.orderId) ?? [];
    list.push(oi);
    itemsByOrder.set(oi.orderId, list);
  }

  const itemsBySale = new Map<string, typeof saleLineRows>();
  for (const l of saleLineRows) {
    const list = itemsBySale.get(l.saleId) ?? [];
    list.push(l);
    itemsBySale.set(l.saleId, list);
  }

  const methodsBySale = new Map<string, string[]>();
  for (const p of paymentRows) {
    const list = methodsBySale.get(p.saleId) ?? [];
    list.push(p.method);
    methodsBySale.set(p.saleId, list);
  }

  const ordersReport = onlineRows.map((o) => ({
    id: o.id,
    customerName: o.customerName || o.customerEmail || "Guest",
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    status: o.status,
    paymentMethod: o.paymentMethod,
    total: o.total,
    createdAt: o.createdAt,
    items: (itemsByOrder.get(o.id) ?? []).map((i) => ({
      name: i.name,
      qty: i.qty,
      price: i.price,
      costPrice: i.costPrice,
      productId: i.productId,
    })),
  }));

  const posReport = saleRows.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    invoiceNumber: s.invoiceNumber,
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    customerEmail: s.customerEmail,
    status: s.status,
    warehouse: s.warehouse,
    cashierId: s.cashierId,
    cashierName: s.cashierId ? (cashierNameById.get(s.cashierId) ?? null) : null,
    paymentMethods: methodsBySale.get(s.id) ?? [],
    subtotal: s.subtotal,
    discountAmount: s.discountAmount,
    taxAmount: s.taxAmount,
    total: s.total,
    createdAt: s.createdAt,
    items: (itemsBySale.get(s.id) ?? []).map((l) => ({
      name: l.productNameSnapshot,
      sku: l.sku,
      qty: l.quantity,
      unitPrice: l.unitPrice,
      costPrice: l.costPrice,
      lineTotal: l.lineTotal,
      imeis: (l.imeiSnapshot as string[]) ?? [],
      discountAmount: l.discountAmount,
      categorySlug: l.categorySlug,
    })),
  }));

  // ── P&L — same shared definition the dashboard uses, so they always agree ─
  const pnl = await computePnl(from, to);

  // ── Exchanges list (for the P&L breakdown + any exchange view) ───────────
  const exchangeRows = await db
    .select({
      id: exchangeOrders.id,
      invoiceNumber: exchangeOrders.invoiceNumber,
      newProductPrice: exchangeOrders.newProductPrice,
      tradeInAgreedValue: exchangeOrders.tradeInAgreedValue,
      status: exchangeOrders.status,
      createdAt: exchangeOrders.createdAt,
      customerName: customers.name,
    })
    .from(exchangeOrders)
    .leftJoin(customers, eq(customers.id, exchangeOrders.customerId))
    .where(rangeWhere(exchangeOrders.createdAt, from, to))
    .orderBy(desc(exchangeOrders.createdAt));

  // ── Returns list (POS in-store + any online) for the Returns tab ─────────
  const returnRows = await db
    .select({
      id: returns.id,
      saleId: returns.saleId,
      orderId: returns.orderId,
      channel: returns.channel,
      customerName: returns.customerName,
      productName: returns.productName,
      qty: returns.qty,
      reason: returns.reason,
      resolutionType: returns.resolutionType,
      status: returns.status,
      refundAmount: returns.refundAmount,
      refundMethod: returns.refundMethod,
      createdAt: returns.createdAt,
    })
    .from(returns)
    .where(rangeWhere(returns.createdAt, from, to))
    .orderBy(desc(returns.createdAt));

  // ── Sales by warehouse summary (used by the Warehouse tab) ──────────────
  const warehouseRows = await db
    .select({
      warehouse: sales.storeId,
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${sales.totalAmount}), 0)::int`,
    })
    .from(sales)
    .where(
      and(
        scopedTo ? eq(sales.storeId, scopedTo) : undefined,
        rangeWhere(sales.createdAt, from, to),
      ),
    )
    .groupBy(sales.storeId);

  return NextResponse.json({
    orders: ordersReport,
    posSales: posReport,
    returns: returnRows,
    exchanges: exchangeRows.map((e) => ({
      id: e.id,
      invoiceNumber: e.invoiceNumber,
      customerName: e.customerName,
      newProductPrice: e.newProductPrice,
      tradeInAgreedValue: e.tradeInAgreedValue,
      status: e.status,
      createdAt: e.createdAt,
    })),
    summary: {
      grossRevenue: pnl.grossRevenue,
      discounts: pnl.discounts,
      netRevenue: pnl.netRevenue,
      cogs: pnl.cogs,
      grossProfit: pnl.salesGrossProfit,
      preOwnedProfit: pnl.preOwnedProfit,
      itemsSold: pnl.itemsSold,
      salesCount: pnl.salesCount,
      exchangeValueIn: pnl.exchangeValueIn,
      exchangeCost: pnl.exchangeCost,
      exchangeProfit: pnl.exchangeProfit,
      exchangeCount: exchangeRows.length,
      expenses: pnl.expenses,
      netProfit: pnl.netProfit,
      from,
      to,
    },
    salesByWarehouse: warehouseRows.map((r) => ({
      warehouse: r.warehouse ?? "Unassigned",
      orders: r.orders,
      revenue: r.revenue,
    })),
    scope: {
      isScoped: scope.isScoped,
      storeLocation: scope.storeLocation,
    },
  });
}
