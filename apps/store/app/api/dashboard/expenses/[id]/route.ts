export const dynamic = "force-dynamic";

import { db } from "@/db";
import { expenses } from "@/db/schema";
import { getScope, ownerOnly } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(_req.headers);
  if (!scope.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);

  if (!row) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

// Editing financial records is an owner action.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;
  const body = await req.json();

  const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  const updateData: Partial<typeof expenses.$inferInsert> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description || null;
  if (body.categoryId !== undefined)
    updateData.categoryId = body.categoryId ? Number(body.categoryId) : null;
  if (body.amount !== undefined) updateData.amount = Math.round(Number(body.amount));
  if (body.vatAmount !== undefined) updateData.vatAmount = Math.round(Number(body.vatAmount));
  if (body.tdsAmount !== undefined) updateData.tdsAmount = Math.round(Number(body.tdsAmount));
  if (body.expenseDate !== undefined) updateData.expenseDate = new Date(body.expenseDate);
  if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
  if (body.paymentReference !== undefined)
    updateData.paymentReference = body.paymentReference || null;
  if (body.paymentStatus !== undefined) updateData.paymentStatus = body.paymentStatus;
  if (body.payeeName !== undefined) updateData.payeeName = body.payeeName || null;
  if (body.payeeType !== undefined) updateData.payeeType = body.payeeType || null;
  if (body.vendorInvoiceNumber !== undefined)
    updateData.vendorInvoiceNumber = body.vendorInvoiceNumber || null;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  if (body.receiptUrl !== undefined) updateData.receiptUrl = body.receiptUrl || null;
  if (body.locationId !== undefined) updateData.locationId = body.locationId || null;

  if (body.status !== undefined && body.status !== existing.status) {
    updateData.status = body.status;
    if (body.status === "approved") {
      updateData.approvedBy = scope.userId;
      updateData.approvedAt = new Date();
    } else {
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }
  }

  // Recompute the total from the merged set so partial updates stay correct.
  const amount = updateData.amount ?? existing.amount;
  const vatAmount = updateData.vatAmount ?? existing.vatAmount ?? 0;
  const tdsAmount = updateData.tdsAmount ?? existing.tdsAmount ?? 0;
  updateData.totalAmount = amount + vatAmount - tdsAmount;
  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(expenses)
    .set(updateData)
    .where(eq(expenses.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getScope(req.headers);
  const denied = ownerOnly(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { id } = await params;

  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 });
  }

  await db.delete(expenses).where(eq(expenses.id, id));

  return NextResponse.json({ success: true });
}
