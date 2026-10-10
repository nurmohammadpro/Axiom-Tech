import { db } from "@/db";
import {
  customers,
  products,
  productVariants,
  exchangeOrders,
  inventory,
  inventoryBatches,
  inventoryBalances,
  inventoryUnits,
  locations,
  unitSpecs,
  productSpecs,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, inArray, or, sql } from "drizzle-orm";
import { METHOD_LABELS } from "@/lib/payment-methods";
import {
  nextExchangeNumber,
  nextBatchNumber,
  generateBarcodeNumber,
  normalizeName,
} from "@/lib/identifiers";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const { customerId, tradeIn, newDevice, payment, payments, locationId, notes } = body;

  // Split tenders: prefer the payments[] array; fall back to the legacy single
  // payment object so older clients still work.
  const tenders = (Array.isArray(payments) && payments.length > 0 ? payments : [payment])
    .filter((p: any) => p && p.method && Number(p.amount) > 0)
    .map((p: any) => ({
      method: p.method,
      amount: Math.round(Number(p.amount)) || 0,
      reference: p.reference?.trim() || null,
    }));
  const totalPaid = tenders.reduce((s: number, p: any) => s + p.amount, 0);
  const methodLabel =
    tenders.length > 0
      ? tenders.map((p: any) => METHOD_LABELS[p.method] ?? p.method).join(" + ")
      : "cash";
  const reference =
    tenders
      .map((p: any) => p.reference)
      .filter(Boolean)
      .join(", ") || null;

  if (!customerId) {
    return NextResponse.json({ error: "Customer is required" }, { status: 400 });
  }

  if (!tradeIn?.productName || !tradeIn?.costCode || !tradeIn?.sellCode || !tradeIn?.agreedValue) {
    return NextResponse.json({ error: "Trade-in details are required" }, { status: 400 });
  }

  // Extract D-Code from trade-in data if provided
  const tradeInDCode = tradeIn.dCode || null;

  if (!tradeIn?.costPrice || !tradeIn?.sellPrice) {
    return NextResponse.json({ error: "Cost and sell prices are required" }, { status: 400 });
  }

  if (!newDevice?.variantId || !newDevice?.price) {
    return NextResponse.json({ error: "New device details are required" }, { status: 400 });
  }

  if (!locationId) {
    return NextResponse.json({ error: "Location is required" }, { status: 400 });
  }

  try {
    // Start transaction-like flow (we'll do sequential operations for now)

    // Units and batches key warehouses by location NAME (e.g. "Play Store
    // 4th Floor"). The client may send the location id ("3") or its code —
    // resolve whatever arrived to the canonical name.
    let locationName = locationId;
    const [locRow] = await db
      .select()
      .from(locations)
      .where(
        or(
          eq(locations.code, locationId),
          eq(locations.name, locationId),
          sql`${locations.id}::text = ${locationId}`,
        ),
      )
      .limit(1);
    if (locRow) locationName = locRow.name;

    // 1. Verify customer exists
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    // 2. Verify new device variant exists and has stock
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, newDevice.variantId))
      .limit(1);

    if (!variant) {
      return NextResponse.json({ error: "New device variant not found" }, { status: 404 });
    }

    if (variant.quantity < 1) {
      return NextResponse.json({ error: "New device is out of stock" }, { status: 400 });
    }

    // 3. Find or create trade-in product — match the name case- and
    // whitespace-insensitively so an exchange reuses the catalog row instead
    // of forking a near-duplicate product.
    let tradeInProduct = await db
      .select()
      .from(products)
      .where(
        eq(sql`lower(btrim(${products.name}))`, normalizeName(String(tradeIn.productName ?? ""))),
      )
      .limit(1);

    let tradeInProductId: string;
    if (tradeInProduct.length === 0) {
      // Create new product for trade-in device
      const [newProduct] = await db
        .insert(products)
        .values({
          id: `exc-${Date.now()}`,
          name: tradeIn.productName,
          short: tradeIn.productName.substring(0, 30),
          description: "Exchange device",
          price: tradeIn.sellPrice,
          costPrice: tradeIn.costPrice,
          costCode: tradeIn.costCode,
          dCode: tradeInDCode,
          sellCode: tradeIn.sellCode,
          productType: "exchange",
          category: tradeIn.category || "pre-owned",
          brandId: tradeIn.brandId || null,
          publishStatus: "published",
          inStock: true,
          images: [],
        })
        .returning();
      tradeInProductId = newProduct.id;
    } else {
      tradeInProductId = tradeInProduct[0].id;
      // Update pricing codes and category if different
      await db
        .update(products)
        .set({
          costCode: tradeIn.costCode,
          dCode: tradeInDCode,
          sellCode: tradeIn.sellCode,
          costPrice: tradeIn.costPrice,
          price: tradeIn.sellPrice,
          category: tradeIn.category || "pre-owned",
          brandId: tradeIn.brandId || null,
          updatedAt: new Date(),
        })
        .where(eq(products.id, tradeInProductId));
    }

    // 4. Create or update inventory entry for trade-in device at location
    const existingInventory = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.productId, tradeInProductId), eq(inventory.location, locationName)))
      .limit(1);

    if (existingInventory.length > 0) {
      await db
        .update(inventory)
        .set({
          quantity: existingInventory[0].quantity + (tradeIn.qty || 1),
          updatedAt: new Date(),
        })
        .where(eq(inventory.id, existingInventory[0].id));
    } else {
      await db.insert(inventory).values({
        productId: tradeInProductId,
        sku: `exc-${tradeInProductId}-${Date.now()}`,
        quantity: tradeIn.qty || 1,
        location: locationName,
      });
    }

    // 4b. Resolve the traded-in device's OWN variant — trade-in units must
    // become sellable stock of the traded-in model, not the new device's.
    let [tradeInVariantRow] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, tradeInProductId))
      .orderBy(productVariants.id)
      .limit(1);

    if (!tradeInVariantRow) {
      const [created] = await db
        .insert(productVariants)
        .values({
          productId: tradeInProductId,
          name: "Default",
          sku: `EXC-${tradeInProductId.slice(0, 16)}-${Date.now().toString(36).toUpperCase()}`,
          attribute: [],
          quantity: 0,
          costPrice: tradeIn.costPrice,
          sellingPrice: tradeIn.sellPrice,
        })
        .returning();
      tradeInVariantRow = created;
    }

    // 5. Create inventory units with IMEI tracking. Trade-in units get their own
    // batch so their agreed cost flows into cost tracking like any other
    // receipt — but under the TRADED-IN model's variant, sellable immediately.
    const tradeInUnits = tradeIn.units || [];
    if (tradeInUnits.length > 0) {
      const [batch] = await db
        .insert(inventoryBatches)
        .values({
          batchNumber: nextBatchNumber(),
          variantId: tradeInVariantRow.id, // the traded-in model's variant
          locationId: locationName,
          source: "trade_in",
          unitCost: tradeIn.costPrice,
          quantityReceived: tradeInUnits.length,
        })
        .returning({ id: inventoryBatches.id });

      const unitsToInsert = tradeInUnits.map((unit: any) => ({
        variantId: tradeInVariantRow.id, // the traded-in model's variant
        batchId: batch.id,
        locationId: locationName,
        imei1: unit.imei1 || null,
        imei2: unit.imei2 || null,
        serialNumber: unit.serial || null,
        batteryHealth: unit.batteryHealth ? parseInt(unit.batteryHealth) : null,
        conditionGrade: unit.conditionGrade || "Good",
        status: "available", // sellable immediately, like a PO receive
        acquisitionCost: tradeIn.costPrice,
        currentPrice: tradeIn.sellPrice,
        costCode: tradeIn.costCode || null,
        dCode: tradeInDCode,
        sellCode: tradeIn.sellCode || null,
        receivedAt: new Date(),
      }));

      const insertedUnits = await db
        .insert(inventoryUnits)
        .values(unitsToInsert)
        .returning({ id: inventoryUnits.id });

      // Stock counters: variant quantity + per-location available balance.
      await db
        .update(productVariants)
        .set({
          quantity: (tradeInVariantRow.quantity ?? 0) + tradeInUnits.length,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, tradeInVariantRow.id));

      const [existingBalance] = await db
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.variantId, tradeInVariantRow.id),
            eq(inventoryBalances.locationId, locationName),
          ),
        )
        .limit(1);
      if (existingBalance) {
        await db
          .update(inventoryBalances)
          .set({
            availableQty: existingBalance.availableQty + tradeInUnits.length,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, existingBalance.id));
      } else {
        await db.insert(inventoryBalances).values({
          variantId: tradeInVariantRow.id,
          locationId: locationName,
          availableQty: tradeInUnits.length,
        });
      }

      // Save per-unit specs and sync common ones to product catalog
      if (tradeInUnits.some((u: any) => u.specs && Object.keys(u.specs).length > 0)) {
        const specEntries: { unitId: string; label: string; value: string }[] = [];
        const tradeInProductIdForSpecs = tradeInProductId; // The trade-in product

        tradeInUnits.forEach((unit: any, idx: number) => {
          if (unit.specs) {
            for (const [label, value] of Object.entries(unit.specs)) {
              if (value && String(value).trim()) {
                specEntries.push({
                  unitId: insertedUnits[idx].id,
                  label,
                  value: String(value).trim(),
                });
              }
            }
          }
        });

        if (specEntries.length > 0) {
          await db.insert(unitSpecs).values(specEntries).onConflictDoNothing();

          // Sync common specs to product catalog (most frequent value per label across ALL units)
          if (tradeInProductIdForSpecs) {
            // Get all unit IDs for this product's variants
            const allVariantIds = await db
              .select({ id: productVariants.id })
              .from(productVariants)
              .where(eq(productVariants.productId, tradeInProductIdForSpecs));

            const variantIds = allVariantIds.map((v) => v.id);
            if (variantIds.length > 0) {
              const allUnitIds = await db
                .select({ id: inventoryUnits.id })
                .from(inventoryUnits)
                .where(inArray(inventoryUnits.variantId, variantIds));

              const unitIds = allUnitIds.map((u) => u.id);
              if (unitIds.length > 0) {
                const allUnitSpecs = await db
                  .select({ label: unitSpecs.label, value: unitSpecs.value })
                  .from(unitSpecs)
                  .where(inArray(unitSpecs.unitId, unitIds));

                const specCounts = new Map<string, Map<string, number>>();
                for (const entry of allUnitSpecs) {
                  if (!specCounts.has(entry.label)) specCounts.set(entry.label, new Map());
                  const counts = specCounts.get(entry.label)!;
                  counts.set(entry.value, (counts.get(entry.value) ?? 0) + 1);
                }

                for (const [label, counts] of specCounts) {
                  let topValue = "";
                  let topCount = 0;
                  for (const [value, count] of counts) {
                    if (count > topCount) {
                      topCount = count;
                      topValue = value;
                    }
                  }
                  if (topValue) {
                    await db
                      .insert(productSpecs)
                      .values({ productId: tradeInProductIdForSpecs, label, value: topValue })
                      .onConflictDoUpdate({
                        target: [productSpecs.productId, productSpecs.label],
                        set: { value: topValue },
                      });
                  }
                }
              }
            }
          }
        }
      }
    }

    // 6. Create exchange order
    const newDeviceUnit = {
      imei1: newDevice?.imei1?.trim() || null,
      imei2: newDevice?.imei2?.trim() || null,
      serial: newDevice?.serial?.trim() || null,
    };
    const [exchangeOrder] = await db
      .insert(exchangeOrders)
      .values({
        customerId,
        tradeInProductId,
        tradeInProductVariantId: tradeInVariantRow.id,
        tradeInCostCode: tradeIn.costCode,
        tradeInDCode: tradeInDCode,
        tradeInSellCode: tradeIn.sellCode,
        tradeInCostPrice: tradeIn.costPrice,
        tradeInSellPrice: tradeIn.sellPrice,
        tradeInAgreedValue: tradeIn.agreedValue,
        tradeInItems: tradeIn.units || [],
        newProductVariantId: newDevice.variantId,
        newProductPrice: newDevice.price,
        newDeviceUnit:
          newDeviceUnit.imei1 || newDeviceUnit.imei2 || newDeviceUnit.serial ? newDeviceUnit : null,
        invoiceNumber: nextExchangeNumber(),
        barcodeValue: generateBarcodeNumber(),
        paymentAmount: totalPaid,
        paymentMethod: methodLabel,
        paymentReference: reference,
        payments: tenders,
        locationId: locationName,
        notes: notes || null,
        status: "complete",
      })
      .returning();

    // 7. Update customer totals
    await db
      .update(customers)
      .set({
        totalExchanges: (customer.totalExchanges || 0) + 1,
        totalExchangeValue: (customer.totalExchangeValue || 0) + tradeIn.agreedValue,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));

    // 8. Decrease stock for new device
    await db
      .update(productVariants)
      .set({
        quantity: variant.quantity - 1,
        updatedAt: new Date(),
      })
      .where(eq(productVariants.id, newDevice.variantId));

    // 8b. Mark the specific handed-over unit sold so it can't be double-sold,
    // and drop it from the per-location balance.
    const handoverImei = newDeviceUnit.imei1 || newDeviceUnit.imei2;
    if (handoverImei) {
      const [handover] = await db
        .select()
        .from(inventoryUnits)
        .where(
          and(
            eq(inventoryUnits.variantId, newDevice.variantId),
            eq(inventoryUnits.status, "available"),
            or(eq(inventoryUnits.imei1, handoverImei), eq(inventoryUnits.imei2, handoverImei)),
          ),
        )
        .limit(1);
      if (handover) {
        await db
          .update(inventoryUnits)
          .set({ status: "sold", soldAt: new Date(), updatedAt: new Date() })
          .where(eq(inventoryUnits.id, handover.id));
        const [handoverBal] = await db
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.variantId, handover.variantId),
              eq(inventoryBalances.locationId, handover.locationId ?? locationName),
            ),
          )
          .limit(1);
        if (handoverBal) {
          await db
            .update(inventoryBalances)
            .set({
              availableQty: Math.max(0, handoverBal.availableQty - 1),
              updatedAt: new Date(),
            })
            .where(eq(inventoryBalances.id, handoverBal.id));
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        exchangeId: exchangeOrder.id,
        message: "Exchange processed successfully",
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Exchange processing error:", error);
    return NextResponse.json(
      { error: error.message || "Exchange processing failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
  }

  const exchanges = await db
    .select({
      id: exchangeOrders.id,
      tradeInProductId: exchangeOrders.tradeInProductId,
      tradeInCostCode: exchangeOrders.tradeInCostCode,
      tradeInSellCode: exchangeOrders.tradeInSellCode,
      tradeInAgreedValue: exchangeOrders.tradeInAgreedValue,
      newProductVariantId: exchangeOrders.newProductVariantId,
      newProductPrice: exchangeOrders.newProductPrice,
      paymentAmount: exchangeOrders.paymentAmount,
      paymentMethod: exchangeOrders.paymentMethod,
      locationId: exchangeOrders.locationId,
      notes: exchangeOrders.notes,
      status: exchangeOrders.status,
      createdAt: exchangeOrders.createdAt,
    })
    .from(exchangeOrders)
    .where(eq(exchangeOrders.customerId, customerId))
    .orderBy(desc(exchangeOrders.createdAt));

  return NextResponse.json(exchanges);
}
