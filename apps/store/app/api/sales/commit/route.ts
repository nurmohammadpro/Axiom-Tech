import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getScope } from "@/lib/authz";
import { locations } from "@/db/schema";
import { db, txDb } from "@/db";
import {
  auditLog,
  inventory,
  inventoryBalances,
  inventoryMovements,
  inventoryUnits,
  products,
  productVariants,
  saleDocuments,
  saleLines,
  salePayments,
  sales,
  warranties,
  warrantyPolicies,
} from "@/db/schema";
import { getStoreInfo } from "@/lib/store-settings";
import { computeSaleTotals } from "@/lib/sale-pricing";
import { warrantyEndAt, warrantySnapshot } from "@/lib/warranty";
import { batchLabel, fifoSellableUnits, getBatchById, isUnitSellable } from "@/lib/fifo";
import { isUnitTracked } from "@/lib/product-tracking";
import {
  generateBarcodeNumber,
  generateVerificationToken,
  nextInvoiceNumber,
  nextSaleNumber,
  generateVerificationNumber,
} from "@/lib/identifiers";

export const dynamic = "force-dynamic";

interface CommitLine {
  variantId?: number;
  unitId?: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  warrantyPolicyId?: number | null;
}

interface CommitBody {
  idempotencyKey?: string;
  channel?: string;
  cashierId?: string;
  registerSessionId?: number;
  storeId?: string;
  /** Selling location (warehouse) name — stock checks/deductions apply there. */
  locationId?: string;
  /** Optional backdated sale date (`YYYY-MM-DD`) for entering a missed sale. */
  soldAt?: string;
  customer?: { name?: string; phone?: string; email?: string };
  lines: CommitLine[];
  payments?: { method: string; amount: number; reference?: string }[];
}

/**
 * Parse an optional `YYYY-MM-DD` sale date. Returns null when absent, and throws
 * for malformed or future dates (future sales must not be backfilled).
 */
function parseSaleDate(soldAt: string | undefined): Date | null {
  if (!soldAt) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(soldAt)) {
    throw new Error("Invalid sale date — expected YYYY-MM-DD");
  }
  const parsed = new Date(`${soldAt}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid sale date");
  if (parsed.getTime() > Date.now() + 60_000) {
    throw new Error("Sale date cannot be in the future");
  }
  return parsed;
}

type Tx = Parameters<Parameters<typeof txDb.transaction>[0]>[0];

type CommitResult =
  | { replay: true; saleId: string; saleNumber: string }
  | {
      replay: false;
      sale: typeof sales.$inferSelect;
      verificationCode: string;
      warranties: { unitId: string | null; expiresAt: Date | null }[];
    };

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CommitBody;
  const scope = await getScope(request.headers);
  const cashierId = scope.userId ?? body.cashierId;

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "Sale must have at least one line" }, { status: 400 });
  }
  if (body.lines.some((l) => !l.quantity || l.quantity < 1)) {
    return NextResponse.json({ error: "Each line needs a positive quantity" }, { status: 400 });
  }

  const store = await getStoreInfo();
  const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();

  // Resolve the selling location:
  // - scoped staff (managers/salesmen) are always pinned to their own warehouse
  // - an explicit locationId pins the sale to that warehouse
  // - otherwise (owner, "All locations") stock is picked from ANY warehouse, so
  //   the sale is NOT forced onto the default warehouse (which may hold no stock)
  let saleLocation: string | null = scope.isScoped ? scope.storeLocation : null;
  if (!saleLocation && body.locationId) {
    const [loc] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.name, body.locationId))
      .limit(1);
    if (loc) saleLocation = loc.name;
  }

  try {
    // Backdated sale (entering a missed sale): the picked date drives the sale,
    // identifier and warranty timestamps. Otherwise everything uses the current time.
    const sellTime = parseSaleDate(body.soldAt) ?? new Date();

    const result: CommitResult = await txDb.transaction(async (tx): Promise<CommitResult> => {
      // Idempotency: a previous commit with this key short-circuits.
      const [existing] = await tx
        .select()
        .from(sales)
        .where(eq(sales.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        return { replay: true, saleId: existing.id, saleNumber: existing.saleNumber };
      }

      const saleNumber = nextSaleNumber(sellTime);
      const invoiceNumber = nextInvoiceNumber(sellTime);
      const barcodeValue = generateBarcodeNumber(sellTime);
      const { raw: verificationCode, hash: verificationTokenHash } = generateVerificationToken();

      const now = new Date();
      const customerName = body.customer?.name?.trim() || "Walk-in";
      const customerPhone = body.customer?.phone?.trim() || "";

      interface LinePlan {
        variantId: number | null;
        unitId: string | null;
        sku: string;
        productName: string;
        attributes: unknown;
        imeis: string[];
        serial: string | null;
        quantity: number;
        unitPrice: number;
        costPrice: number;
        discountAmount: number;
        warrantyPolicyId: number | null;
      }

      const plans: LinePlan[] = [];
      const unitsToSell: { unit: typeof inventoryUnits.$inferSelect }[] = [];
      const qtyAdj = new Map<
        number,
        { qty: number; sku: string; name: string; productType: string }
      >();

      for (const line of body.lines) {
        const quantity = line.quantity ?? 1;
        const discountAmount = line.discountAmount ?? 0;

        if (line.unitId) {
          // Serialized unit (phone, laptop, ...). One physical item per line.
          if (quantity !== 1) {
            throw new Error(`Serialized unit ${line.unitId} must be sold with quantity 1`);
          }
          const [unit] = await tx
            .select()
            .from(inventoryUnits)
            .where(eq(inventoryUnits.id, line.unitId))
            .limit(1);
          if (!unit) throw new Error(`Unit ${line.unitId} not found`);
          if (unit.status !== "available") {
            throw new Error(`Unit ${line.unitId} is not available (status: ${unit.status})`);
          }
          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, unit.variantId))
            .limit(1);
          if (!variant) throw new Error(`Variant for unit ${line.unitId} not found`);
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, variant.productId))
            .limit(1);

          // Hard FIFO lock: an older batch at this warehouse must sell first.
          const unitBatch = unit.batchId ? await getBatchById(tx, unit.batchId) : null;
          const { sellable, oldest } = await isUnitSellable(tx, unit);
          if (!sellable) {
            const thisBatch = unitBatch
              ? batchLabel(unitBatch)
              : unit.batchId
                ? "an unknown batch"
                : "an unbatched unit";
            const mustSell = oldest ? batchLabel(oldest) : "an older batch";
            throw new Error(
              `FIFO stock order: this unit is from ${thisBatch}, but ${mustSell} must sell first` +
                `${unit.locationId ? ` at ${unit.locationId}` : ""}. Please sell the older batch first.`,
            );
          }

          const unitPrice = line.unitPrice ?? unit.currentPrice ?? variant.sellingPrice;
          if (!unitPrice || unitPrice <= 0) {
            throw new Error(`Cannot sell ${variant.sku}: sell price is not set (purchase intake missing sell price)`);
          }
          const costPrice = unit.acquisitionCost ?? unitBatch?.unitCost ?? variant.costPrice ?? 0;

          plans.push({
            variantId: unit.variantId,
            unitId: unit.id,
            sku: variant.sku,
            productName: product?.name ?? variant.name,
            attributes: variant.attribute,
            imeis: [unit.imei1, unit.imei2].filter(Boolean) as string[],
            serial: unit.serialNumber,
            quantity: 1,
            unitPrice,
            costPrice,
            discountAmount,
            warrantyPolicyId: line.warrantyPolicyId ?? null,
          });
          unitsToSell.push({ unit });

          const adj = qtyAdj.get(unit.variantId) ?? {
            qty: 0,
            sku: variant.sku,
            name: variant.name,
            productType: product?.productType ?? "new",
          };
          adj.qty += 1;
          qtyAdj.set(unit.variantId, adj);
        } else if (line.variantId) {
          const [variant] = await tx
            .select()
            .from(productVariants)
            .where(eq(productVariants.id, line.variantId))
            .limit(1);
          if (!variant) throw new Error(`Variant ${line.variantId} not found`);
          const [product] = await tx
            .select()
            .from(products)
            .where(eq(products.id, variant.productId))
            .limit(1);

          const unitPrice = line.unitPrice ?? variant.sellingPrice;
          if (!unitPrice || unitPrice <= 0) {
            throw new Error(`Cannot sell ${variant.sku}: sell price is not set (purchase intake missing sell price)`);
          }
          const requiresUnit = !product || isUnitTracked(product);

          if (requiresUnit) {
            // Serialized product added without a unit scan (manual barcode / tap):
            // auto-pick the OLDEST OPEN BATCH first (per warehouse) so newer, more
            // expensive batches stay locked until the older one is sold out.
            const picked = await fifoSellableUnits(tx, variant.id, saleLocation, quantity);
            if (picked.length < quantity) {
              throw new Error(
                `Insufficient stock for ${variant.name} (${variant.sku})${
                  saleLocation ? ` at ${saleLocation}` : ""
                } — receive or transfer units first`,
              );
            }
            // Batch rates for the picked units, for the cost snapshot.
            const batchCostById = new Map<string, number>();
            for (const batchId of [
              ...new Set(picked.map((u) => u.batchId).filter(Boolean) as string[]),
            ]) {
              const batch = await getBatchById(tx, batchId);
              if (batch) batchCostById.set(batchId, batch.unitCost);
            }
            for (const unit of picked) {
              const resolvedPrice = line.unitPrice ?? unit.currentPrice ?? variant.sellingPrice;
              if (!resolvedPrice || resolvedPrice <= 0) {
                throw new Error(`Cannot sell ${variant.sku}: sell price is not set (purchase intake missing sell price)`);
              }
              const costPrice =
                unit.acquisitionCost ??
                (unit.batchId ? batchCostById.get(unit.batchId) : undefined) ??
                variant.costPrice ??
                0;
              plans.push({
                variantId: variant.id,
                unitId: unit.id,
                sku: variant.sku,
                productName: product?.name ?? variant.name,
                attributes: variant.attribute,
                imeis: [unit.imei1, unit.imei2].filter(Boolean) as string[],
                serial: unit.serialNumber,
                quantity: 1,
                unitPrice: resolvedPrice,
                costPrice,
                discountAmount,
                warrantyPolicyId: line.warrantyPolicyId ?? null,
              });
              unitsToSell.push({ unit });
              const adj = qtyAdj.get(variant.id) ?? {
                qty: 0,
                sku: variant.sku,
                name: variant.name,
                productType: product?.productType ?? "new",
              };
              adj.qty += 1;
              qtyAdj.set(variant.id, adj);
            }
          } else {
            // Quantity-based line — accessory / non-serialized stock.
            plans.push({
              variantId: variant.id,
              unitId: null,
              sku: variant.sku,
              productName: product?.name ?? variant.name,
              attributes: variant.attribute,
              imeis: [],
              serial: null,
              quantity,
              unitPrice,
              costPrice: variant.costPrice ?? 0,
              discountAmount,
              warrantyPolicyId: line.warrantyPolicyId ?? null,
            });

            const adj = qtyAdj.get(variant.id) ?? {
              qty: 0,
              sku: variant.sku,
              name: variant.name,
              productType: product?.productType ?? "new",
            };
            adj.qty += quantity;
            qtyAdj.set(variant.id, adj);
          }
        } else {
          throw new Error("Each line needs either a variantId or a unitId");
        }
      }

      // Validate stock for quantity lines (serialized units already checked above).
      // When selling from a specific location, check that warehouse's balance.
      for (const [variantId, adj] of qtyAdj) {
        if (saleLocation) {
          const [bal] = await tx
            .select()
            .from(inventoryBalances)
            .where(
              and(
                eq(inventoryBalances.variantId, variantId),
                eq(inventoryBalances.locationId, saleLocation),
              ),
            )
            .limit(1);
          const availableQty = bal?.availableQty ?? 0;
          if (availableQty < adj.qty) {
            throw new Error(`Insufficient stock for ${adj.name} (${adj.sku}) at ${saleLocation}`);
          }
        } else {
          const [variant] = await tx
            .select({ quantity: productVariants.quantity })
            .from(productVariants)
            .where(eq(productVariants.id, variantId))
            .limit(1);
          if ((variant?.quantity ?? 0) < adj.qty) {
            throw new Error(`Insufficient stock for ${adj.name} (${adj.sku})`);
          }
        }
      }

      const totals = computeSaleTotals(
        plans.map((p) => ({
          unitPrice: p.unitPrice,
          quantity: p.quantity,
          discountAmount: p.discountAmount,
        })),
        store,
      );

      const payments = body.payments?.length
        ? body.payments
        : [{ method: "cash", amount: totals.totalAmount }];
      const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
      if (paidAmount < totals.totalAmount) {
        throw new Error(
          `Payment ${paidAmount} is less than total ${totals.totalAmount} (due sales are not supported)`,
        );
      }
      const changeAmount = paidAmount - totals.totalAmount;

      // For "All locations" sales the warehouse shown on the receipt/orders list
      // is the location of the first unit actually sold.
      const unitLoc = unitsToSell[0]?.unit.locationId ?? null;
      const effectiveStoreId = saleLocation ?? unitLoc ?? body.storeId ?? "default";

      const [sale] = await tx
        .insert(sales)
        .values({
          saleNumber,
          invoiceNumber,
          barcodeValue,
          channel: body.channel ?? "POS",
          customerName,
          customerPhone,
          customerEmail: body.customer?.email?.trim() || null,
          storeId: effectiveStoreId,
          registerSessionId: body.registerSessionId ?? null,
          cashierId: cashierId || null,
          status: "completed",
          subtotal: totals.subtotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount,
          changeAmount,
          currency: store.currency,
          verificationTokenHash,
          idempotencyKey,
          createdAt: sellTime,
          finalizedAt: sellTime,
        })
        .returning();
      const saleId = sale.id;

      // Per-line snapshots + warranty creation.
      const warrantyByPolicy = new Map<number, typeof warrantyPolicies.$inferSelect>();
      const warrantiesCreated: {
        unitId: string | null;
        expiresAt: Date | null;
      }[] = [];

      for (const p of plans) {
        const [variant] = await tx
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, p.variantId!))
          .limit(1);
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, variant.productId))
          .limit(1);

        // The product's catalog warranty is the default; a cashier may still
        // override it per line. Resolve one effective policy so the entitlement,
        // snapshot and sale-line columns always describe the same coverage.
        const effectivePolicyId = p.warrantyPolicyId ?? product.warrantyPolicyId ?? null;

        let warranty: unknown = null;
        let pendingWarrantyId: string | null = null;
        let appliedPolicyId: number | null = null;
        let appliedStartsAt: Date | null = null;
        let appliedExpiresAt: Date | null = null;
        if (effectivePolicyId) {
          let policy = warrantyByPolicy.get(effectivePolicyId);
          if (!policy) {
            const [found] = await tx
              .select()
              .from(warrantyPolicies)
              .where(eq(warrantyPolicies.id, effectivePolicyId))
              .limit(1);
            if (found) {
              policy = found;
              warrantyByPolicy.set(found.id, found);
            }
          }
          if (policy) {
            const expiresAt = warrantyEndAt(policy, sellTime);
            warranty = warrantySnapshot(policy, sellTime, expiresAt);
            const [w] = await tx
              .insert(warranties)
              .values({
                unitId: p.unitId,
                customerId: null,
                policyId: policy.id,
                startsAt: sellTime,
                expiresAt,
                status: "active",
                termsSnapshot: warranty as never,
              })
              .returning();
            pendingWarrantyId = w.id;
            appliedPolicyId = policy.id;
            appliedStartsAt = sellTime;
            appliedExpiresAt = expiresAt;
            warrantiesCreated.push({ unitId: p.unitId, expiresAt });
          }
        }

        const [lineRow] = await tx
          .insert(saleLines)
          .values({
            saleId,
            variantId: p.variantId,
            inventoryUnitId: p.unitId,
            sku: p.sku,
            productNameSnapshot: p.productName,
            attributesSnapshot: p.attributes as never,
            imeiSnapshot: p.imeis,
            serialSnapshot: p.serial,
            warrantySnapshot: warranty as never,
            warrantyPolicyId: appliedPolicyId,
            warrantyStartsAt: appliedStartsAt,
            warrantyExpiresAt: appliedExpiresAt,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            costPrice: p.costPrice,
            discountAmount: p.discountAmount,
            lineTotal: (p.unitPrice - p.discountAmount) * p.quantity,
          })
          .returning();

        if (pendingWarrantyId) {
          await tx
            .update(warranties)
            .set({ saleLineId: lineRow.id })
            .where(eq(warranties.id, pendingWarrantyId));
        }
      }

      // Mark serialized units sold, stamping the warranty window derived above
      // so unit-level lookups (e.g. /api/warranties/validate) can resolve cover.
      const warrantyEndByUnit = new Map<string, Date>();
      for (const w of warrantiesCreated) {
        if (w.unitId && w.expiresAt) warrantyEndByUnit.set(w.unitId, w.expiresAt);
      }
      for (const { unit } of unitsToSell) {
        const warrantyEndsAt = warrantyEndByUnit.get(unit.id) ?? null;
        await tx
          .update(inventoryUnits)
          .set({
            status: "sold",
            soldAt: sellTime,
            warrantyStartAt: warrantyEndsAt ? sellTime : null,
            warrantyEndAt: warrantyEndsAt,
          })
          .where(eq(inventoryUnits.id, unit.id));
      }

      // Deduct quantities (dual-write legacy counters + balances + movement log).
      for (const [variantId, adj] of qtyAdj) {
        const [variant] = await tx
          .select({ quantity: productVariants.quantity })
          .from(productVariants)
          .where(eq(productVariants.id, variantId))
          .limit(1);
        await tx
          .update(productVariants)
          .set({ quantity: (variant?.quantity ?? 0) - adj.qty, updatedAt: now })
          .where(eq(productVariants.id, variantId));

        const [inv] = await tx.select().from(inventory).where(eq(inventory.sku, adj.sku));
        if (inv) {
          await tx
            .update(inventory)
            .set({ quantity: inv.quantity - adj.qty, updatedAt: now })
            .where(eq(inventory.id, inv.id));
        }

        // Deduct from the selling location's balance (serialized units carry
        // their own location; quantity lines use the POS location context).
        const unit = unitsToSell.find((u) => u.unit.variantId === variantId)?.unit;
        const loc = unit?.locationId ?? saleLocation;
        const [bal] = loc
          ? await tx
              .select()
              .from(inventoryBalances)
              .where(
                and(
                  eq(inventoryBalances.variantId, variantId),
                  eq(inventoryBalances.locationId, loc),
                ),
              )
              .limit(1)
          : await tx
              .select()
              .from(inventoryBalances)
              .where(eq(inventoryBalances.variantId, variantId))
              .limit(1);
        if (bal) {
          await tx
            .update(inventoryBalances)
            .set({ availableQty: bal.availableQty - adj.qty, updatedAt: now })
            .where(eq(inventoryBalances.id, bal.id));
        }

        await tx.insert(inventoryMovements).values({
          variantId,
          unitId: unit?.id ?? null,
          locationId: loc ?? null,
          movementType: "sale",
          quantity: -adj.qty,
          beforeQty: variant?.quantity ?? 0,
          afterQty: (variant?.quantity ?? 0) - adj.qty,
          sourceType: "sale",
          sourceId: saleId,
          reason: "POS sale",
          actorId: cashierId || null,
        });
      }

      for (const p of payments) {
        await tx.insert(salePayments).values({
          saleId,
          method: p.method,
          amount: p.amount,
          providerReference: p.reference?.trim() || null,
          status: "confirmed",
          confirmedAt: sellTime,
        });
      }

      await tx.insert(saleDocuments).values({
        saleId,
        documentType: "invoice",
        version: 1,
        verificationCode,
        printedAt: now,
      });

      await tx.insert(auditLog).values({
        userId: cashierId || null,
        action: "sale.commit",
        entityType: "sale",
        entityId: saleId,
        metadata: {
          saleNumber,
          invoiceNumber,
          totalAmount: totals.totalAmount,
          lineCount: plans.length,
        },
      });

      return { replay: false, sale, verificationCode, warranties: warrantiesCreated };
    });

    if (result.replay) {
      return NextResponse.json({
        sale: { id: result.saleId, saleNumber: result.saleNumber, replay: true },
      });
    }

    return NextResponse.json(
      {
        sale: {
          id: result.sale.id,
          saleNumber: result.sale.saleNumber,
          invoiceNumber: result.sale.invoiceNumber,
          barcodeValue: result.sale.barcodeValue,
          subtotal: result.sale.subtotal,
          discountAmount: result.sale.discountAmount,
          taxAmount: result.sale.taxAmount,
          totalAmount: result.sale.totalAmount,
          paidAmount: result.sale.paidAmount,
          changeAmount: result.sale.changeAmount,
          currency: result.sale.currency,
          createdAt: result.sale.createdAt,
        },
        verificationCode: result.verificationCode,
        warranties: result.warranties,
      },
      { status: 201 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
