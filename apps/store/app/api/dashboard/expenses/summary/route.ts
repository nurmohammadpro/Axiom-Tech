export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, gte, sql } from "drizzle-orm";

/**
 * GET — aggregate spend for the insights cards: monthly trend, category
 * breakdown, top payees. Excludes rejected/cancelled rows.
 */
export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const months = Math.min(24, Math.max(2, Number(searchParams.get("months") || 6)));

  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - (months - 1), 1));

  const base = [
    gte(expenses.expenseDate, windowStart),
    ne(expenses.status, "rejected"),
    ne(expenses.status, "cancelled"),
  ];
  if (scope.isScoped) base.push(eq(expenses.locationId, scope.storeLocation!));
  const where = and(...base);

  const monthExpr = sql<string>`to_char(${expenses.expenseDate} at time zone 'UTC', 'YYYY-MM')`;

  const monthly = await db
    .select({
      month: monthExpr,
      total: sql<number>`coalesce(sum(${expenses.totalAmount}), 0)::int`,
    })
    .from(expenses)
    .where(where)
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  const byCategory = await db
    .select({
      categoryId: expenses.categoryId,
      name: expenseCategories.name,
      color: expenseCategories.color,
      total: sql<number>`coalesce(sum(${expenses.totalAmount}), 0)::int`,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(where)
    .groupBy(expenses.categoryId, expenseCategories.name, expenseCategories.color)
    .orderBy(sql`sum(${expenses.totalAmount}) desc`)
    .limit(8);

  const byPayee = await db
    .select({
      payee: expenses.payeeName,
      total: sql<number>`coalesce(sum(${expenses.totalAmount}), 0)::int`,
    })
    .from(expenses)
    .where(and(where, sql`${expenses.payeeName} is not null`))
    .groupBy(expenses.payeeName)
    .orderBy(sql`sum(${expenses.totalAmount}) desc`)
    .limit(5);

  const [totals] = await db
    .select({
      vat: sql<number>`coalesce(sum(${expenses.vatAmount}), 0)::int`,
      tds: sql<number>`coalesce(sum(${expenses.tdsAmount}), 0)::int`,
      pendingTotal: sql<number>`coalesce(sum(case when ${expenses.paymentStatus} = 'pending' then ${expenses.totalAmount} else 0 end), 0)::int`,
    })
    .from(expenses)
    .where(where);

  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const monthMap = new Map(monthly.map((m) => [m.month, m.total]));

  return NextResponse.json({
    monthly,
    byCategory,
    byPayee,
    vat: totals?.vat ?? 0,
    tds: totals?.tds ?? 0,
    pendingTotal: totals?.pendingTotal ?? 0,
    currentMonthTotal: monthMap.get(currentMonth) ?? 0,
    prevMonthTotal: monthMap.get(prevMonth) ?? 0,
  });
}
