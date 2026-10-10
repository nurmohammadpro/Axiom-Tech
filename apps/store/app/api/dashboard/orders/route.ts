import { db } from "@/db";
import { orders, salePayments, sales, users, saleLines } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getScope } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** Inclusive `created_at::date` window from `?from=&to=` (YYYY-MM-DD). */
function rangeCond(col: unknown, from: string | null, to: string | null) {
  const parts = [];
  if (from) parts.push(sql`${col}::date >= ${from}::date`);
  if (to) parts.push(sql`${col}::date <= ${to}::date`);
  return parts;
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const warehouse = searchParams.get("warehouse");
  const search = searchParams.get("search");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const warehouseActive = Boolean(warehouse && warehouse !== "all");
  const scoped = Boolean(scope.isScoped && scope.storeLocation);

  // Base scopes (date + warehouse only) — used for the global status summary,
  // so the cards don't change when a status filter is applied.
  const onlineBase = () => {
    const c = rangeCond(orders.createdAt, from, to);
    if (warehouseActive || scoped) c.push(sql`1 = 0`); // online orders have no warehouse
    return c;
  };
  const saleBase = () => {
    const c = rangeCond(sales.createdAt, from, to);
    if (warehouseActive) c.push(eq(sales.storeId, warehouse as string));
    if (scoped) c.push(eq(sales.storeId, scope.storeLocation as string));
    return c;
  };

  // List conditions = base + status + search.
  const onlineConditions = [...onlineBase()];
  const saleConditions = [...saleBase()];

  if (status && status !== "all") {
    onlineConditions.push(eq(orders.status, status));
    saleConditions.push(eq(sales.status, status));
  }
  if (search) {
    const term = `%${search}%`;
    onlineConditions.push(
      or(
        like(orders.id, term),
        like(orders.customerEmail, term),
        like(orders.customerPhone, term),
        like(users.firstName, term),
        like(users.lastName, term),
        like(users.email, term),
        like(users.phone, term),
      )!,
    );
    saleConditions.push(
      or(
        sql`${sales.id}::text like ${term}`,
        like(sales.invoiceNumber, term),
        like(sales.saleNumber, term),
        like(sales.barcodeValue, term),
        like(sales.customerName, term),
        like(sales.customerPhone, term),
        like(sales.customerEmail, term),
        // IMEI / serial in sale_lines (sold units)
        sql`exists (select 1 from ${saleLines} where ${saleLines.saleId} = ${sales.id} and (${saleLines.imeiSnapshot}::text ilike ${term} or ${saleLines.serialSnapshot} ilike ${term} or ${saleLines.sku} ilike ${term}))`,
      )!,
    );
  }

  // ── Global status summary (date + warehouse scoped, ignores status/search) ─
  const [onlineStatus, posStatus] = await Promise.all([
    db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .where(onlineBase().length ? and(...onlineBase()) : undefined)
      .groupBy(orders.status),
    db
      .select({ status: sales.status, n: count() })
      .from(sales)
      .where(saleBase().length ? and(...saleBase()) : undefined)
      .groupBy(sales.status),
  ]);

  const byStatus = {
    pending: 0,
    confirmed: 0,
    paymentConfirmed: 0,
    sentToCourier: 0,
    completed: 0,
    returned: 0,
  };
  let online = 0;
  let pos = 0;
  const bump = (raw: string | null, n: number) => {
    const k = String(raw ?? "").toLowerCase();
    if (k === "pending") byStatus.pending += n;
    else if (k === "confirmed") byStatus.confirmed += n;
    else if (k === "payment confirmed") byStatus.paymentConfirmed += n;
    else if (k === "sent to courier") byStatus.sentToCourier += n;
    else if (k === "completed" || k === "delivered") byStatus.completed += n;
    else if (k === "returned") byStatus.returned += n;
  };
  for (const r of onlineStatus) {
    bump(r.status, Number(r.n));
    online += Number(r.n);
  }
  for (const r of posStatus) {
    bump(r.status, Number(r.n));
    pos += Number(r.n);
  }
  const summary = { ...byStatus, total: online + pos, pos, online };

  // ── Rows (paginated) ──────────────────────────────────────────────────────
  const pageNum = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? 50) || 50));
  const offset = (pageNum - 1) * pageSize;

  // Total matching rows for the pager (list filters only, not the summary).
  const [onlineCount] = await db
    .select({ n: count() })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(onlineConditions.length ? and(...onlineConditions) : undefined);
  const [posCount] = await db
    .select({ n: count() })
    .from(sales)
    .where(saleConditions.length ? and(...saleConditions) : undefined);
  const total = Number(onlineCount?.n ?? 0) + Number(posCount?.n ?? 0);

  // One UNION ALL query so the page is correctly ordered across both sources
  // (fetching N from each and merging would mis-order at page boundaries).
  const onlineWhereSql = onlineConditions.length
    ? sql`WHERE ${sql.join(onlineConditions, sql` AND `)}`
    : sql``;
  const posWhereSql = saleConditions.length
    ? sql`WHERE ${sql.join(saleConditions, sql` AND `)}`
    : sql``;

  const pageRes = await db.execute(sql`
    SELECT * FROM (
      SELECT "orders"."id"::text AS id, 'Online'::text AS channel, "orders"."status" AS status,
             "orders"."total" AS total, "orders"."created_at" AS created_at,
             COALESCE("users"."first_name", "orders"."customer_email", '—') AS customer_name,
             "orders"."customer_phone" AS customer_phone,
             "users"."email" AS customer_email,
             "orders"."payment_method" AS payment_method,
             NULL::text AS warehouse
      FROM "orders" LEFT JOIN "users" ON "users"."id" = "orders"."user_id"
      ${onlineWhereSql}
      UNION ALL
      SELECT "sales"."id"::text, 'POS'::text, "sales"."status",
             "sales"."total_amount", "sales"."created_at",
             COALESCE("sales"."customer_name", 'Walk-in'),
             "sales"."customer_phone",
             NULL::text,
             NULL::text,
             "sales"."store_id"
      FROM "sales"
      ${posWhereSql}
    ) t
    ORDER BY t.created_at DESC NULLS LAST
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const pageRows = pageRes.rows as unknown as {
    id: string;
    channel: string;
    status: string;
    total: number;
    created_at: string;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    payment_method: string | null;
    warehouse: string | null;
  }[];

  // Payments — scoped to just the POS sales on this page.
  const posIds = pageRows.filter((r) => r.channel === "POS").map((r) => r.id);
  const payments = posIds.length
    ? await db
        .select({
          saleId: salePayments.saleId,
          method: salePayments.method,
          amount: salePayments.amount,
          reference: salePayments.providerReference,
        })
        .from(salePayments)
        .where(inArray(salePayments.saleId, posIds))
    : [];
  const paymentsBySale = new Map<
    string,
    { method: string; amount: number; reference: string | null }[]
  >();
  for (const p of payments) {
    const arr = paymentsBySale.get(p.saleId) || [];
    arr.push({ method: p.method, amount: p.amount, reference: p.reference });
    paymentsBySale.set(p.saleId, arr);
  }
  const methodBySale = new Map<string, string>();
  for (const [sid, arr] of paymentsBySale) {
    if (arr.length) methodBySale.set(sid, arr[0].method);
  }

  const ordersOut = pageRows.map((r) => {
    const payArr = paymentsBySale.get(r.id) || [];
    return {
      id: r.id,
      channel: r.channel,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      customerPhone: r.customer_phone,
      status: r.status,
      paymentMethod:
        r.channel === "POS" ? (methodBySale.get(r.id) ?? "—") : (r.payment_method ?? "—"),
      payments:
        r.channel === "POS"
          ? payArr.length
            ? payArr
            : [{ method: "cash", amount: Number(r.total), reference: null }]
          : [{ method: r.payment_method ?? "—", amount: Number(r.total), reference: null }],
      total: Number(r.total),
      createdAt: r.created_at,
      warehouse: r.warehouse,
    };
  });

  return NextResponse.json({ orders: ordersOut, summary, page: pageNum, pageSize, total });
}

export async function PATCH(request: NextRequest) {
  const { id, status, notes } = await request.json();
  if (!id || !status) {
    return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
  }

  const [updated] = await db
    .update(orders)
    .set({ status, notes })
    .where(eq(orders.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
