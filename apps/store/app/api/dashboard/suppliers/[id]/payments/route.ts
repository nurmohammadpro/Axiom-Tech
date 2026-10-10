import { db } from "@/db";
import { suppliers, supplierPayments, purchaseOrders } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const rows = await db
    .select({
      id: supplierPayments.id,
      supplierId: supplierPayments.supplierId,
      purchaseOrderId: supplierPayments.purchaseOrderId,
      amount: supplierPayments.amount,
      paymentDate: supplierPayments.paymentDate,
      paymentMethod: supplierPayments.paymentMethod,
      reference: supplierPayments.reference,
      notes: supplierPayments.notes,
      createdBy: supplierPayments.createdBy,
      createdAt: supplierPayments.createdAt,
    })
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, id))
    .orderBy(desc(supplierPayments.createdAt));

  return NextResponse.json(rows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json({ error: "Only the store owner can record payments" }, { status: 403 });
  }

  const body = await request.json();
  const { amount, paymentDate, paymentMethod, purchaseOrderId, reference, notes } = body;

  if (!amount || Number(amount) <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const [supplier] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .limit(1);

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  if (purchaseOrderId) {
    const [po] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, purchaseOrderId))
      .limit(1);

    if (!po) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }
  }

  const [row] = await db
    .insert(supplierPayments)
    .values({
      supplierId: id,
      purchaseOrderId: purchaseOrderId || null,
      amount: Number(amount),
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || "cash",
      reference: reference || null,
      notes: notes || null,
      createdBy: scope.userId,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
