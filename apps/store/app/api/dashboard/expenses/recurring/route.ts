export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenseCategories, recurringExpenseTemplates } from "@/db/schema";
import { getScope, ownerOnly } from "@/lib/authz";
import { nextRunDate, type RecurringFrequency } from "@/lib/expense-utils";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

/** GET — templates with their computed next run date. */
export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await db
    .select({
      id: recurringExpenseTemplates.id,
      name: recurringExpenseTemplates.name,
      description: recurringExpenseTemplates.description,
      categoryId: recurringExpenseTemplates.categoryId,
      amount: recurringExpenseTemplates.amount,
      frequency: recurringExpenseTemplates.frequency,
      startDate: recurringExpenseTemplates.startDate,
      dayOfMonth: recurringExpenseTemplates.dayOfMonth,
      dayOfWeek: recurringExpenseTemplates.dayOfWeek,
      paymentMethod: recurringExpenseTemplates.paymentMethod,
      payeeName: recurringExpenseTemplates.payeeName,
      requireApproval: recurringExpenseTemplates.requireApproval,
      isActive: recurringExpenseTemplates.isActive,
      status: recurringExpenseTemplates.status,
      createdAt: recurringExpenseTemplates.createdAt,
      categoryName: expenseCategories.name,
    })
    .from(recurringExpenseTemplates)
    .leftJoin(expenseCategories, eq(recurringExpenseTemplates.categoryId, expenseCategories.id))
    .orderBy(desc(recurringExpenseTemplates.createdAt));

  const now = new Date();
  const withNextRun = templates.map((t) => ({
    ...t,
    nextRun:
      t.isActive && t.status === "active"
        ? nextRunDate(
            {
              frequency: t.frequency as RecurringFrequency,
              startDate: t.startDate,
              dayOfMonth: t.dayOfMonth,
              dayOfWeek: t.dayOfWeek,
            },
            now,
          )
        : null,
  }));

  return NextResponse.json(withNextRun);
}

/** POST — create a template. Owner-only: templates generate real expenses. */
export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await req.json();
  const name = (body.name || "").trim();
  const amount = Math.round(Number(body.amount));
  const frequency = body.frequency;
  if (!name || !amount || amount <= 0 || !frequency) {
    return NextResponse.json(
      { error: "name, a positive amount, and frequency are required" },
      { status: 400 },
    );
  }

  const [template] = await db
    .insert(recurringExpenseTemplates)
    .values({
      name,
      description: body.description || null,
      categoryId: body.categoryId ? Number(body.categoryId) : null,
      amount, // poisha
      frequency,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      dayOfMonth: body.dayOfMonth ? Number(body.dayOfMonth) : null,
      dayOfWeek: body.dayOfWeek || null,
      paymentMethod: body.paymentMethod || "cash",
      payeeName: body.payeeName || null,
      requireApproval: body.requireApproval !== false,
      createdBy: scope.userId,
    })
    .returning();

  return NextResponse.json(template, { status: 201 });
}
