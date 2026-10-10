import { db } from "@/db";
import { suppliers, supplierPayments, purchaseOrders, purchaseOrderItems, inventoryBatches, inventoryUnits, inventoryMovements, saleLines } from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sum, inArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      type: suppliers.type,
      contactPerson: suppliers.contactPerson,
      email: suppliers.email,
      phone: suppliers.phone,
      address: suppliers.address,
      city: suppliers.city,
      notes: suppliers.notes,
      openingBalance: suppliers.openingBalance,
      nidNumber: suppliers.nidNumber,
      dob: suppliers.dob,
      nidImages: suppliers.nidImages,
      isActive: suppliers.isActive,
      createdAt: suppliers.createdAt,
      updatedAt: suppliers.updatedAt,
    })
    .from(suppliers)
    .orderBy(desc(suppliers.createdAt));

  const suppliersWithBalance = await Promise.all(
    rows.map(async (s) => {
      const [poTotal] = await db
        .select({ total: sum(purchaseOrders.total) })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.supplierId, s.id));

      const [payments] = await db
        .select({ total: sum(supplierPayments.amount) })
        .from(supplierPayments)
        .where(eq(supplierPayments.supplierId, s.id));

      const totalPurchases = Number(poTotal?.total || 0);
      const totalPaid = Number(payments?.total || 0);
      const balance = (s.openingBalance || 0) + totalPurchases - totalPaid;

      return { ...s, totalPurchases, totalPaid, balance };
    }),
  );

  return NextResponse.json(suppliersWithBalance);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage suppliers" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const {
    name,
    type,
    contactPerson,
    email,
    phone,
    address,
    city,
    notes,
    openingBalance,
    nidNumber,
    dob,
    nidImages,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(suppliers)
    .values({
      name: name.trim(),
      type: type || "company",
      contactPerson: contactPerson || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      city: city || null,
      notes: notes || null,
      openingBalance: openingBalance ? Number(openingBalance) : 0,
      nidNumber: nidNumber ? Number(nidNumber) : null,
      dob: dob || null,
      nidImages: Array.isArray(nidImages) ? nidImages : [],
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage suppliers" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();
  if (!id) {
    return NextResponse.json({ error: "Supplier ID required" }, { status: 400 });
  }

  // Check for dependencies
  const [poCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));

  if (poCount.count > 0) {
    // Get PO IDs to check deeper dependencies
    const pos = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplierId, id));
    const poIds = pos.map((p) => p.id);

    // Check inventory batches linked to these POs
    const batches = await db
      .select({ id: inventoryBatches.id })
      .from(inventoryBatches)
      .where(inArray(inventoryBatches.purchaseOrderId, poIds));
    const batchIds = batches.map((b) => b.id);

    let unitCount = 0;
    if (batchIds.length > 0) {
      const [units] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryUnits)
        .where(inArray(inventoryUnits.batchId, batchIds));
      unitCount = units.count;
    }

    if (unitCount > 0) {
      // Check if any units have sales history
      const [soldUnits] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(inventoryUnits)
        .innerJoin(saleLines, eq(saleLines.inventoryUnitId, inventoryUnits.id))
        .where(inArray(inventoryUnits.batchId, batchIds));

      if (soldUnits.count > 0) {
        // Soft delete: deactivate instead of hard delete
        await db.update(suppliers).set({ isActive: false, updatedAt: new Date() }).where(eq(suppliers.id, id));
        return NextResponse.json({ success: true, deactivated: true, message: "Supplier deactivated (has sales history)" });
      }

      // Units exist but no sales - hard delete is safe
      if (batchIds.length > 0) {
        await db.delete(inventoryUnits).where(inArray(inventoryUnits.batchId, batchIds));
        await db.delete(inventoryBatches).where(inArray(inventoryBatches.id, batchIds));
      }
      await db.delete(purchaseOrderItems).where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
      await db.delete(supplierPayments).where(eq(supplierPayments.supplierId, id));
    }

await db.delete(suppliers).where(eq(suppliers.id, id));
    return NextResponse.json({ success: true, deleted: true });
  }
}
