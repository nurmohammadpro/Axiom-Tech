import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { db, txDb } from "@/db";
import { getScope } from "@/lib/authz";
import {
  auditLog,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  locations,
  products,
  productVariants,
  stockTransferItems,
  stockTransfers,
  users,
} from "@/db/schema";
import { nextTransferNumber } from "@/lib/identifiers";
import { isUnitTracked } from "@/lib/product-tracking";

export const dynamic = "force-dynamic";

type Tx = Parameters<Parameters<typeof txDb.transaction>[0]>[0];

/** Transfers a manager may see: any that touch their warehouse. */
function scopedTransferFilter(scope: Awaited<ReturnType<typeof getScope>>) {
  if (!scope.isScoped || !scope.storeLocation) return null;
  return or(
    eq(stockTransfers.fromLocation, scope.storeLocation),
    eq(stockTransfers.toLocation, scope.storeLocation),
  );
}

interface TransferLine {
  variantId: number;
  quantity: number;
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const filter = scopedTransferFilter(scope);

  const transfers = await db
    .select({
      id: stockTransfers.id,
      transferNumber: stockTransfers.transferNumber,
      fromLocation: stockTransfers.fromLocation,
      toLocation: stockTransfers.toLocation,
      status: stockTransfers.status,
      notes: stockTransfers.notes,
      createdAt: stockTransfers.createdAt,
      completedAt: stockTransfers.completedAt,
      createdByName: users.firstName,
      createdByEmail: users.email,
    })
    .from(stockTransfers)
    .leftJoin(users, eq(stockTransfers.createdBy, users.id))
    .where(filter ?? undefined)
    .orderBy(desc(stockTransfers.createdAt));

  const items = await db
    .select({
      id: stockTransferItems.id,
      transferId: stockTransferItems.transferId,
      variantId: stockTransferItems.variantId,
      unitId: stockTransferItems.unitId,
      quantity: stockTransferItems.quantity,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
    })
    .from(stockTransferItems)
    .leftJoin(productVariants, eq(stockTransferItems.variantId, productVariants.id))
    .leftJoin(products, eq(productVariants.productId, products.id));

  const itemsByTransfer = new Map<number, (typeof items)[number][]>();
  for (const it of items) {
    const list = itemsByTransfer.get(it.transferId) ?? [];
    list.push(it);
    itemsByTransfer.set(it.transferId, list);
  }

  return NextResponse.json(
    transfers.map((t) => ({
      ...t,
      items: (itemsByTransfer.get(t.id) ?? []).map((it) => ({
        id: it.id,
        variantId: it.variantId,
        unitId: it.unitId,
        quantity: it.quantity,
        productName: it.productName,
        variantName: it.variantName,
        sku: it.sku,
      })),
    })),
  );
}

async function ensureLocation(name: string, label: string): Promise<string> {
  const [loc] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.name, name))
    .limit(1);
  if (!loc) throw new Error(`${label} location "${name}" not found`);
  return loc.name;
}

/** Deduct/credit a quantity-based balance row at a location (creates on demand). */
async function adjustBalance(tx: Tx, variantId: number, locationId: string, delta: number) {
  const [bal] = await tx
    .select()
    .from(inventoryBalances)
    .where(
      and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, locationId)),
    )
    .limit(1);
  if (bal) {
    await tx
      .update(inventoryBalances)
      .set({ availableQty: bal.availableQty + delta, updatedAt: new Date() })
      .where(eq(inventoryBalances.id, bal.id));
    return bal.availableQty + delta;
  }
  await tx.insert(inventoryBalances).values({ variantId, locationId, availableQty: delta });
  return delta;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const scope = await getScope(request.headers);
  const actorId = scope.userId;
  const fromLocation = String(body.fromLocation ?? "").trim();
  const toLocation = String(body.toLocation ?? "").trim();
  const notes = body.notes ? String(body.notes) : null;
  const lines = (Array.isArray(body.items) ? body.items : []) as TransferLine[];

  if (!fromLocation || !toLocation) {
    return NextResponse.json({ error: "Both from and to locations are required" }, { status: 400 });
  }
  if (fromLocation === toLocation) {
    return NextResponse.json({ error: "From and to locations must be different" }, { status: 400 });
  }
  // Managers/salesmen may only send stock out of their own warehouse.
  if (scope.isScoped && scope.storeLocation && fromLocation !== scope.storeLocation) {
    return NextResponse.json(
      { error: `You can only transfer stock out of ${scope.storeLocation}` },
      { status: 403 },
    );
  }
  if (lines.length === 0) {
    return NextResponse.json({ error: "Transfer needs at least one item" }, { status: 400 });
  }
  if (lines.some((l) => !l.variantId || !l.quantity || l.quantity < 1)) {
    return NextResponse.json(
      { error: "Each item needs a variantId and a positive quantity" },
      { status: 400 },
    );
  }

  try {
    const from = await ensureLocation(fromLocation, "From");
    const to = await ensureLocation(toLocation, "To");

    const result = await txDb.transaction(async (tx) => {
      const transferNumber = nextTransferNumber();
      const now = new Date();

      const [transfer] = await tx
        .insert(stockTransfers)
        .values({
          transferNumber,
          fromLocation: from,
          toLocation: to,
          status: "completed",
          notes,
          createdBy: actorId,
          completedAt: now,
        })
        .returning();

      let totalQty = 0;
      for (const line of lines) {
        const [variant] = await tx
          .select({
            id: productVariants.id,
            productId: productVariants.productId,
            sku: productVariants.sku,
            name: productVariants.name,
          })
          .from(productVariants)
          .where(eq(productVariants.id, line.variantId))
          .limit(1);
        if (!variant) throw new Error(`Variant ${line.variantId} not found`);

        const [product] = await tx
          .select({
            productType: products.productType,
            trackUnits: products.trackUnits,
            name: products.name,
          })
          .from(products)
          .where(eq(products.id, variant.productId))
          .limit(1);
        const isSerialized = !product || isUnitTracked(product);
        const displayName = product?.name ?? variant.name;

        if (isSerialized) {
          // Serialized units: physically move specific units between warehouses.
          const units = await tx
            .select()
            .from(inventoryUnits)
            .where(
              and(
                eq(inventoryUnits.variantId, line.variantId),
                eq(inventoryUnits.locationId, from),
                eq(inventoryUnits.status, "available"),
              ),
            )
            .limit(line.quantity);
          if (units.length < line.quantity) {
            throw new Error(
              `Insufficient units of ${displayName} (${variant.sku}) at ${from}: have ${units.length}, need ${line.quantity}`,
            );
          }
          for (const unit of units) {
            await tx
              .update(inventoryUnits)
              .set({ locationId: to, updatedAt: now })
              .where(eq(inventoryUnits.id, unit.id));
            await tx.insert(stockTransferItems).values({
              transferId: transfer.id,
              variantId: line.variantId,
              unitId: unit.id,
              quantity: 1,
            });
          }
          await tx.insert(inventoryMovements).values([
            {
              variantId: line.variantId,
              locationId: from,
              movementType: "transfer_out",
              quantity: -units.length,
              sourceType: "transfer",
              sourceId: String(transfer.id),
              reason: `Transfer ${transferNumber} to ${to}`,
              actorId,
            },
            {
              variantId: line.variantId,
              locationId: to,
              movementType: "transfer_in",
              quantity: units.length,
              sourceType: "transfer",
              sourceId: String(transfer.id),
              reason: `Transfer ${transferNumber} from ${from}`,
              actorId,
            },
          ]);
          totalQty += units.length;
        } else {
          // Quantity-based stock: move balance rows.
          const [bal] = await tx
            .select()
            .from(inventoryBalances)
            .where(
              and(
                eq(inventoryBalances.variantId, line.variantId),
                eq(inventoryBalances.locationId, from),
              ),
            )
            .limit(1);
          const available = bal?.availableQty ?? 0;
          if (available < line.quantity) {
            throw new Error(
              `Insufficient stock of ${displayName} (${variant.sku}) at ${from}: have ${available}, need ${line.quantity}`,
            );
          }
          await adjustBalance(tx, line.variantId, from, -line.quantity);
          await adjustBalance(tx, line.variantId, to, line.quantity);
          await tx.insert(stockTransferItems).values({
            transferId: transfer.id,
            variantId: line.variantId,
            quantity: line.quantity,
          });
          await tx.insert(inventoryMovements).values([
            {
              variantId: line.variantId,
              locationId: from,
              movementType: "transfer_out",
              quantity: -line.quantity,
              sourceType: "transfer",
              sourceId: String(transfer.id),
              reason: `Transfer ${transferNumber} to ${to}`,
              actorId,
            },
            {
              variantId: line.variantId,
              locationId: to,
              movementType: "transfer_in",
              quantity: line.quantity,
              sourceType: "transfer",
              sourceId: String(transfer.id),
              reason: `Transfer ${transferNumber} from ${from}`,
              actorId,
            },
          ]);
          totalQty += line.quantity;
        }
      }

      await tx.insert(auditLog).values({
        userId: actorId,
        action: "inventory.transfer",
        entityType: "stock_transfer",
        entityId: String(transfer.id),
        metadata: { transferNumber, from, to, itemCount: lines.length, totalQty },
      });

      return { transfer, totalQty };
    });

    return NextResponse.json(
      {
        id: result.transfer.id,
        transferNumber: result.transfer.transferNumber,
        fromLocation: from,
        toLocation: to,
        status: result.transfer.status,
        totalQty: result.totalQty,
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
