import { db } from "@/db";
import {
  users,
  orders,
  sales,
  saleLines,
  salePayments,
  orderItems,
  productVariants,
  customers,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, like, and, or, ne } from "drizzle-orm";
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
  const channel = searchParams.get("channel"); // "online" | "pos" | null

  // ── 1. Online customers (from users table with orders) ──────────────
  const onlineConditions = [];
  if (search) {
    onlineConditions.push(
      or(
        like(users.email, `%${search}%`),
        like(users.firstName, `%${search}%`),
        like(users.lastName, `%${search}%`),
        like(users.phone, `%${search}%`),
      )!,
    );
  }

  // Use subqueries to avoid JOIN inflation: users→orders→orderItems
  // multiplies order rows, which would inflate SUM(orders.total).
  const onlineRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      source: sql<string>`'Online'`.as("source"),
      totalSpent: sql<number>`COALESCE((
        SELECT SUM(o.total) FROM orders o WHERE o.user_id = users.id
      ), 0)`,
      totalItems: sql<number>`COALESCE((
        SELECT SUM(oi.qty) FROM order_items oi
        JOIN orders o2 ON oi.order_id = o2.id
        WHERE o2.user_id = users.id
      ), 0)`,
      orderCount: sql<number>`COALESCE((
        SELECT COUNT(DISTINCT o3.id) FROM orders o3 WHERE o3.user_id = users.id
      ), 0)`,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "customer"),
        onlineConditions.length ? and(...onlineConditions) : undefined,
      ),
    )
    .orderBy(desc(users.createdAt));

  // ── 2. Guest customers (from orders table without userId) ──────────
  const guestConditions = [];
  if (search) {
    guestConditions.push(
      or(like(orders.customerEmail, `%${search}%`), like(orders.customerPhone, `%${search}%`))!,
    );
  }

  // Guest query: totalSpent from orders only (no JOIN inflation),
  // totalItems via correlated subquery to avoid multiplying order totals.
  const guestKeyExpr = sql<string>`COALESCE(NULLIF(${orders.customerEmail}, ''), NULLIF(${orders.customerPhone}, ''), 'guest')`;

  const guestRows = await db
    .select({
      key: guestKeyExpr.as("key"),
      firstName: sql<string>`'Guest'`.as("firstName"),
      lastName: sql<string>`''`.as("lastName"),
      email: orders.customerEmail,
      phone: orders.customerPhone,
      totalSpent: sql<number>`SUM(${orders.total})`,
      totalItems: sql<number>`COALESCE((
        SELECT SUM(oi.qty) FROM order_items oi
        JOIN orders o2 ON oi.order_id = o2.id
        WHERE o2.user_id IS NULL
          AND COALESCE(NULLIF(o2.customer_email, ''), NULLIF(o2.customer_phone, ''), 'guest')
            = COALESCE(NULLIF(${orders.customerEmail}, ''), NULLIF(${orders.customerPhone}, ''), 'guest')
      ), 0)`,
      orderCount: sql<number>`COUNT(DISTINCT ${orders.id})`,
      createdAt: sql<Date | null>`MIN(${orders.createdAt})`.as("createdAt"),
    })
    .from(orders)
    .where(
      and(
        sql`${orders.userId} IS NULL`,
        guestConditions.length ? and(...guestConditions) : undefined,
      ),
    )
    .groupBy(guestKeyExpr, orders.customerEmail, orders.customerPhone)
    .orderBy(desc(sql`MIN(${orders.createdAt})`));

  // ── 3. POS customers (from sales table — walk-ins with phone/email) ─
  const posSearchConditions = [];
  if (search) {
    posSearchConditions.push(
      or(
        like(sales.customerName, `%${search}%`),
        like(sales.customerPhone, `%${search}%`),
        like(sales.customerEmail, `%${search}%`),
      )!,
    );
  }

  const posKeyExpr = sql<string>`COALESCE(NULLIF(${sales.customerPhone}, ''), NULLIF(${sales.customerEmail}, ''), ${sales.customerName}, 'walk-in')`;

  const posRows = await db
    .select({
      key: posKeyExpr.as("key"),
      firstName: sql<string>`SPLIT_PART(${sales.customerName}, ' ', 1)`.as("firstName"),
      lastName: sql<string>`NULLIF(SPLIT_PART(${sales.customerName}, ' ', 2), '')`.as("lastName"),
      email: sql<string | null>`${sales.customerEmail}`.as("email"),
      phone: sql<string | null>`${sales.customerPhone}`.as("phone"),
      // totalSpent from sales only — no saleLines join to avoid inflation
      totalSpent: sql<number>`SUM(${sales.totalAmount})`,
      // totalItems via correlated subquery to avoid JOIN multiplication
      totalItems: sql<number>`COALESCE((
        SELECT SUM(sl.quantity) FROM sale_lines sl
        JOIN sales s2 ON sl.sale_id = s2.id
        WHERE COALESCE(NULLIF(s2.customer_phone, ''), NULLIF(s2.customer_email, ''), s2.customer_name, 'walk-in')
          = ${posKeyExpr}
      ), 0)`,
      orderCount: sql<number>`COUNT(DISTINCT ${sales.id})`,
      createdAt: sql<Date | null>`MIN(${sales.createdAt})`.as("createdAt"),
    })
    .from(sales)
    .where(posSearchConditions.length ? and(...posSearchConditions) : undefined)
    .groupBy(posKeyExpr, sales.customerName, sales.customerEmail, sales.customerPhone)
    .orderBy(desc(sql`MIN(${sales.createdAt})`));

  // ── 4. Registered customers (from customers table with NID) ──────
  const registeredConditions = [];
  if (search) {
    registeredConditions.push(
      or(
        like(customers.name, `%${search}%`),
        like(customers.phone, `%${search}%`),
        like(customers.email, `%${search}%`),
        sql`${customers.nidNumber}::text ILIKE ${`%${search}%`}`,
      )!,
    );
  }

  const registeredRows = await db
    .select({
      key: sql<string>`${customers.id}`.as("key"),
      firstName: sql<string>`SPLIT_PART(${customers.name}, ' ', 1)`.as("firstName"),
      lastName: sql<string>`NULLIF(SPLIT_PART(${customers.name}, ' ', 2), '')`.as("lastName"),
      email: customers.email,
      phone: customers.phone,
      totalSpent: sql<number>`COALESCE(${customers.totalExchangeValue}, 0)`,
      totalItems: sql<number>`COALESCE(${customers.totalExchanges}, 0)`,
      orderCount: sql<number>`COALESCE(${customers.totalExchanges}, 0)`,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(registeredConditions.length ? and(...registeredConditions) : undefined)
    .orderBy(desc(customers.createdAt));

  // ── 5. Merge & deduplicate ──────────────────────────────────────────
  // Create lookup maps for matching by phone/email
  const onlineMap = new Map<string, (typeof onlineRows)[number]>();
  for (const r of onlineRows) {
    onlineMap.set(r.id, r);
    if (r.phone) onlineMap.set(`phone:${r.phone}`, r);
    if (r.email) onlineMap.set(`email:${r.email}`, r);
  }

  const merged: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    channel: string;
    totalSpent: number;
    totalItems: number;
    orderCount: number;
    createdAt: string | null;
  }[] = [];

  const seenKeys = new Set<string>();
  const addedUserIds = new Set<string>();

  // Add registered online customers
  for (const r of onlineRows) {
    if (addedUserIds.has(r.id)) continue;
    addedUserIds.add(r.id);
    const key = r.id;
    seenKeys.add(key);
    if (r.phone) seenKeys.add(`phone:${r.phone}`);
    if (r.email) seenKeys.add(`email:${r.email}`);

    merged.push({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      channel: "Online",
      totalSpent: r.totalSpent,
      totalItems: r.totalItems,
      orderCount: r.orderCount,
      createdAt: r.createdAt ? String(r.createdAt) : null,
    });
  }

  // Add guest customers
  for (const r of guestRows) {
    const guestKey = r.key;
    if (seenKeys.has(guestKey)) continue;
    seenKeys.add(guestKey);
    if (r.phone) seenKeys.add(`phone:${r.phone}`);
    if (r.email) seenKeys.add(`email:${r.email}`);

    merged.push({
      id: `guest-${guestKey}`,
      firstName: r.firstName || "Guest",
      lastName: r.lastName || "",
      email: r.email,
      phone: r.phone,
      channel: "Online",
      totalSpent: r.totalSpent,
      totalItems: r.totalItems,
      orderCount: r.orderCount,
      createdAt: r.createdAt ? String(r.createdAt) : null,
    });
  }

  // Add POS customers, merging with online where possible
  for (const r of posRows) {
    const posKey = r.key;
    if (seenKeys.has(posKey)) continue;
    seenKeys.add(posKey);

    // Try to find matching online user
    let matched: (typeof onlineRows)[number] | undefined;
    if (r.phone) matched = onlineMap.get(`phone:${r.phone}`);
    if (!matched && r.email) matched = onlineMap.get(`email:${r.email}`);

    if (matched && addedUserIds.has(matched.id)) {
      // Merge into existing online entry
      const existing = merged.find((m) => m.id === matched!.id);
      if (existing) {
        existing.totalSpent += r.totalSpent;
        existing.totalItems += r.totalItems;
        existing.orderCount += r.orderCount;
        existing.channel = "Both";
      }
    } else {
      merged.push({
        id: `pos-${posKey}`,
        firstName: r.firstName || "Walk-in",
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        channel: "POS",
        totalSpent: r.totalSpent,
        totalItems: r.totalItems,
        orderCount: r.orderCount,
        createdAt: r.createdAt ? String(r.createdAt) : null,
      });
    }
  }

  // Add registered customers (from customers table with NID)
  for (const r of registeredRows) {
    const regKey = r.key;
    if (seenKeys.has(`reg-${regKey}`)) continue;
    seenKeys.add(`reg-${regKey}`);

    // Try to find matching online user
    let matched: (typeof onlineRows)[number] | undefined;
    if (r.phone) matched = onlineMap.get(`phone:${r.phone}`);
    if (!matched && r.email) matched = onlineMap.get(`email:${r.email}`);

    if (matched && addedUserIds.has(matched.id)) {
      // Merge into existing online entry
      const existing = merged.find((m) => m.id === matched!.id);
      if (existing) {
        existing.totalSpent += r.totalSpent;
        existing.totalItems += r.totalItems;
        existing.orderCount += r.orderCount;
        existing.channel = "Both";
      }
    } else {
      merged.push({
        id: `reg-${regKey}`,
        firstName: r.firstName || "Customer",
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        channel: "POS",
        totalSpent: r.totalSpent,
        totalItems: r.totalItems,
        orderCount: r.orderCount,
        createdAt: r.createdAt ? String(r.createdAt) : null,
      });
    }
  }

  // Filter by channel
  const filtered =
    channel === "online"
      ? merged.filter((c) => c.channel === "Online" || c.channel === "Both")
      : channel === "pos"
        ? merged.filter((c) => c.channel === "POS" || c.channel === "Both")
        : merged;

  return NextResponse.json(filtered);
}

/**
 * GET /api/dashboard/customers/purchases?id=<customerId>
 * Returns all purchases (online orders + POS sales) for a specific customer.
 */
export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const body = await request.json();
  const { customerId, phone, email } = body;

  const purchases: {
    id: string;
    channel: string;
    date: string | null;
    total: number;
    invoiceNumber?: string | null;
    paymentMethod?: string | null;
    items: {
      name: string;
      qty: number;
      price: number;
      lineTotal?: number;
      discountAmount?: number;
      taxAmount?: number;
      /** Sale line id + product id (POS only) — used to link returns back to the sale. */
      saleLineId?: number | null;
      productId?: string | null;
      variantId?: number | null;
    }[];
  }[] = [];

  // Find online orders for registered users
  if (customerId && !customerId.startsWith("pos-") && !customerId.startsWith("guest-")) {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, customerId))
      .orderBy(desc(orders.createdAt));

    for (const o of userOrders) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      purchases.push({
        id: o.id,
        channel: "Online",
        date: o.createdAt ? String(o.createdAt) : null,
        total: o.total,
        items: items.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          orderItemId: i.id,
          productId: i.productId,
        })),
      });
    }
  }

  // Find guest orders
  if ((customerId && customerId.startsWith("guest-")) || phone || email) {
    const guestConditions = [];
    if (phone) guestConditions.push(eq(orders.customerPhone, phone));
    if (email) guestConditions.push(eq(orders.customerEmail, email));
    if (customerId && customerId.startsWith("guest-")) {
      const key = customerId.replace("guest-", "");
      // Try matching by phone first, then email
      if (key.includes("@")) {
        guestConditions.push(eq(orders.customerEmail, key));
      } else {
        guestConditions.push(eq(orders.customerPhone, key));
      }
    }

    if (guestConditions.length > 0) {
      const guestOrders = await db
        .select()
        .from(orders)
        .where(and(sql`${orders.userId} IS NULL`, or(...guestConditions)))
        .orderBy(desc(orders.createdAt));

      for (const o of guestOrders) {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
        purchases.push({
          id: o.id,
          channel: "Online",
          date: o.createdAt ? String(o.createdAt) : null,
          total: o.total,
          items: items.map((i) => ({
            name: i.name,
            qty: i.qty,
            price: i.price,
            orderItemId: i.id,
            productId: i.productId,
          })),
        });
      }
    }
  }

  // Find POS sales
  const posConditions = [];
  if (phone) posConditions.push(eq(sales.customerPhone, phone));
  if (email) posConditions.push(eq(sales.customerEmail, email));
  if (customerId && customerId.startsWith("pos-")) {
    const key = customerId.replace("pos-", "");
    // Try matching by phone first, then email, then name
    posConditions.push(
      or(eq(sales.customerPhone, key), eq(sales.customerEmail, key), eq(sales.customerName, key))!,
    );
  }

  if (posConditions.length > 0) {
    const posSales = await db
      .select()
      .from(sales)
      .where(or(...posConditions))
      .orderBy(desc(sales.createdAt));

    for (const s of posSales) {
      const lines = await db
        .select({
          id: saleLines.id,
          productNameSnapshot: saleLines.productNameSnapshot,
          quantity: saleLines.quantity,
          unitPrice: saleLines.unitPrice,
          lineTotal: saleLines.lineTotal,
          discountAmount: saleLines.discountAmount,
          taxAmount: saleLines.taxAmount,
          variantId: saleLines.variantId,
          productId: productVariants.productId,
        })
        .from(saleLines)
        .leftJoin(productVariants, eq(saleLines.variantId, productVariants.id))
        .where(eq(saleLines.saleId, s.id));
      purchases.push({
        id: s.id,
        channel: "POS",
        date: s.createdAt ? String(s.createdAt) : null,
        total: s.totalAmount,
        invoiceNumber: s.invoiceNumber,
        paymentMethod: (
          await db
            .select({ method: salePayments.method })
            .from(salePayments)
            .where(eq(salePayments.saleId, s.id))
            .limit(1)
        )[0]?.method ?? null,
        items: lines.map((l) => ({
          name: l.productNameSnapshot,
          qty: l.quantity,
          price: l.unitPrice,
          lineTotal: l.lineTotal,
          discountAmount: l.discountAmount ?? 0,
          taxAmount: l.taxAmount ?? 0,
          saleLineId: l.id,
          productId: l.productId,
          variantId: l.variantId,
        })),
      });
    }
  }

  // Sort by date descending
  purchases.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  return NextResponse.json(purchases);
}
