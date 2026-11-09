import { db } from "@/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  products,
  productVariants,
  suppliers,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql } from "drizzle-orm";
import { getScope } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      supplier: purchaseOrders.supplier,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      total: purchaseOrders.total,
      locationId: purchaseOrders.locationId,
      notes: purchaseOrders.notes,
      createdBy: purchaseOrders.createdBy,
      createdAt: purchaseOrders.createdAt,
      receivedAt: purchaseOrders.receivedAt,
      itemCount: sql<number>`cast(count(${purchaseOrderItems.id}) as int)`,
    })
    .from(purchaseOrders)
    .leftJoin(purchaseOrderItems, eq(purchaseOrderItems.poId, purchaseOrders.id))
    .groupBy(purchaseOrders.id)
    .orderBy(desc(purchaseOrders.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);

  const body = await request.json();
  const { supplier, supplierId, locationId, notes, items } = body;

  if (!supplier || !items?.length) {
    return NextResponse.json({ error: "supplier and items array are required" }, { status: 400 });
  }

  // Require cost price and sell price for every line — prevents 0-price sales
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx] as {
      productId?: string;
      qtyOrdered?: number;
      costPrice?: number;
      sellPrice?: number;
    };
    if (!item.productId) {
      return NextResponse.json(
        { error: `Item ${idx + 1}: productId is required` },
        { status: 400 },
      );
    }
    if (!item.qtyOrdered || item.qtyOrdered < 1) {
      return NextResponse.json(
        { error: `Item ${idx + 1}: quantity must be at least 1` },
        { status: 400 },
      );
    }
    if (item.costPrice == null || Number(item.costPrice) <= 0) {
      return NextResponse.json(
        { error: `Item ${idx + 1}: cost price is required and must be greater than 0` },
        { status: 400 },
      );
    }
    if (item.sellPrice == null || Number(item.sellPrice) <= 0) {
      return NextResponse.json(
        { error: `Item ${idx + 1}: sell price is required and must be greater than 0` },
        { status: 400 },
      );
    }
    if (Number(item.sellPrice) < Number(item.costPrice)) {
      return NextResponse.json(
        {
          error: `Item ${idx + 1}: sell price (৳${item.sellPrice}) cannot be less than cost price (৳${item.costPrice})`,
        },
        { status: 400 },
      );
    }
  }

  // Calculate total from cost prices (what the store pays)
  const total = items.reduce(
    (sum: number, item: { qtyOrdered: number; costPrice: number }) =>
      sum + item.qtyOrdered * item.costPrice,
    0,
  );

  const poId = `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const [po] = await db
    .insert(purchaseOrders)
    .values({
      id: poId,
      supplier,
      supplierId: supplierId ?? null,
      total,
      locationId: locationId ?? null,
      notes: notes ?? null,
      status: "pending",
      createdBy: scope.userId ?? null,
    })
    .returning();

  if (items?.length > 0) {
    await db.insert(purchaseOrderItems).values(
      items.map(
        (i: {
          productId: string;
          variantId?: number;
          qtyOrdered: number;
          costPrice: number;
          sellPrice: number;
          costCode?: string;
          dCode?: string;
          sellCode?: string;
          category?: string;
          brandId?: number;
          batteryHealth?: number;
          conditionGrade?: string;
          color?: string;
        }) => ({
          poId: po.id,
          productId: i.productId,
          variantId: i.variantId ?? null,
          qtyOrdered: i.qtyOrdered,
          qtyReceived: 0,
          costPrice: i.costPrice,
          sellPrice: i.sellPrice,
          costCode: i.costCode ?? null,
          dCode: i.dCode ?? null,
          sellCode: i.sellCode ?? null,
          category: i.category ?? "pre-owned",
          brandId: i.brandId ?? null,
          batteryHealth: i.batteryHealth ?? null,
          conditionGrade: i.conditionGrade ?? null,
          color: i.color ?? null,
        }),
      ),
    );
  }

  return NextResponse.json(po, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [updated] = await db
    .update(purchaseOrders)
    .set(data)
    .where(eq(purchaseOrders.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (po.status === "received") {
    return NextResponse.json(
      { error: "Cannot delete a fully received purchase order" },
      { status: 409 },
    );
  }

  const items = await db
    .select({ qtyReceived: purchaseOrderItems.qtyReceived })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.poId, id));

  if (items.some((i) => (i.qtyReceived ?? 0) > 0)) {
    return NextResponse.json(
      { error: "Cannot delete a PO with received stock — cancel remaining instead" },
      { status: 409 },
    );
  }

  try {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  } catch {
    // inventory_batches.purchase_order_id still references this PO — deleting
    // it would orphan the batch, so surface the same conflict shape as above.
    return NextResponse.json(
      { error: "Cannot delete — stock batches still reference this purchase order" },
      { status: 409 },
    );
  }

  return NextResponse.json({ deleted: true });
}
