import { db } from "@/db";
import {
  products,
  productVariants,
  orders,
  sales,
  users,
  suppliers,
  purchaseOrders,
  inventoryUnits,
  exchangeOrders,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/authz";
import { like, or, sql, and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface SearchResult {
  id: string;
  label: string;
  subtitle: string;
  type: string;
  href: string;
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;
  const results: SearchResult[] = [];

  const isOwner = scope.role === "owner" || scope.isOwner;
  const isManager = scope.role === "manager";
  const isSalesman = scope.role === "salesman";

  // ── Products (all roles) ──────────────────────────────────────────────
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: productVariants.sku,
      variantName: productVariants.name,
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .where(
      or(
        like(products.name, pattern),
        like(productVariants.sku, pattern),
        like(productVariants.barcode, pattern),
      )!,
    )
    .limit(10);

  for (const p of productRows) {
    results.push({
      id: `product-${p.id}`,
      label: p.name,
      subtitle: p.sku ? `SKU: ${p.sku}` : p.variantName || "",
      type: "product",
      href: `/dashboard/catalog/${p.id}`,
    });
  }

  // ── Orders (owner + manager) ──────────────────────────────────────────
  if (isOwner || isManager) {
    const orderRows = await db
      .select({
        id: orders.id,
        customerEmail: orders.customerEmail,
        status: orders.status,
        total: orders.total,
      })
      .from(orders)
      .where(
        or(
          like(orders.id, pattern),
          like(orders.customerEmail, pattern),
          like(orders.customerPhone, pattern),
        )!,
      )
      .limit(5);

    for (const o of orderRows) {
      results.push({
        id: `order-${o.id}`,
        label: `Order #${o.id}`,
        subtitle: `${o.customerEmail || "guest"} · ${o.status} · ৳${o.total.toLocaleString()}`,
        type: "order",
        href: `/dashboard/orders?status=${o.status}`,
      });
    }
  }

  // ── POS sales (all staff roles) ──────────────────────────────────────
  const saleRows = await db
    .select({
      id: sales.id,
      saleNumber: sales.saleNumber,
      customerName: sales.customerName,
      customerPhone: sales.customerPhone,
      totalAmount: sales.totalAmount,
      channel: sales.channel,
    })
    .from(sales)
    .where(
      or(
        like(sales.id, pattern),
        like(sales.saleNumber, pattern),
        like(sales.customerName, pattern),
        like(sales.customerPhone, pattern),
        like(sales.customerEmail, pattern),
      )!,
    )
    .limit(5);

  for (const s of saleRows) {
    results.push({
      id: `sale-${s.id}`,
      label: s.saleNumber || `Sale #${s.id}`,
      subtitle: `${s.customerName || "walk-in"} · ৳${s.totalAmount.toLocaleString()}`,
      type: "sale",
      href: `/dashboard/pos`,
    });
  }

  // ── Customers (owner + manager) ──────────────────────────────────────
  if (isOwner || isManager) {
    const userRows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "customer"),
          or(
            like(users.firstName, pattern),
            like(users.lastName, pattern),
            like(users.email, pattern),
            like(users.phone, pattern),
          )!,
        ),
      )
      .limit(5);

    for (const u of userRows) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
      results.push({
        id: `customer-${u.id}`,
        label: name,
        subtitle: u.email || u.phone || "",
        type: "customer",
        href: `/dashboard/customers`,
      });
    }
  }

  // ── Suppliers (owner + manager) ──────────────────────────────────────
  if (isOwner || isManager) {
    const supplierRows = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        contactPerson: suppliers.contactPerson,
        phone: suppliers.phone,
      })
      .from(suppliers)
      .where(
        or(
          like(suppliers.name, pattern),
          like(suppliers.contactPerson, pattern),
          like(suppliers.phone, pattern),
        )!,
      )
      .limit(5);

    for (const s of supplierRows) {
      results.push({
        id: `supplier-${s.id}`,
        label: s.name,
        subtitle: s.contactPerson || s.phone || "",
        type: "supplier",
        href: `/dashboard/suppliers/${s.id}`,
      });
    }
  }

  // ── Purchase orders (owner + manager) ────────────────────────────────
  if (isOwner || isManager) {
    const poRows = await db
      .select({
        id: purchaseOrders.id,
        supplier: purchaseOrders.supplier,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(
        or(
          sql`CAST(${purchaseOrders.id} AS TEXT) LIKE ${pattern}`,
          like(purchaseOrders.supplier, pattern),
        )!,
      )
      .limit(5);

    for (const po of poRows) {
      results.push({
        id: `po-${po.id}`,
        label: `PO #${po.id}`,
        subtitle: `${po.supplier || ""} · ${po.status}`,
        type: "purchase_order",
        href: `/dashboard/purchases`,
      });
    }
  }

  // ── IMEI / serial search (all staff roles) ──────────────────────────
  const imeiRows = await db
    .select({
      id: inventoryUnits.id,
      imei1: inventoryUnits.imei1,
      imei2: inventoryUnits.imei2,
      serialNumber: inventoryUnits.serialNumber,
      unitCode: inventoryUnits.unitCode,
      status: inventoryUnits.status,
      productName: products.name,
      variantName: productVariants.name,
      sku: productVariants.sku,
    })
    .from(inventoryUnits)
    .leftJoin(productVariants, eq(inventoryUnits.variantId, productVariants.id))
    .leftJoin(products, eq(productVariants.productId, products.id))
    .where(
      or(
        like(inventoryUnits.imei1, pattern),
        like(inventoryUnits.imei2, pattern),
        like(inventoryUnits.serialNumber, pattern),
        like(inventoryUnits.unitCode, pattern),
      )!,
    )
    .limit(5);

  for (const u of imeiRows) {
    const label = u.productName || u.variantName || "Inventory unit";
    const subtitle = [
      u.imei1 ? `IMEI: ${u.imei1}` : "",
      u.sku ? `SKU: ${u.sku}` : "",
      u.status,
    ]
      .filter(Boolean)
      .join(" · ");
    results.push({
      id: `inventory-${u.id}`,
      label,
      subtitle,
      type: "inventory",
      href: `/dashboard/inventory`,
    });
  }

  // ── Exchange records (owner + manager) ──────────────────────────────
  if (isOwner || isManager) {
    const exchangeRows = await db
      .select({
        id: exchangeOrders.id,
        invoiceNumber: exchangeOrders.invoiceNumber,
        barcodeValue: exchangeOrders.barcodeValue,
        tradeInItems: exchangeOrders.tradeInItems,
        newDeviceUnit: exchangeOrders.newDeviceUnit,
        status: exchangeOrders.status,
        createdAt: exchangeOrders.createdAt,
      })
      .from(exchangeOrders)
      .where(
        or(
          like(exchangeOrders.invoiceNumber, pattern),
          like(exchangeOrders.barcodeValue, pattern),
          sql`${exchangeOrders.id}::text LIKE ${pattern}`,
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${exchangeOrders.tradeInItems}) as item
            WHERE item->>'imei1' ILIKE ${pattern}
               OR item->>'imei2' ILIKE ${pattern}
               OR item->>'serial' ILIKE ${pattern}
          )`,
          sql`${exchangeOrders.newDeviceUnit}->>'imei1' ILIKE ${pattern}
               OR ${exchangeOrders.newDeviceUnit}->>'imei2' ILIKE ${pattern}
               OR ${exchangeOrders.newDeviceUnit}->>'serial' ILIKE ${pattern}`,
        )!,
      )
      .limit(5);

    for (const e of exchangeRows) {
      results.push({
        id: `exchange-${e.id}`,
        label: e.invoiceNumber || `Exchange #${String(e.id).slice(0, 8)}`,
        subtitle: `${e.status} · ${e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ""}`,
        type: "exchange",
        href: `/dashboard/exchanges`,
      });
    }
  }

  return NextResponse.json(results);
}
