import { db } from "@/db";
import {
  orders,
  users,
  products,
  returns,
  campaigns,
  sales,
  exchangeOrders,
  inventoryUnits,
  warrantyClaims,
} from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, count, sum, sql } from "drizzle-orm";
import { getScope, requireStaff } from "@/lib/authz";
import { computePnl } from "@/lib/profit";

export const dynamic = "force-dynamic";

/**
 * Overview stats for the dashboard. Accepts `?range=today|7d|30d|all` (default
 * 30d) which drives the sales/profit KPIs and the trend series; point-in-time
 * inventory and counts are always "now". Inventory valuation mirrors the
 * inventory page: serialized units at their recorded acquisition cost, plus
 * quantity-based (non-unit-tracked) variants at their cost price.
 */

const RANGES = ["today", "7d", "30d", "all"] as const;
type Range = (typeof RANGES)[number];

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

/** Start-of-window SQL fragment for the range (null = all time). */
function rangeStart(range: Range) {
  if (range === "today") return sql`current_date`;
  if (range === "7d") return sql`current_date - interval '6 days'`;
  if (range === "30d") return sql`current_date - interval '29 days'`;
  return null;
}

/** Inclusive YYYY-MM-DD window for the range, feeding the shared P&L. */
function rangeDates(range: Range): { from: string | null; to: string | null } {
  if (range === "all") return { from: null, to: null };
  const now = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const to = ymd(now);
  const f = new Date(now);
  if (range === "7d") f.setDate(f.getDate() - 6);
  else if (range === "30d") f.setDate(f.getDate() - 29);
  return { from: ymd(f), to };
}

/**
 * The window immediately BEFORE the range — powers the "vs previous period"
 * deltas on the metric cards. today -> yesterday, 7d -> prior 7, 30d -> prior 30.
 */
function prevRangeDates(range: Range): { from: string | null; to: string | null } {
  if (range === "all") return { from: null, to: null };
  const now = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const toD = new Date(now);
  toD.setDate(toD.getDate() - days);
  const fromD = new Date(toD);
  fromD.setDate(fromD.getDate() - days + 1);
  return { from: ymd(fromD), to: ymd(toD) };
}

/** Start-of-window SQL fragment for the previous period. */
function prevRangeStart(range: Range) {
  if (range === "today") return sql`current_date - interval '1 day'`;
  if (range === "7d") return sql`current_date - interval '13 days'`;
  if (range === "30d") return sql`current_date - interval '59 days'`;
  return null;
}

export async function GET(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  const requested = request.nextUrl.searchParams.get("range") ?? "30d";
  const range: Range = (RANGES as readonly string[]).includes(requested)
    ? (requested as Range)
    : "30d";

  const start = rangeStart(range);
  const salesRange = start ? sql`${sales.createdAt} >= ${start}` : undefined;
  const ordersRange = start ? sql`${orders.createdAt} >= ${start}` : undefined;
  const trendStart =
    start ?? sql`COALESCE((SELECT MIN(created_at)::date FROM sales), current_date)`;

  // ── Sales / profit for the range ─────────────────────────────────────────
  const [posStats] = await db
    .select({ count: count(), revenue: sum(sales.totalAmount) })
    .from(sales)
    .where(salesRange);

  const [onlineStats] = await db
    .select({ count: count(), revenue: sum(orders.total) })
    .from(orders)
    .where(ordersRange);

  // Canonical P&L (shared with the reports page so the two always agree):
  // sales gross profit net of returned lines, + exchange profit, − expenses.
  const { from, to } = rangeDates(range);
  const pnl = await computePnl(from, to);

  const onlineRevenue = Number(onlineStats?.revenue || 0);
  const posRevenue = pnl.netRevenue;
  const totalRevenue = onlineRevenue + posRevenue;
  const totalOrders = Number(onlineStats?.count || 0) + Number(posStats?.count || 0);
  const cogsTotal = pnl.cogs;
  const unitsSold = pnl.itemsSold;
  const grossProfit = pnl.salesGrossProfit;
  const expensesTotal = pnl.expenses;
  const netProfit = pnl.netProfit;

  // ── Previous period (for "vs previous" deltas on the metric cards) ───────
  let prevNetRevenue: number | null = null;
  let prevTotalOrders: number | null = null;
  let prevNetProfit: number | null = null;
  if (range !== "all") {
    const prev = prevRangeDates(range);
    const prevPnl = await computePnl(prev.from, prev.to);
    const pStart = prevRangeStart(range);
    const prevSalesRange = pStart ? sql`${sales.createdAt} >= ${pStart} and ${sales.createdAt} < ${rangeStart(range)}` : undefined;
    const prevOrdersRange = pStart ? sql`${orders.createdAt} >= ${pStart} and ${orders.createdAt} < ${rangeStart(range)}` : undefined;
    const [prevPos] = await db
      .select({ count: count() })
      .from(sales)
      .where(prevSalesRange);
    const [prevOnline] = await db
      .select({ count: count() })
      .from(orders)
      .where(prevOrdersRange);
    // Online revenue for the previous window:
    const [prevOnlineRev] = await db
      .select({ revenue: sum(orders.total) })
      .from(orders)
      .where(prevOrdersRange);
    prevNetRevenue = prevPnl.netRevenue + Number(prevOnlineRev?.revenue || 0);
    prevTotalOrders = Number(prevPos?.count || 0) + Number(prevOnline?.count || 0);
    prevNetProfit = prevPnl.netProfit;
  }

  // Month-to-date revenue (for the monthly-target ring).
  const [mtd] = await db
    .select({ revenue: sql<number>`coalesce(sum(${sales.totalAmount}), 0)::int` })
    .from(sales)
    .where(sql`${sales.createdAt} >= date_trunc('month', current_date)`);
  const mtdRevenue = Number(mtd?.revenue || 0);



  // ── Counts (point-in-time) ───────────────────────────────────────────────
  // Registered customers + distinct non-empty phone numbers that bought in-store.
  const [registeredCustomers] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "customer"));

  const [phoneCustomers] = await db
    .select({ count: count(sql<string>`distinct ${sales.customerPhone}`) })
    .from(sales)
    .where(sql`coalesce(${sales.customerPhone}, '') <> ''`);

  const customerCount = Number(registeredCustomers.count || 0) + Number(phoneCustomers.count || 0);

  const [productCount] = await db.select({ count: count() }).from(products);

  const [returnCount] = await db
    .select({ count: count() })
    .from(returns)
    .where(sql`${returns.status} NOT IN ('refunded', 'completed', 'rejected')`);
  const [returnedTotal] = await db.select({ count: count() }).from(returns);
  const [returnedToday] = await db
    .select({ count: count() })
    .from(returns)
    .where(sql`${returns.createdAt}::date = current_date`);

  const [activeCampaigns] = await db
    .select({ count: count() })
    .from(campaigns)
    .where(eq(campaigns.isActive, true));

  const [exchangedToday] = await db
    .select({ count: count() })
    .from(exchangeOrders)
    .where(sql`${exchangeOrders.createdAt}::date = current_date`);
  const [exchangedAllTime] = await db.select({ count: count() }).from(exchangeOrders);

  const [claimsOpen] = await db
    .select({ count: count() })
    .from(warrantyClaims)
    .where(sql`${warrantyClaims.status} NOT IN ('resolved', 'closed', 'rejected', 'denied')`);

  // ── Today's activity ─────────────────────────────────────────────────────
  const [dailySales] = await db
    .select({ count: count(), revenue: sum(sales.totalAmount) })
    .from(sales)
    .where(sql`${sales.createdAt}::date = current_date`);

  const [newlyStocked] = await db
    .select({ count: count() })
    .from(inventoryUnits)
    .where(sql`${inventoryUnits.createdAt}::date = current_date`);

  // ── Inventory (point-in-time) ────────────────────────────────────────────
  const serialized = await db.execute(sql`
    SELECT
      COALESCE(SUM(COALESCE(iu.acquisition_cost, ib.unit_cost, pv.cost_price, 0)), 0)::bigint AS value,
      COUNT(*)::int AS units
    FROM inventory_units iu
    JOIN product_variants pv ON pv.id = iu.variant_id
    LEFT JOIN inventory_batches ib ON ib.id = iu.batch_id
    WHERE iu.status = 'available'
  `);
  const quantityBased = await db.execute(sql`
    SELECT
      COALESCE(SUM(pv.quantity * pv.cost_price), 0)::bigint AS value,
      COALESCE(SUM(pv.quantity), 0)::int AS units
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.active = true AND p.product_type = 'accessory' AND COALESCE(p.track_units, false) = false
  `);
  const serRows = serialized.rows as unknown as { value: string; units: string }[];
  const qbRows = quantityBased.rows as unknown as { value: string; units: string }[];
  const inventoryCostValue = Number(serRows[0]?.value || 0) + Number(qbRows[0]?.value || 0);
  const unitsOnHand = Number(serRows[0]?.units || 0) + Number(qbRows[0]?.units || 0);

  // Stock aging of serialized available units.
  const agingRows = await db.execute(sql`
    SELECT bucket, COUNT(*)::int AS units, COALESCE(SUM(value), 0)::bigint AS value
    FROM (
      SELECT
        CASE
          WHEN current_date - iu.received_at::date <= 30 THEN '0-30'
          WHEN current_date - iu.received_at::date <= 60 THEN '31-60'
          WHEN current_date - iu.received_at::date <= 90 THEN '61-90'
          ELSE '90+'
        END AS bucket,
        COALESCE(iu.acquisition_cost, ib.unit_cost, pv.cost_price, 0) AS value
      FROM inventory_units iu
      JOIN product_variants pv ON pv.id = iu.variant_id
      LEFT JOIN inventory_batches ib ON ib.id = iu.batch_id
      WHERE iu.status = 'available'
    ) t
    GROUP BY bucket
  `);
  const agingOrder = ["0-30", "31-60", "61-90", "90+"];
  const agingList = agingRows.rows as unknown as { bucket: string; units: string; value: string }[];
  const stockAging = agingOrder.map((bucket) => {
    const row = agingList.find((r) => r.bucket === bucket);
    return { bucket, units: Number(row?.units || 0), value: Number(row?.value || 0) };
  });

  // Low / out of stock by variant availability (excludes quantity 0 = out of stock).
  const stockRows = await db.execute(sql`
    SELECT
      p.name AS name,
      CASE
        WHEN p.product_type = 'accessory' AND COALESCE(p.track_units, false) = false
          THEN COALESCE(pv.quantity, 0)
        ELSE (SELECT count(*) FROM inventory_units iu
              WHERE iu.variant_id = pv.id AND iu.status = 'available')
      END AS available,
      COALESCE(i.low_stock_threshold, 5) AS threshold
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory i ON i.sku = pv.sku
    WHERE pv.active = true
  `);
  const stockList = stockRows.rows as unknown as {
    name: string;
    available: string;
    threshold: string;
  }[];
  const availableRows = stockList.map((r) => ({
    name: r.name,
    available: Number(r.available || 0),
    threshold: Number(r.threshold || 5),
  }));
  const outOfStockList = availableRows.filter((r) => r.available <= 0);
  const totalVariants = availableRows.length;
  const outVariants = outOfStockList.length;
  const stockHealthPct = totalVariants > 0 ? Math.round(((totalVariants - outVariants) / totalVariants) * 100) : 100;
  const lowStockList = availableRows
    .filter((r) => r.available > 0 && r.available <= r.threshold)
    .sort((a, b) => a.available - b.available);

  // ── Trend series (revenue + profit per day) ─────────────────────────────
  const trendRows = await db.execute(sql`
    WITH days AS (
      SELECT generate_series((${trendStart})::date, current_date, interval '1 day')::date AS d
    ),
    rev AS (
      SELECT created_at::date AS d, SUM(total_amount) AS revenue
      FROM sales WHERE created_at::date >= (${trendStart})::date GROUP BY 1
    ),
    prof AS (
      SELECT s.created_at::date AS d, SUM(sl.line_total - sl.cost_price * sl.quantity) AS profit
      FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
      WHERE s.created_at::date >= (${trendStart})::date GROUP BY 1
    )
    SELECT
      to_char(days.d, 'YYYY-MM-DD') AS date,
      COALESCE(rev.revenue, 0)::int AS revenue,
      COALESCE(prof.profit, 0)::int AS profit
    FROM days
    LEFT JOIN rev ON rev.d = days.d
    LEFT JOIN prof ON prof.d = days.d
    ORDER BY days.d
  `);
  const trendList = trendRows.rows as unknown as {
    date: string;
    revenue: string;
    profit: string;
  }[];
  const trend = trendList.map((r) => ({
    date: r.date,
    revenue: Number(r.revenue || 0),
    profit: Number(r.profit || 0),
  }));

  // ── Top models (range) ──────────────────────────────────────────────────
  const topRows = await db.execute(sql`
    SELECT p.id, p.name,
      SUM(sl.quantity)::int AS units,
      SUM(sl.line_total)::int AS revenue,
      SUM(sl.line_total - sl.cost_price * sl.quantity)::int AS margin
    FROM sale_lines sl
    JOIN sales s ON s.id = sl.sale_id
    JOIN product_variants pv ON pv.id = sl.variant_id
    JOIN products p ON p.id = pv.product_id
    ${start ? sql`WHERE s.created_at >= ${start}` : sql``}
    GROUP BY p.id, p.name
    ORDER BY units DESC
    LIMIT 6
  `);
  const topList = topRows.rows as unknown as {
    id: string;
    name: string;
    units: string;
    revenue: string;
    margin: string;
  }[];
  const topModels = topList.map((r) => ({
    id: r.id,
    name: r.name,
    units: Number(r.units || 0),
    revenue: Number(r.revenue || 0),
    margin: Number(r.margin || 0),
  }));

  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return NextResponse.json({
    prev: {
      netRevenue: prevNetRevenue,
      totalOrders: prevTotalOrders,
      netProfit: prevNetProfit,
    },
    mtdRevenue,
    stockHealthPct,
    range,
    rangeLabel: RANGE_LABELS[range],
    // Sales / profit (range)
    totalOrders,
    totalRevenue,
    onlineOrders: Number(onlineStats?.count || 0),
    onlineRevenue,
    posOrders: Number(posStats?.count || 0),
    posRevenue,
    unitsSold,
    aov,
    grossRevenue: pnl.grossRevenue,
    discounts: pnl.discounts,
    cogsTotal,
    grossProfit,
    grossMarginPct,
    preOwnedProfit: pnl.preOwnedProfit,
    exchangeProfit: pnl.exchangeProfit,
    expensesTotal,
    netProfit,
    // Today
    dailySalesRevenue: Number(dailySales?.revenue || 0),
    dailySalesCount: Number(dailySales?.count || 0),
    newlyStockedCount: Number(newlyStocked?.count || 0),
    exchangedCount: Number(exchangedToday?.count || 0),
    exchangedTotal: Number(exchangedAllTime?.count || 0),
    returnedCount: Number(returnedToday?.count || 0),
    returnedTotal: Number(returnedTotal?.count || 0),
    // Inventory (point-in-time)
    inventoryCostValue,
    unitsOnHand,
    lowStockItems: lowStockList.length,
    outOfStockItems: outOfStockList.length,
    lowStockSample: lowStockList.slice(0, 5).map((r) => ({ name: r.name, available: r.available })),
    outOfStockSample: outOfStockList.slice(0, 5).map((r) => ({ name: r.name })),
    stockAging,
    // Series & breakdowns
    trend,
    topModels,
    // Counts (point-in-time)
    totalCustomers: Number(customerCount || 0),
    totalProducts: Number(productCount?.count || 0),
    pendingReturns: Number(returnCount?.count || 0),
    activeCampaigns: Number(activeCampaigns?.count || 0),
    warrantyClaimsOpen: Number(claimsOpen?.count || 0),
  });
}
