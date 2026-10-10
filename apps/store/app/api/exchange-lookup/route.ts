import { db } from "@/db";
import { inventoryUnits, products, productVariants, saleLines, sales } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, and, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ExchangeLookupResponse {
  found: boolean;
  reason?: string;
  productId?: string;
  productName?: string;
  variantId?: number;
  imei?: string;
  originalPrice?: number;
  soldAt?: string | null;
  saleId?: string | null;
  saleNumber?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim();
    if (!identifier) {
      return NextResponse.json({
        found: false,
        reason: "Enter an IMEI, serial number, or barcode",
      });
    }

    // First, try barcode lookup (for accessories and non-serialized items)
    const [barcodeVariant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.barcode, identifier))
      .limit(1);

    if (barcodeVariant) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, barcodeVariant.productId))
        .limit(1);

      if (product) {
        return NextResponse.json({
          found: true,
          productId: product.id,
          productName: product.name,
          variantId: barcodeVariant.id,
          imei: identifier, // using barcode as identifier
          originalPrice: barcodeVariant.sellingPrice,
          soldAt: null,
          saleId: null,
          saleNumber: null,
        } satisfies ExchangeLookupResponse);
      }
    }

    const exact = identifier.replace(/[\s-]/g, "").toUpperCase();

    // 1. Find the serialized unit by IMEI/serial.
    const [unit] = await db
      .select({
        id: inventoryUnits.id,
        variantId: inventoryUnits.variantId,
        imei1: inventoryUnits.imei1,
        imei2: inventoryUnits.imei2,
        serialNumber: inventoryUnits.serialNumber,
        status: inventoryUnits.status,
        currentPrice: inventoryUnits.currentPrice,
        soldAt: inventoryUnits.soldAt,
      })
      .from(inventoryUnits)
      .where(
        and(
          or(
            eq(inventoryUnits.imei1, identifier),
            eq(inventoryUnits.imei2, identifier),
            eq(inventoryUnits.serialNumber, identifier),
            sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei1}, ' ', ''), '-', '')) = ${exact}`,
            sql`UPPER(REPLACE(REPLACE(${inventoryUnits.imei2}, ' ', ''), '-', '')) = ${exact}`,
            sql`UPPER(REPLACE(REPLACE(${inventoryUnits.serialNumber}, ' ', ''), '-', '')) = ${exact}`,
          ),
        ),
      )
      .limit(1);

    if (unit) {
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, unit.variantId))
        .limit(1);
      if (!variant) {
        return NextResponse.json({ found: false, reason: "Device variant not found" });
      }
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, variant.productId))
        .limit(1);
      if (!product) {
        return NextResponse.json({ found: false, reason: "Product not found" });
      }

      // Original price = what the customer actually paid (the sale line), falling
      // back to the unit's current price / variant price when never sold.
      const [line] = await db
        .select({
          saleId: saleLines.saleId,
          unitPrice: saleLines.unitPrice,
          saleNumber: sales.saleNumber,
        })
        .from(saleLines)
        .innerJoin(sales, eq(saleLines.saleId, sales.id))
        .where(eq(saleLines.inventoryUnitId, unit.id))
        .orderBy(desc(sales.createdAt))
        .limit(1);

      const originalPrice = line?.unitPrice ?? unit.currentPrice ?? variant.sellingPrice;
      const imei = unit.imei1 ?? unit.imei2 ?? unit.serialNumber ?? identifier;

      return NextResponse.json({
        found: true,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        imei,
        originalPrice,
        soldAt: unit.soldAt ? String(unit.soldAt) : null,
        saleId: line?.saleId ?? null,
        saleNumber: line?.saleNumber ?? null,
      } satisfies ExchangeLookupResponse);
    }

    // 2. Fall back to sale-line snapshots (units sold before unit tracking, or
    //    identifiers stored only on the invoice line).
    const [snapshotLine] = await db
      .select({
        id: saleLines.id,
        saleId: saleLines.saleId,
        variantId: saleLines.variantId,
        unitPrice: saleLines.unitPrice,
        productName: saleLines.productNameSnapshot,
        imeiSnapshot: saleLines.imeiSnapshot,
        saleNumber: sales.saleNumber,
        soldAt: sales.createdAt,
      })
      .from(saleLines)
      .innerJoin(sales, eq(saleLines.saleId, sales.id))
      .where(sql`${saleLines.imeiSnapshot} ? ${identifier}`)
      .orderBy(desc(sales.createdAt))
      .limit(1);

    if (snapshotLine) {
      let variant: typeof productVariants.$inferSelect | undefined;
      let product: typeof products.$inferSelect | undefined;

      if (snapshotLine.variantId != null) {
        const [v] = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, snapshotLine.variantId))
          .limit(1);
        variant = v;
        if (variant) {
          const [p] = await db
            .select()
            .from(products)
            .where(eq(products.id, variant.productId))
            .limit(1);
          product = p;
        }
      }

      return NextResponse.json({
        found: true,
        productId: product?.id ?? "",
        productName: snapshotLine.productName || product?.name || "Unknown device",
        variantId: snapshotLine.variantId ?? undefined,
        imei: identifier,
        originalPrice: snapshotLine.unitPrice,
        soldAt: snapshotLine.soldAt ? String(snapshotLine.soldAt) : null,
        saleId: snapshotLine.saleId,
        saleNumber: snapshotLine.saleNumber,
      } satisfies ExchangeLookupResponse);
    }

    return NextResponse.json({ found: false, reason: "No device found with that IMEI/serial" });
  } catch (error) {
    console.error("Exchange lookup error:", error);
    return NextResponse.json({ found: false, reason: "Device lookup failed" }, { status: 500 });
  }
}
