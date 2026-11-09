import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Canonical P&L, shared by the dashboard and the reports page so the two can
 * never disagree.
 *
 * Definition (confirmed with the owner):
 *   sales gross profit = (net revenue − COGS) over sale lines that were NOT
 *     returned — a returned line is dropped entirely so a refund is never
 *     double-counted against revenue that is still booked.
 *   exchange profit    = trade-in value received − cost of the handed-over unit
 *   net profit         = sales gross profit + exchange profit − operating expenses
 *
 * Whole BDT. `from`/`to` are inclusive `YYYY-MM-DD` (null = open-ended).
 */

export interface Pnl {
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  salesGrossProfit: number;
  preOwnedProfit: number;
  exchangeValueIn: number;
  exchangeCost: number;
  exchangeProfit: number;
  expenses: number;
  netProfit: number;
  salesCount: number;
  itemsSold: number;
  returnedLines: number;
}

function rangeCond(col: string, from: string | null, to: string | null) {
  const parts = [];
  if (from) parts.push(sql`${sql.raw(col)}::date >= ${from}::date`);
  if (to) parts.push(sql`${sql.raw(col)}::date <= ${to}::date`);
  return parts.length ? sql` AND ${sql.join(parts, sql` AND `)}` : sql``;
}

export async function computePnl(from: string | null, to: string | null): Promise<Pnl> {
  const sales = await db.execute(sql`
    SELECT
      coalesce(sum(sl.unit_price * sl.quantity), 0)::bigint AS gross,
      coalesce(sum(sl.discount_amount), 0)::bigint       AS disc,
      coalesce(sum(sl.line_total), 0)::bigint            AS net,
      coalesce(sum(sl.cost_price * sl.quantity), 0)::bigint AS cogs,
      coalesce(sum(sl.quantity), 0)::int                 AS items,
      coalesce(sum(
        CASE WHEN p.category ILIKE '%pre-owned%'
             THEN sl.line_total - sl.cost_price * sl.quantity ELSE 0 END
      ), 0)::bigint                                      AS preowned,
      count(DISTINCT sl.sale_id)::int                    AS sale_count
    FROM sale_lines sl
    JOIN sales s ON s.id = sl.sale_id
    LEFT JOIN product_variants pv ON pv.id = sl.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE sl.id NOT IN (
      SELECT sale_line_id FROM returns
      WHERE sale_line_id IS NOT NULL AND status <> 'rejected'
    )
    ${rangeCond("s.created_at", from, to)}
  `);
  const s = sales.rows[0] as Record<string, unknown> | undefined;
  const grossRevenue = Number(s?.gross ?? 0);
  const discounts = Number(s?.disc ?? 0);
  const netRevenue = Number(s?.net ?? 0);
  const cogs = Number(s?.cogs ?? 0);
  const itemsSold = Number(s?.items ?? 0);
  const preOwnedProfit = Number(s?.preowned ?? 0);
  const salesCount = Number(s?.sale_count ?? 0);
  const salesGrossProfit = netRevenue - cogs;

  const ex = await db.execute(sql`
    SELECT
      coalesce(sum(eo.trade_in_agreed_value), 0)::bigint AS value_in,
      coalesce(sum((
        SELECT iu.acquisition_cost FROM inventory_units iu
        WHERE iu.variant_id = eo.new_product_variant_id
          AND (iu.imei_1 = eo.new_device_unit->>'imei1' OR iu.imei_2 = eo.new_device_unit->>'imei1')
        LIMIT 1
      )), 0)::bigint AS cost
    FROM exchange_orders eo
    WHERE true ${rangeCond("eo.created_at", from, to)}
  `);
  const e = ex.rows[0] as Record<string, unknown> | undefined;
  const exchangeValueIn = Number(e?.value_in ?? 0);
  const exchangeCost = Number(e?.cost ?? 0);
  const exchangeProfit = exchangeValueIn - exchangeCost;

  const expRes = await db.execute(sql`
    SELECT coalesce(sum(total_amount), 0)::bigint AS total
    FROM expenses
    WHERE status NOT IN ('rejected', 'cancelled') ${rangeCond("created_at", from, to)}
  `);
  const expenses = Math.round(
    Number((expRes.rows[0] as Record<string, unknown>)?.total ?? 0) / 100,
  );

  return {
    grossRevenue,
    discounts,
    netRevenue,
    cogs,
    salesGrossProfit,
    preOwnedProfit,
    exchangeValueIn,
    exchangeCost,
    exchangeProfit,
    expenses,
    netProfit: salesGrossProfit + exchangeProfit - expenses,
    salesCount,
    itemsSold,
    returnedLines: Number(s?.returned ?? 0),
  };
}
