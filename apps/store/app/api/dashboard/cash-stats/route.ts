import { db } from "@/db";
import { sales, salePayments, cashRegisters, returns, locations, expenses } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql, gte, sum } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Payment breakdown (all channels, today) ─────────────────────────────
  const paymentRows = await db
    .select({
      method: salePayments.method,
      total: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int`,
    })
    .from(salePayments)
    .innerJoin(sales, eq(salePayments.saleId, sales.id))
    .where(and(eq(salePayments.status, "confirmed"), gte(sales.createdAt, today)))
    .groupBy(salePayments.method);

  const methodTotals: Record<string, number> = {};
  for (const row of paymentRows) {
    methodTotals[row.method] = row.total;
  }

  const totalCash = methodTotals["cash"] ?? 0;
  const totalCard = methodTotals["card"] ?? 0;
  const totalMFS =
    (methodTotals["mobile"] ?? 0) +
    (methodTotals["bkash"] ?? 0) +
    (methodTotals["nagad"] ?? 0) +
    (methodTotals["mfs"] ?? 0);
  const grandTotal = totalCash + totalCard + totalMFS;

  // ── Cash by channel (POS vs Online, today) ──────────────────────────────
  const cashByChannel = await db
    .select({
      channel: sales.channel,
      total: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int`,
    })
    .from(salePayments)
    .innerJoin(sales, eq(salePayments.saleId, sales.id))
    .where(
      and(
        eq(salePayments.status, "confirmed"),
        eq(salePayments.method, "cash"),
        gte(sales.createdAt, today),
      ),
    )
    .groupBy(sales.channel);

  let cashPOS = 0;
  let cashOnline = 0;
  for (const row of cashByChannel) {
    if (row.channel === "POS") cashPOS = row.total;
    else cashOnline = row.total;
  }

  // ── Cash by warehouse (POS only, today) ─────────────────────────────────
  const cashByWarehouse = await db
    .select({
      warehouse: sales.storeId,
      total: sql<number>`coalesce(sum(${salePayments.amount}), 0)::int`,
    })
    .from(salePayments)
    .innerJoin(sales, eq(salePayments.saleId, sales.id))
    .where(
      and(
        eq(salePayments.status, "confirmed"),
        eq(salePayments.method, "cash"),
        eq(sales.channel, "POS"),
        gte(sales.createdAt, today),
      ),
    )
    .groupBy(sales.storeId);

  const warehouses = cashByWarehouse.map((r) => ({
    location: r.warehouse || "Unassigned",
    cashTotal: r.total,
  }));

  // ── Cash refunds today ──────────────────────────────────────────────────
  const [refundSum] = await db
    .select({
      total: sql<number>`coalesce(sum(${returns.refundAmount}), 0)::int`,
    })
    .from(returns)
    .where(
      and(
        eq(returns.refundMethod, "cash"),
        eq(returns.status, "refunded"),
        gte(returns.refundedAt, today),
      ),
    );

  const cashRefunds = refundSum?.total ?? 0;

  // ── Expenses paid in cash today (poisha in DB → taka for this endpoint) ──
  const [cashExpenseSum] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.totalAmount}), 0)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.paymentMethod, "cash"),
        eq(expenses.paymentStatus, "paid"),
        eq(expenses.status, "approved"),
        gte(expenses.expenseDate, today),
      ),
    );

  // expenses.total_amount is stored in poisha — the cash module works in taka.
  const cashExpenses = (cashExpenseSum?.total ?? 0) / 100;

  // ── Open register ───────────────────────────────────────────────────────
  const [openRegister] = await db
    .select({
      id: cashRegisters.id,
      name: cashRegisters.name,
      openingBal: cashRegisters.openingBal,
      openedAt: cashRegisters.openedAt,
    })
    .from(cashRegisters)
    .where(eq(cashRegisters.status, "open"))
    .limit(1);

  const cashInDrawer = openRegister
    ? openRegister.openingBal + totalCash - cashRefunds - cashExpenses
    : 0;

  return NextResponse.json({
    grandTotal,
    totalCash,
    totalCard,
    totalMFS,
    cashPOS,
    cashOnline,
    warehouses,
    cashInDrawer,
    cashRefunds,
    cashExpenses,
    openRegister: openRegister ?? null,
  });
}
