import { db } from "@/db";
import {
  customers,
  exchangeOrders,
  inventoryUnits,
  productVariants,
  products,
  returns,
  saleLines,
  salePayments,
  sales,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { getScope, requireStaff } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Sale/line/unit resolver for the in-store return modal. One search box
 * accepts an IMEI, serial, unit barcode, receipt barcode, invoice number or
 * sale number and resolves the matching sale with every line, a per-line
 * "returned" flag, and the unit's current pricing/codes — so counter staff
 * can preview the sale, re-price the unit, and complete the return in one go.
 */

interface LookupUnit {
  id: string;
  status: string;
  currentPrice: number | null;
  acquisitionCost: number | null;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  conditionGrade: string | null;
  batteryHealth: number | null;
  locationId: string | null;
}

interface LookupLine {
  id: number;
  variantId: number | null;
  productId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  imei1: string | null;
  imei2: string | null;
  serial: string | null;
  warranty: { startsAt: string | null; expiresAt: string | null };
  unit: LookupUnit | null;
  returned: { id: string; status: string } | null;
}

interface LookupResponse {
  found: boolean;
  reason?: string;
  source?: "sale" | "exchange";
  exchange?: {
    id: string;
    invoiceNumber: string | null;
    barcodeValue: string | null;
    locationId: string | null;
    unitId: string | null;
  };
  sale?: {
    id: string;
    saleNumber: string | null;
    invoiceNumber: string | null;
    barcodeValue: string | null;
    createdAt: string;
    channel: string;
    storeId: string | null;
    customerName: string | null;
    customerPhone: string | null;
    totals: { grandTotal: number; paid: number };
    payments: { method: string; amount: number }[];
  };
  lines?: LookupLine[];
}

/** Full sale payload: sale row + every line with unit + returned flag. */
async function salePayload(saleId: string): Promise<LookupResponse> {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  if (!sale) return { found: false, reason: "Sale not found" };

  const lineRows = await db
    .select({
      line: saleLines,
      unit: inventoryUnits,
      variantName: productVariants.name,
      productId: products.id,
    })
    .from(saleLines)
    .leftJoin(inventoryUnits, eq(inventoryUnits.id, saleLines.inventoryUnitId))
    .leftJoin(productVariants, eq(productVariants.id, saleLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(eq(saleLines.saleId, saleId))
    .orderBy(saleLines.id);

  const lineIds = lineRows.map((r) => r.line.id);
  const returnRows = lineIds.length
    ? await db
        .select({ id: returns.id, saleLineId: returns.saleLineId, status: returns.status })
        .from(returns)
        .where(and(inArray(returns.saleLineId, lineIds), ne(returns.status, "rejected")))
    : [];
  const returnedByLine = new Map(returnRows.map((r) => [r.saleLineId, r]));

  const lines: LookupLine[] = lineRows.map(({ line, unit, variantName, productId }) => {
    const imeis = Array.isArray(line.imeiSnapshot) ? line.imeiSnapshot : [];
    const ret = line.id != null ? returnedByLine.get(line.id) : undefined;
    return {
      id: line.id,
      variantId: line.variantId,
      productId,
      productName: line.productNameSnapshot,
      variantName,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount ?? 0,
      lineTotal: line.lineTotal,
      imei1: imeis[0] ?? unit?.imei1 ?? null,
      imei2: imeis[1] ?? unit?.imei2 ?? null,
      serial: line.serialSnapshot ?? unit?.serialNumber ?? null,
      warranty: {
        startsAt: line.warrantyStartsAt ? new Date(line.warrantyStartsAt).toISOString() : null,
        expiresAt: line.warrantyExpiresAt ? new Date(line.warrantyExpiresAt).toISOString() : null,
      },
      unit: unit
        ? {
            id: unit.id,
            status: unit.status,
            currentPrice: unit.currentPrice,
            acquisitionCost: unit.acquisitionCost ?? line.costPrice,
            costCode: unit.costCode,
            dCode: unit.dCode,
            sellCode: unit.sellCode,
            conditionGrade: unit.conditionGrade,
            batteryHealth: unit.batteryHealth,
            locationId: unit.locationId,
          }
        : null,
      returned: ret ? { id: ret.id, status: ret.status ?? "pending" } : null,
    };
  });

  const paymentRows = await db
    .select({ method: salePayments.method, amount: salePayments.amount })
    .from(salePayments)
    .where(eq(salePayments.saleId, saleId));

  return {
    found: true,
    source: "sale",
    sale: {
      id: sale.id,
      saleNumber: sale.saleNumber,
      invoiceNumber: sale.invoiceNumber,
      barcodeValue: sale.barcodeValue,
      createdAt: (sale.createdAt ?? new Date()).toISOString(),
      channel: sale.channel,
      storeId: sale.storeId,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      totals: {
        grandTotal: sale.totalAmount,
        paid: sale.paidAmount,
      },
      payments: paymentRows.map((p) => ({ method: p.method, amount: p.amount })),
    },
    lines,
  };
}

/** Synthetic line id for an exchange hand-over (exchanges have no sale line). */
const EXCHANGE_LINE_ID = -1;

interface HandoverUnit {
  id: string;
  variantId: number;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
}

/**
 * A sold unit with no POS sale line was handed over through an exchange order.
 * Match it against exchange hand-overs by the IMEI/serial stored on the order's
 * `new_device_unit` snapshot.
 */
async function findExchangeForUnit(unit: HandoverUnit): Promise<{ id: string } | undefined> {
  const conditions = [unit.imei1, unit.imei2]
    .filter((v): v is string => Boolean(v))
    .flatMap((imei) => [
      sql`${exchangeOrders.newDeviceUnit}->>'imei1' = ${imei}`,
      sql`${exchangeOrders.newDeviceUnit}->>'imei2' = ${imei}`,
    ]);
  if (unit.serialNumber) {
    conditions.push(sql`${exchangeOrders.newDeviceUnit}->>'serial' = ${unit.serialNumber}`);
  }
  if (conditions.length === 0) return undefined;

  const [row] = await db
    .select({ id: exchangeOrders.id })
    .from(exchangeOrders)
    .where(and(eq(exchangeOrders.newProductVariantId, unit.variantId), or(...conditions)))
    .orderBy(desc(exchangeOrders.createdAt))
    .limit(1);
  return row;
}

/** Return payload for an exchange hand-over: the order as a pseudo-sale with a
 *  single sellable line, so the counter return modal works unchanged. */
async function exchangePayload(exchangeId: string): Promise<LookupResponse> {
  const [ex] = await db
    .select()
    .from(exchangeOrders)
    .where(eq(exchangeOrders.id, exchangeId))
    .limit(1);
  if (!ex) return { found: false, reason: "Exchange order not found" };

  const [customer] = await db
    .select({ name: customers.name, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, ex.customerId))
    .limit(1);

  const handover = (ex.newDeviceUnit ?? {}) as {
    imei1?: string | null;
    imei2?: string | null;
    serial?: string | null;
  };
  const imei1 = handover.imei1 ?? null;
  const imei2 = handover.imei2 ?? null;
  const serial = handover.serial ?? null;

  const [variant] = ex.newProductVariantId
    ? await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, ex.newProductVariantId))
        .limit(1)
    : [];
  const [product] = variant
    ? await db.select().from(products).where(eq(products.id, variant.productId)).limit(1)
    : [];

  const matchValues = [imei1, imei2, serial].filter((v): v is string => Boolean(v));
  const [unit] = matchValues.length
    ? await db
        .select()
        .from(inventoryUnits)
        .where(
          and(
            ex.newProductVariantId
              ? eq(inventoryUnits.variantId, ex.newProductVariantId)
              : undefined,
            or(
              ...matchValues.flatMap((v) => [
                eq(inventoryUnits.imei1, v),
                eq(inventoryUnits.imei2, v),
                eq(inventoryUnits.serialNumber, v),
              ]),
            ),
          ),
        )
        .limit(1)
    : [];

  const [existingReturn] = await db
    .select({ id: returns.id, status: returns.status })
    .from(returns)
    .where(and(eq(returns.exchangeOrderId, exchangeId), ne(returns.status, "rejected")))
    .limit(1);

  const createdAt = (ex.createdAt ?? new Date()).toISOString();
  const line: LookupLine = {
    id: EXCHANGE_LINE_ID,
    variantId: ex.newProductVariantId ?? null,
    productId: product?.id ?? null,
    productName: product?.name ?? "Unknown device",
    variantName: variant?.name ?? null,
    sku: variant?.sku ?? null,
    quantity: 1,
    unitPrice: ex.newProductPrice,
    discountAmount: 0,
    lineTotal: ex.newProductPrice,
    imei1: imei1 ?? unit?.imei1 ?? null,
    imei2: imei2 ?? unit?.imei2 ?? null,
    serial: serial ?? unit?.serialNumber ?? null,
    warranty: {
      startsAt: ex.newDeviceWarrantyStartsAt
        ? new Date(ex.newDeviceWarrantyStartsAt).toISOString()
        : null,
      expiresAt: ex.newDeviceWarrantyExpiresAt
        ? new Date(ex.newDeviceWarrantyExpiresAt).toISOString()
        : null,
    },
    unit: unit
      ? {
          id: unit.id,
          status: unit.status,
          currentPrice: unit.currentPrice,
          acquisitionCost: unit.acquisitionCost,
          costCode: unit.costCode,
          dCode: unit.dCode,
          sellCode: unit.sellCode,
          conditionGrade: unit.conditionGrade,
          batteryHealth: unit.batteryHealth,
          locationId: unit.locationId,
        }
      : null,
    returned: existingReturn
      ? { id: existingReturn.id, status: existingReturn.status ?? "pending" }
      : null,
  };

  return {
    found: true,
    source: "exchange",
    exchange: {
      id: ex.id,
      invoiceNumber: ex.invoiceNumber,
      barcodeValue: ex.barcodeValue,
      locationId: ex.locationId,
      unitId: unit?.id ?? null,
    },
    sale: {
      id: ex.id,
      saleNumber: ex.invoiceNumber,
      invoiceNumber: ex.invoiceNumber,
      barcodeValue: ex.barcodeValue,
      createdAt,
      channel: "exchange",
      storeId: ex.locationId,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      totals: { grandTotal: ex.newProductPrice, paid: ex.newProductPrice },
      payments: [],
    },
    lines: [line],
  };
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  // Edit mode: the returns page preloads the modal with the return's sale.
  const saleIdParam = request.nextUrl.searchParams.get("saleId");
  if (saleIdParam) {
    return NextResponse.json(await salePayload(saleIdParam));
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({
      found: false,
      reason: "Enter an IMEI, serial, receipt barcode, invoice or sale number",
    });
  }
  const exact = q.replace(/[\s-]/g, "").toUpperCase();

  // 1. Receipt barcode / invoice / sale number.
  const [saleMatch] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(
      or(
        eq(sales.invoiceNumber, q),
        eq(sales.saleNumber, q),
        eq(sales.barcodeValue, q),
        eq(sql`UPPER(REPLACE(${sales.invoiceNumber}, '-', ''))`, exact),
        eq(sql`UPPER(REPLACE(${sales.saleNumber}, '-', ''))`, exact),
        eq(sql`UPPER(REPLACE(${sales.barcodeValue}, '-', ''))`, exact),
      ),
    )
    .limit(1);
  if (saleMatch) return NextResponse.json(await salePayload(saleMatch.id));

  // 2. Serialized unit by IMEI / serial / unit barcode → its sale line (or the
  //    exchange order that handed it over).
  const [unitRow] = await db
    .select({
      id: inventoryUnits.id,
      status: inventoryUnits.status,
      variantId: inventoryUnits.variantId,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
    })
    .from(inventoryUnits)
    .where(
      or(
        eq(inventoryUnits.imei1, q),
        eq(inventoryUnits.imei2, q),
        eq(inventoryUnits.serialNumber, q),
        eq(inventoryUnits.barcode, q),
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei1}, ' ', ''), '-', '')) = ${exact}`,
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei2}, ' ', ''), '-', '')) = ${exact}`,
        sql`UPPER(REPLACE(REPLACE(${inventoryUnits.serialNumber}, ' ', ''), '-', '')) = ${exact}`,
      ),
    )
    .limit(1);

  if (unitRow) {
    if (unitRow.status !== "sold") {
      return NextResponse.json({
        found: false,
        reason:
          unitRow.status === "available"
            ? "This device is already in stock — nothing to return."
            : `This device is not sold right now (status: ${unitRow.status}).`,
      });
    }
    const [lineRow] = await db
      .select({ saleId: saleLines.saleId })
      .from(saleLines)
      .where(eq(saleLines.inventoryUnitId, unitRow.id))
      .orderBy(desc(saleLines.id))
      .limit(1);
    if (lineRow) return NextResponse.json(await salePayload(lineRow.saleId));

    // No POS sale line: it may have been handed over through an exchange.
    const exchange = await findExchangeForUnit(unitRow);
    if (exchange) return NextResponse.json(await exchangePayload(exchange.id));

    return NextResponse.json({
      found: false,
      reason: "Device found, but no sale or exchange record exists for it.",
    });
  }

  // 3. Snapshot fallback for units sold before unit tracking.
  const [snapshotLine] = await db
    .select({ saleId: saleLines.saleId })
    .from(saleLines)
    .where(or(sql`${saleLines.imeiSnapshot} ? ${q}`, sql`${saleLines.imeiSnapshot} ? ${exact}`))
    .orderBy(desc(saleLines.id))
    .limit(1);
  if (snapshotLine) return NextResponse.json(await salePayload(snapshotLine.saleId));

  return NextResponse.json({ found: false, reason: `No sale found for “${q}”.` });
}
