export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenses, expenseCategories } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { generateExpenseNumber } from "@/lib/expense-numbers";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, gte, lte, sql, ilike, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const categoryId = searchParams.get("category_id");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const paymentMethod = searchParams.get("payment_method");
  const paymentStatus = searchParams.get("payment_status");
  const search = searchParams.get("search");
  const locationId = searchParams.get("location_id");
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("page_size") || 50)));

  const conditions = [];

  // Warehouse staff only see expenses recorded against their location.
  if (scope.isScoped) {
    conditions.push(eq(expenses.locationId, scope.storeLocation!));
  } else if (locationId) {
    conditions.push(eq(expenses.locationId, locationId));
  }
  if (status && status !== "All") {
    conditions.push(eq(expenses.status, status));
  }
  if (categoryId) {
    conditions.push(eq(expenses.categoryId, Number(categoryId)));
  }
  if (startDate) {
    conditions.push(gte(expenses.expenseDate, new Date(startDate)));
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(expenses.expenseDate, end));
  }
  if (paymentMethod && paymentMethod !== "All") {
    conditions.push(eq(expenses.paymentMethod, paymentMethod));
  }
  if (paymentStatus && paymentStatus !== "All") {
    conditions.push(eq(expenses.paymentStatus, paymentStatus));
  }
  if (search) {
    const needle = `%${search}%`;
    conditions.push(
      or(
        ilike(expenses.name, needle),
        ilike(expenses.payeeName, needle),
        ilike(expenses.expenseNumber, needle),
        ilike(expenses.notes, needle),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: expenses.id,
      expenseNumber: expenses.expenseNumber,
      categoryId: expenses.categoryId,
      name: expenses.name,
      description: expenses.description,
      amount: expenses.amount,
      vatAmount: expenses.vatAmount,
      tdsAmount: expenses.tdsAmount,
      totalAmount: expenses.totalAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      paymentMethod: expenses.paymentMethod,
      paymentReference: expenses.paymentReference,
      paymentStatus: expenses.paymentStatus,
      payeeName: expenses.payeeName,
      payeeType: expenses.payeeType,
      vendorInvoiceNumber: expenses.vendorInvoiceNumber,
      status: expenses.status,
      approvedBy: expenses.approvedBy,
      approvedAt: expenses.approvedAt,
      locationId: expenses.locationId,
      receiptUrl: expenses.receiptUrl,
      notes: expenses.notes,
      createdBy: expenses.createdBy,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      // Category info
      categoryName: expenseCategories.name,
      categoryCode: expenseCategories.code,
      categoryIcon: expenseCategories.icon,
      categoryColor: expenseCategories.color,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .where(where)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(where);

  return NextResponse.json({
    rows,
    total: countRow?.count ?? 0,
    page,
    pageSize,
  });
}

/** Insert one expense row, retrying the generated number on unique collisions. */
async function insertExpenseWithNumber(
  values: Omit<typeof expenses.$inferInsert, "expenseNumber">,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const expenseNumber = await generateExpenseNumber(attempt);
    try {
      const [row] = await db
        .insert(expenses)
        .values({ ...values, expenseNumber })
        .returning();
      return row;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "23505") throw err;
      // unique violation on expense_number — retry with a bumped sequence
    }
  }
  throw new Error("Could not allocate an expense number — try again");
}

export async function POST(req: NextRequest) {
  const scope = await getScope(req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    description,
    categoryId,
    amount,
    vatAmount = 0,
    tdsAmount = 0,
    currency = "BDT",
    exchangeRate = 100,
    originalAmount,
    originalCurrency,
    expenseDate,
    paymentMethod = "cash",
    paymentReference,
    paymentStatus = "paid",
    payeeName,
    payeeType,
    vendorInvoiceNumber,
    vendorInvoiceDate,
    status,
    locationId,
    notes,
    isReimbursable = false,
    budgetCategory,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Expense name is required" }, { status: 400 });
  }
  if (!amount || Number(amount) <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  // Approval: owners create pre-approved expenses; staff submissions wait for review.
  const resolvedStatus = scope.isOwner
    ? status === "pending"
      ? "pending"
      : "approved"
    : "pending";

  const row = await insertExpenseWithNumber({
    categoryId: categoryId ? Number(categoryId) : null,
    name: name.trim(),
    description: description || null,
    amount: Math.round(Number(amount)),
    vatAmount: Math.round(Number(vatAmount)),
    tdsAmount: Math.round(Number(tdsAmount)),
    totalAmount: Math.round(Number(amount) + Number(vatAmount) - Number(tdsAmount)),
    currency,
    exchangeRate: Math.round(Number(exchangeRate)),
    originalAmount: originalAmount ? Math.round(Number(originalAmount)) : null,
    originalCurrency: originalCurrency || null,
    expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
    paymentMethod,
    paymentReference: paymentReference || null,
    paymentStatus,
    payeeName: payeeName || null,
    payeeType: payeeType || null,
    vendorInvoiceNumber: vendorInvoiceNumber || null,
    vendorInvoiceDate: vendorInvoiceDate ? new Date(vendorInvoiceDate) : null,
    status: resolvedStatus,
    approvedBy: resolvedStatus === "approved" ? scope.userId : null,
    approvedAt: resolvedStatus === "approved" ? new Date() : null,
    locationId: scope.storeLocation ?? locationId ?? null,
    notes: notes || null,
    isReimbursable,
    budgetCategory: budgetCategory || null,
    createdBy: scope.userId,
  });

  return NextResponse.json(row, { status: 201 });
}
