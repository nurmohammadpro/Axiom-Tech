import { db } from "@/db";
import { exchangeOrders, customers, productVariants, products } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, like, or, and, inArray, sql } from "drizzle-orm";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const conditions = [];

  if (search) {
    const searchTerm = `%${search}%`;
    conditions.push(
      or(
        // Search by exchange id (uuid — cast to text so non-uuid queries like a
        // phone number don't raise "invalid input syntax for type uuid")
        sql`${exchangeOrders.id}::text = ${search}`,
        like(exchangeOrders.invoiceNumber, searchTerm),
        like(exchangeOrders.barcodeValue, searchTerm),
        // Search by customer name, phone, email
        like(customers.name, searchTerm),
        like(customers.phone, searchTerm),
        like(customers.email, searchTerm),
        // Search by trade-in items (IMEI, serial from JSON)
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${exchangeOrders.tradeInItems}) as item
          WHERE item->>'imei1' ILIKE ${searchTerm}
             OR item->>'imei2' ILIKE ${searchTerm}
             OR item->>'serial' ILIKE ${searchTerm}
        )`,
        // Search by new device unit (IMEI, serial from JSON object)
        sql`${exchangeOrders.newDeviceUnit}->>'imei1' ILIKE ${searchTerm}
             OR ${exchangeOrders.newDeviceUnit}->>'imei2' ILIKE ${searchTerm}
             OR ${exchangeOrders.newDeviceUnit}->>'serial' ILIKE ${searchTerm}`,
      )!,
    );
  }

  const exchanges = await db
    .select({
      id: exchangeOrders.id,
      customerId: exchangeOrders.customerId,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      tradeInProductId: exchangeOrders.tradeInProductId,
      tradeInCostCode: exchangeOrders.tradeInCostCode,
      tradeInSellCode: exchangeOrders.tradeInSellCode,
      tradeInAgreedValue: exchangeOrders.tradeInAgreedValue,
      tradeInItems: exchangeOrders.tradeInItems,
      newProductVariantId: exchangeOrders.newProductVariantId,
      newProductPrice: exchangeOrders.newProductPrice,
      newDeviceUnit: exchangeOrders.newDeviceUnit,
      invoiceNumber: exchangeOrders.invoiceNumber,
      barcodeValue: exchangeOrders.barcodeValue,
      paymentAmount: exchangeOrders.paymentAmount,
      paymentMethod: exchangeOrders.paymentMethod,
      paymentReference: exchangeOrders.paymentReference,
      payments: exchangeOrders.payments,
      locationId: exchangeOrders.locationId,
      notes: exchangeOrders.notes,
      status: exchangeOrders.status,
      createdAt: exchangeOrders.createdAt,
    })
    .from(exchangeOrders)
    .leftJoin(customers, eq(exchangeOrders.customerId, customers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(exchangeOrders.createdAt))
    .limit(50);

  // Fetch product/variant names for the exchanges
  const variantIds = exchanges
    .map((e) => e.newProductVariantId)
    .filter((v): v is number => v != null);
  const variants = await db
    .select()
    .from(productVariants)
    .leftJoin(products, eq(productVariants.productId, products.id))
    .where(variantIds.length > 0 ? inArray(productVariants.id, variantIds) : undefined);

  const variantMap = new Map(variants.map((v: any) => [v.product_variants?.id, v]));

  // Fetch trade-in product names (id is a prefixed string like "exc-...")
  const tradeInIds = exchanges
    .map((e) => e.tradeInProductId)
    .filter((id): id is string => Boolean(id));
  const tradeInProducts = tradeInIds.length
    ? await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(inArray(products.id, tradeInIds))
    : [];
  const tradeInMap = new Map(tradeInProducts.map((p) => [p.id, p.name]));

  const exchangesWithNames = exchanges.map((e) => ({
    ...e,
    newDeviceName:
      variantMap.get(e.newProductVariantId)?.products?.name ||
      variantMap.get(e.newProductVariantId)?.product_variants?.name ||
      "Unknown",
    newDeviceVariant: variantMap.get(e.newProductVariantId)?.product_variants?.name || "",
    tradeInProductName: e.tradeInProductId ? tradeInMap.get(e.tradeInProductId) || null : null,
  }));

  return NextResponse.json(exchangesWithNames);
}
