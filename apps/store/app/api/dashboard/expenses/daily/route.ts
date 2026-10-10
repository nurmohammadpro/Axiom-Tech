export const dynamic = "force-dynamic";

import { db } from "@/db";
import { dailyExpenses, dailyExpenseItems } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { generateDailyExpenseNumber } from "@/lib/expense-utils";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const status = searchParams.get("status");

  const conditions = [];
  if (startDate) conditions.push(gte(dailyExpenses.expenseDate, new Date(startDate)));
  if (endDate) conditions.push(lte(dailyExpenses.expenseDate, new Date(endDate)));
  if (status) conditions.push(eq(dailyExpenses.status, status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(dailyExpenses)
    .where(where)
    .orderBy(desc(dailyExpenses.expenseDate), desc(dailyExpenses.createdAt));

  const withItems = await Promise.all(
    rows.map(async (row) => {
      const items = await db
        .select()
        .from(dailyExpenseItems)
        .where(eq(dailyExpenseItems.dailyExpenseId, row.id));

      return { ...row, items };
    })
  );

  return NextResponse.json(withItems);
}

interface DailyExpenseItemInput {
  head: string;
  customHead?: string;
  description?: string;
  amount: number;
}

export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { expenseDate, notes, items, locationId, paymentMethod } = body;

  if (!items?.length) {
    return NextResponse.json({ error: "At least one expense item is required" }, { status: 400 });
  }

  const totalAmount = (items as DailyExpenseItemInput[]).reduce(
    (sum, item) => sum + Math.round(Number(item.amount)),
    0
  );

  const expenseNumber = await generateDailyExpenseNumber();

  const [daily] = await db
    .insert(dailyExpenses)
    .values({
      expenseNumber,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      total: totalAmount,
      paymentMethod: paymentMethod || "cash",
      notes: notes || null,
      locationId: locationId || null,
      status: "paid",
      createdBy: scope.userId,
    })
    .returning();

  const insertedItems = await Promise.all(
    (items as DailyExpenseItemInput[]).map(async (item) => {
      const [inserted] = await db
        .insert(dailyExpenseItems)
        .values({
          dailyExpenseId: daily.id,
          head: item.head,
          customHead: item.customHead || null,
          description: item.description || null,
          amount: Math.round(Number(item.amount)),
        })
        .returning();
      return inserted;
    })
  );

  return NextResponse.json(
    { ...daily, items: insertedItems },
    { status: 201 }
  );
}
