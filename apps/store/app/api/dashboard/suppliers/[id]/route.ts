import { db } from "@/db";
import {
  suppliers,
  supplierPayments,
  purchaseOrders,
  purchaseOrderItems,
  inventoryBatches,
  inventoryUnits,
  sales,
  saleLines,
  returns,
  barcodes,
  warranties,
  warrantyClaims,
  inventoryMovements,
  stockTransferItems,
} from "@/db/schema";
import { getScope } from "@/lib/authz";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull, notInArray, or, sql, sum } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const [poTotal] = await db
    .select({ total: sum(purchaseOrders.total) })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));

  const [payments] = await db
    .select({ total: sum(supplierPayments.amount) })
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, id));

  const totalPurchases = Number(poTotal?.total || 0);
  const totalPaid = Number(payments?.total || 0);
  const balance = (supplier.openingBalance || 0) + totalPurchases - totalPaid;

  return NextResponse.json({ ...supplier, totalPurchases, totalPaid, balance });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    verificationStatus,
    verificationNotes,
    isActive,
  } = body;

  const [row] = await db
    .update(suppliers)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type }),
      ...(contactPerson !== undefined && { contactPerson: contactPerson || null }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(address !== undefined && { address: address || null }),
      ...(city !== undefined && { city: city || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(openingBalance !== undefined && { openingBalance: Number(openingBalance) || 0 }),
      ...(nidNumber !== undefined && { nidNumber: nidNumber ? Number(nidNumber) : null }),
      ...(dob !== undefined && { dob: dob || null }),
      ...(nidImages !== undefined && { nidImages: Array.isArray(nidImages) ? nidImages : [] }),
      ...(verificationStatus !== undefined && { verificationStatus }),
      ...(verificationNotes !== undefined && { verificationNotes: verificationNotes || null }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scope = await getScope(request.headers);
  if (scope.isScoped) {
    return NextResponse.json(
      { error: "Only the store owner can manage suppliers" },
      { status: 403 },
    );
  }

  const force = ["1", "true"].includes(new URL(request.url).searchParams.get("force") ?? "");

  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const [poCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, id));
  const [batchCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(inventoryBatches)
    .where(eq(inventoryBatches.supplierId, id));
  const [paymentCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, id));

  const poN = poCount?.n ?? 0;
  const batchN = batchCount?.n ?? 0;
  const payN = paymentCount?.n ?? 0;

  // No history: remove the row outright.
  if (poN + batchN + payN === 0) {
    await db.delete(suppliers).where(eq(suppliers.id, id));
    return NextResponse.json({ deleted: true });
  }

  // Has history: confirm before wiping everything.
  if (!force) {
    return NextResponse.json(
      {
        error: `"${supplier.name}" has purchase history: ${poN} purchase order(s), ${batchN} inventory batch(es)${payN ? `, ${payN} payment record(s)` : ""}. Permanent delete removes all of it.`,
        counts: { purchaseOrders: poN, batches: batchN, payments: payN },
      },
      { status: 409 },
    );
  }

  // Force: permanently remove the supplier and all related data. Sales that
  // consist solely of this supplier's units are removed; mixed sales keep
  // their lines (unit link is dropped, snapshots preserve the IMEI/history).
  const removed = await db.transaction(async (tx) => {
    const batchRows = await tx
      .select({ id: inventoryBatches.id })
      .from(inventoryBatches)
      .where(eq(inventoryBatches.supplierId, id));
    const batchIds = batchRows.map((b) => b.id);

    let unitIds: string[] = [];
    if (batchIds.length) {
      const unitRows = await tx
        .select({ id: inventoryUnits.id })
        .from(inventoryUnits)
        .where(inArray(inventoryUnits.batchId, batchIds));
      unitIds = unitRows.map((u) => u.id);
    }

    // Sales to remove entirely: contain at least one supplier unit and no
    // lines for anything else.
    let saleIds: string[] = [];
    if (unitIds.length) {
      const withUnit = await tx
        .selectDistinct({ saleId: saleLines.saleId })
        .from(saleLines)
        .where(inArray(saleLines.inventoryUnitId, unitIds));
      const candidates = withUnit.map((r) => r.saleId);
      if (candidates.length) {
        const mixed = await tx
          .selectDistinct({ saleId: saleLines.saleId })
          .from(saleLines)
          .where(
            and(
              inArray(saleLines.saleId, candidates),
              or(isNull(saleLines.inventoryUnitId), notInArray(saleLines.inventoryUnitId, unitIds)),
            ),
          );
        const mixedSet = new Set(mixed.map((r) => r.saleId));
        saleIds = candidates.filter((sid) => !mixedSet.has(sid));

        // Mixed sales stay; just drop the unit link (snapshots keep history).
        const mixedIds = [...mixedSet];
        if (mixedIds.length) {
          await tx
            .update(saleLines)
            .set({ inventoryUnitId: null })
            .where(
              and(inArray(saleLines.saleId, mixedIds), inArray(saleLines.inventoryUnitId, unitIds)),
            );
        }
      }
    }

    // Warranty claims (and their cascaded events) must go before the
    // warranties and units they reference.
    if (saleIds.length || unitIds.length) {
      const claimWarranties = await tx
        .select({ id: warranties.id })
        .from(warranties)
        .where(
          or(
            saleIds.length
              ? inArray(
                  warranties.saleLineId,
                  tx
                    .select({ id: saleLines.id })
                    .from(saleLines)
                    .where(inArray(saleLines.saleId, saleIds)),
                )
              : undefined,
            unitIds.length ? inArray(warranties.unitId, unitIds) : undefined,
          ),
        );
      if (claimWarranties.length) {
        await tx.delete(warrantyClaims).where(
          inArray(
            warrantyClaims.warrantyId,
            claimWarranties.map((w) => w.id),
          ),
        );
      }
    }

    if (saleIds.length) {
      await tx.delete(returns).where(inArray(returns.saleId, saleIds));
      await tx.delete(barcodes).where(inArray(barcodes.saleId, saleIds));
      // sale_lines / sale_payments / sale_documents cascade from sales.
      await tx.delete(sales).where(inArray(sales.id, saleIds));
    }

    if (unitIds.length) {
      await tx.delete(warranties).where(inArray(warranties.unitId, unitIds));
      await tx.delete(inventoryMovements).where(inArray(inventoryMovements.unitId, unitIds));
      await tx.delete(stockTransferItems).where(inArray(stockTransferItems.unitId, unitIds));
      await tx.delete(inventoryUnits).where(inArray(inventoryUnits.id, unitIds));
    }

    if (batchIds.length) {
      await tx
        .delete(purchaseOrderItems)
        .where(
          inArray(
            purchaseOrderItems.poId,
            tx
              .select({ id: purchaseOrders.id })
              .from(purchaseOrders)
              .where(eq(purchaseOrders.supplierId, id)),
          ),
        );
      await tx.delete(inventoryBatches).where(inArray(inventoryBatches.id, batchIds));
    }

    await tx.delete(supplierPayments).where(eq(supplierPayments.supplierId, id));
    await tx.delete(purchaseOrders).where(eq(purchaseOrders.supplierId, id));
    await tx.delete(suppliers).where(eq(suppliers.id, id));

    return {
      purchaseOrders: poN,
      batches: batchIds.length,
      units: unitIds.length,
      sales: saleIds.length,
    };
  });

  return NextResponse.json({ deleted: true, removed });
}
