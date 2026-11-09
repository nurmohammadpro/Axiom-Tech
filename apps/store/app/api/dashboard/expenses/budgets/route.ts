export const dynamic = "force-dynamic";

import { db } from "@/db";
import { budgets, expenseCategories, expenses } from "@/db/schema";
import { getScope, ownerOnly } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, ne, sql } from "drizzle-orm";

/** "YYYY-MM" → { periodStart, periodEnd } covering the calendar month (UTC). */
function monthWindow(month: string) {
  const [y, m] = month.split("-").map(Number);
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { periodStart, periodEnd };
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET — per-category budget vs actual for one month. Returns every active
 * category; `allocated` is 0 when no budget row exists for the month.
 */
export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") || currentMonth();
  const { periodStart, periodEnd } = monthWindow(month);

  const categories = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.isActive, true))
    .orderBy(expenseCategories.sortOrder, expenseCategories.name);

  const budgetWhere = [eq(budgets.periodType, "monthly"), eq(budgets.periodStart, periodStart)];
  if (scope.isScoped) budgetWhere.push(eq(budgets.locationId, scope.storeLocation!));

  const budgetRows = await db
    .select()
    .from(budgets)
    .where(and(...budgetWhere));
  const allocatedBy = new Map(budgetRows.map((b) => [b.categoryId, b.allocatedAmount]));

  // Actual spend = everything not rejected/cancelled in the month.
  const spendWhere = [
    gte(expenses.expenseDate, periodStart),
    lte(expenses.expenseDate, periodEnd),
    ne(expenses.status, "rejected"),
    ne(expenses.status, "cancelled"),
  ];
  if (scope.isScoped) spendWhere.push(eq(expenses.locationId, scope.storeLocation!));

  const spendRows = await db
    .select({
      categoryId: expenses.categoryId,
      total: sql<number>`coalesce(sum(${expenses.totalAmount}), 0)::int`,
    })
    .from(expenses)
    .where(and(...spendWhere))
    .groupBy(expenses.categoryId);
  const spentBy = new Map(spendRows.map((r) => [r.categoryId!, r.total]));

  return NextResponse.json({
    month,
    rows: categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      code: c.code,
      color: c.color,
      allocated: allocatedBy.get(c.id) ?? 0,
      spent: spentBy.get(c.id) ?? 0,
      defaultBudgetAmount: c.defaultBudgetAmount ?? 0,
      budgetAlertThreshold: c.budgetAlertThreshold ?? 80,
    })),
  });
}

/** POST — upsert one category's monthly allocation. Owner-only. */
export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await req.json();
  const categoryId = Number(body.categoryId);
  const allocatedAmount = Math.round(Number(body.allocatedAmount));
  const month = body.month || currentMonth();
  if (!categoryId || Number.isNaN(allocatedAmount) || allocatedAmount < 0) {
    return NextResponse.json(
      { error: "categoryId and a non-negative allocatedAmount are required" },
      { status: 400 },
    );
  }

  const { periodStart, periodEnd } = monthWindow(month);
  const locationId = scope.storeLocation;

  const [row] = await db
    .insert(budgets)
    .values({
      categoryId,
      locationId,
      periodType: "monthly",
      periodStart,
      periodEnd,
      allocatedAmount,
      createdBy: scope.userId,
    })
    .onConflictDoUpdate({
      target: [budgets.categoryId, budgets.locationId, budgets.periodType, budgets.periodStart],
      set: { allocatedAmount, isActive: true, updatedAt: new Date() },
    })
    .returning();

  return NextResponse.json(row);
}
