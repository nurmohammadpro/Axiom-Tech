"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Stat, Pill } from "@/components/dashboard/dashboard-shell";
import { useDashboardStats, useReports, useAuditLog, useMyPermissions } from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import { UpgradeBanner } from "@/components/dashboard/upgrade-banner";
import type { DashboardRange } from "@/lib/api";
import {
  AlertTriangle,
  Package,
  ShoppingCart,
  ArrowRight,
  Clock,
  CheckCircle2,
  RotateCcw,
  Boxes,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const RANGES: { id: DashboardRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

function formatCurrency(n: number) {
  return bdt(n);
}

interface SaleRow {
  id: string;
  saleNumber?: string | null;
  channel: string;
  customerName: string | null;
  status: string;
  total: number;
  createdAt: string;
}

function Section({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Overview() {
  const [range, setRange] = useState<DashboardRange>("30d");
  const { data: stats } = useDashboardStats(range);
  const { data: reports } = useReports();
  const { data: permissions } = useMyPermissions();
  // Audit is plan-gated; querying it on lower plans just produces 403 noise.
  const { data: auditData } = useAuditLog({ limit: "6" }, permissions?.["audit"] !== false);
  const auditEntries = auditData?.rows ?? [];

  const posSales = reports?.posSales ?? [];
  const onlineOrders = reports?.orders ?? [];
  const allSales = [
    ...posSales.map((s) => ({ ...s, channel: "POS" as const })),
    ...onlineOrders.map((o) => ({ ...o, channel: "Online" as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentSales = allSales.slice(0, 8) as unknown as SaleRow[];

  const revenueSpark = stats?.trend.map((t) => t.revenue) ?? [];
  const profitSpark = stats?.trend.map((t) => t.profit) ?? [];
  const trend = (stats?.trend ?? []).map((t) => ({
    ...t,
    day: t.date.slice(5),
  }));

  const lowStockSample = stats?.lowStockSample ?? [];
  const outOfStockSample = stats?.outOfStockSample ?? [];

  // Order status breakdown
  const statusBreakdown = (() => {
    const counts: Record<string, number> = {};
    for (const o of allSales) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  })();

  const maxTopUnits = Math.max(1, ...(stats?.topModels ?? []).map((m) => m.units));

  return (
    <>
      <UpgradeBanner />
      {/* Alerts */}
      {(outOfStockSample.length > 0 || lowStockSample.length > 0) && (
        <div className="mb-4 space-y-2">
          {stats && stats.outOfStockItems > 0 && (
            <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={14} />
              <span className="font-medium">{stats.outOfStockItems} out of stock</span>
              <span className="text-red-600">
                —{" "}
                {outOfStockSample
                  .slice(0, 3)
                  .map((i) => i.name)
                  .join(", ")}
                {stats.outOfStockItems > 3 ? ` +${stats.outOfStockItems - 3} more` : ""}
              </span>
              <Link
                href="/dashboard/inventory"
                className="ml-auto text-xs font-medium hover:underline"
              >
                View inventory →
              </Link>
            </div>
          )}
          {stats && stats.lowStockItems > 0 && (
            <div className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle size={14} />
              <span className="font-medium">{stats.lowStockItems} low stock</span>
              <span className="text-amber-600">
                —{" "}
                {lowStockSample
                  .slice(0, 3)
                  .map((i) => `${i.name} (${i.available})`)
                  .join(", ")}
                {stats.lowStockItems > 3 ? ` +${stats.lowStockItems - 3} more` : ""}
              </span>
              <Link
                href="/dashboard/inventory"
                className="ml-auto text-xs font-medium hover:underline"
              >
                View inventory →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Range selector */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={
                "px-3 py-1.5 text-xs font-medium transition-colors " +
                (range === r.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground")
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{stats?.rangeLabel ?? "—"}</span>
        </div>
      </div>

      {/* Today */}
      <Section title="Today" caption={new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Daily sales"
            value={stats ? formatCurrency(stats.dailySalesRevenue) : "—"}
            hint={`${stats?.dailySalesCount ?? 0} sales today`}
            href="/dashboard/reports"
            spark={revenueSpark}
          />
          <Stat
            label="Newly stocked"
            value={String(stats?.newlyStockedCount ?? 0)}
            hint="units added today"
            href="/dashboard/inventory"
          />
          <Stat
            label="Exchanged products"
            value={String(stats?.exchangedCount ?? 0)}
            hint={`${stats?.exchangedTotal ?? 0} all-time`}
            href="/dashboard/exchanges"
          />
          <Stat
            label="Returned products"
            value={String(stats?.returnedCount ?? 0)}
            hint={`${stats?.returnedTotal ?? 0} all-time`}
            href="/dashboard/returns"
          />
        </div>
      </Section>

      {/* Sales */}
      <Section title="Sales" caption={stats?.rangeLabel}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Net sales"
            value={stats ? formatCurrency(stats.totalRevenue) : "—"}
            hint={
              stats
                ? `list ${formatCurrency(stats.grossRevenue)} · −${formatCurrency(stats.discounts)} disc`
                : "all channels"
            }
            href="/dashboard/reports"
            spark={revenueSpark}
          />
          <Stat
            label="POS sales"
            value={stats ? formatCurrency(stats.posRevenue) : "—"}
            hint={`${stats?.posOrders ?? 0} orders`}
            href="/dashboard/cash"
          />
          <Stat
            label="Online sales"
            value={stats ? formatCurrency(stats.onlineRevenue) : "—"}
            hint={`${stats?.onlineOrders ?? 0} orders`}
            href="/dashboard/orders"
          />
          <Stat
            label="Orders"
            value={String(stats?.totalOrders ?? 0)}
            hint={`${stats?.posOrders ?? 0} POS · ${stats?.onlineOrders ?? 0} online`}
            href="/dashboard/orders"
          />
          <Stat
            label="Avg order value"
            value={stats ? formatCurrency(stats.aov) : "—"}
            hint={`${stats?.unitsSold ?? 0} units sold`}
            href="/dashboard/reports"
          />
          <Stat
            label="Units sold"
            value={String(stats?.unitsSold ?? 0)}
            hint={stats?.rangeLabel ?? "—"}
            href="/dashboard/inventory"
          />
        </div>
      </Section>

      {/* Profit */}
      <Section title="Profit" caption={stats?.rangeLabel}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Net profit"
            value={stats ? formatCurrency(stats.netProfit) : "—"}
            hint={
              stats
                ? `after ${formatCurrency(stats.cogsTotal)} cost + ${formatCurrency(stats.expensesTotal)} exp`
                : "—"
            }
            href="/dashboard/expenses"
            spark={profitSpark}
          />
          <Stat
            label="Gross profit"
            value={stats ? formatCurrency(stats.grossProfit) : "—"}
            hint={`revenue − ${stats ? formatCurrency(stats.cogsTotal) : "—"} cost`}
            href="/dashboard/reports"
          />
          <Stat
            label="Pre-owned profit"
            value={stats ? formatCurrency(stats.preOwnedProfit) : "—"}
            hint="pre-owned category"
            href="/dashboard/reports"
          />
          <Stat
            label="Gross margin"
            value={stats ? `${stats.grossMarginPct.toFixed(1)}%` : "—"}
            hint="before expenses"
            href="/dashboard/reports"
          />
          <Stat
            label="Expenses"
            value={stats ? formatCurrency(stats.expensesTotal) : "—"}
            hint="operating, this period"
            href="/dashboard/expenses"
          />
        </div>
      </Section>

      {/* Inventory */}
      <Section title="Inventory" caption="as of now">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Inventory cost value"
            value={stats ? formatCurrency(stats.inventoryCostValue) : "—"}
            hint={`${stats?.unitsOnHand ?? 0} units on hand`}
            href="/dashboard/inventory"
          />
          <Stat
            label="Units on hand"
            value={String(stats?.unitsOnHand ?? 0)}
            hint="sellable + qty stock"
            href="/dashboard/inventory"
          />
          <Stat
            label="Low stock"
            value={String(stats?.lowStockItems ?? 0)}
            hint="at/below threshold"
            href="/dashboard/inventory"
          />
          <Stat
            label="Out of stock"
            value={String(stats?.outOfStockItems ?? 0)}
            hint="zero available"
            href="/dashboard/inventory"
          />
          <Stat
            label="Pending returns"
            value={String(stats?.pendingReturns ?? 0)}
            hint={`${stats?.returnedTotal ?? 0} total returns`}
            href="/dashboard/returns"
          />
          <Stat
            label="Warranty claims"
            value={String(stats?.warrantyClaimsOpen ?? 0)}
            hint="open"
            href="/dashboard/warranties"
          />
        </div>
      </Section>

      {/* Customers & catalog */}
      <Section title="Customers & catalog" caption="as of now">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Customers"
            value={String(stats?.totalCustomers ?? 0)}
            hint="registered + buyer phones"
            href="/dashboard/customers"
          />
          <Stat
            label="Products"
            value={String(stats?.totalProducts ?? 0)}
            hint="in catalog"
            href="/dashboard/inventory"
          />
          <Stat
            label="Active campaigns"
            value={String(stats?.activeCampaigns ?? 0)}
            hint="promotions"
            href="/dashboard/campaigns"
          />
          <Stat
            label="Stock aging 90d+"
            value={String(stats?.stockAging.find((b) => b.bucket === "90+")?.units ?? 0)}
            hint={`${formatCurrency(stats?.stockAging.find((b) => b.bucket === "90+")?.value ?? 0)} tied up`}
            href="/dashboard/inventory"
          />
        </div>
      </Section>

      {/* Charts */}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Revenue & profit</div>
              <div className="text-xs text-muted-foreground">
                Daily · {stats?.rangeLabel ?? "—"}
              </div>
            </div>
          </div>
          <div className="mt-4 h-[220px]">
            {trend.some((d) => d.revenue > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#9ca3af"
                    tickFormatter={(v) => `৳${Number(v).toLocaleString()}`}
                  />
                  <Tooltip
                    formatter={(value: number, name) => [
                      bdt(value),
                      name === "profit" ? "Profit" : "Revenue",
                    ]}
                    contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Line
                    dataKey="profit"
                    name="Profit"
                    type="monotone"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No sales in this period
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Top models</div>
          <div className="text-xs text-muted-foreground">By units · {stats?.rangeLabel ?? "—"}</div>
          <div className="mt-4 space-y-3">
            {(stats?.topModels ?? []).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No sales yet.</div>
            ) : (
              stats!.topModels.map((m) => (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate pr-2">{m.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {m.units} · {formatCurrency(m.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(m.units / maxTopUnits) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Stock aging */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm font-medium">Stock aging</div>
          <div className="text-xs text-muted-foreground">Serialized units on hand, by age</div>
          <div className="mt-4 space-y-3">
            {(stats?.stockAging ?? []).every((b) => b.units === 0) ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No units in stock.
              </div>
            ) : (
              stats!.stockAging.map((b) => {
                const total = stats!.unitsOnHand || 1;
                return (
                  <div key={b.bucket} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-muted-foreground">{b.bucket}d</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className={
                          "h-1.5 rounded-full " +
                          (b.bucket === "90+"
                            ? "bg-sale"
                            : b.bucket === "61-90"
                              ? "bg-amber-500"
                              : "bg-primary")
                        }
                        style={{ width: `${(b.units / total) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-xs">
                      {b.units} · {formatCurrency(b.value)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Order status</div>
          <div className="mt-3 space-y-2">
            {statusBreakdown.length === 0 ? (
              <div className="text-sm text-muted-foreground">No orders yet.</div>
            ) : (
              statusBreakdown.map(({ status, count }) => {
                const pct = allSales.length > 0 ? (count / allSales.length) * 100 : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="w-24 text-xs capitalize">{status}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-border">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs text-muted-foreground">{count}</span>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Recent sales + Activity */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Recent sales</div>
            <Link href="/dashboard/orders" className="text-xs text-primary hover:underline">
              View all <ArrowRight size={10} className="inline" />
            </Link>
          </div>
          {allSales.length === 0 ? (
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">No sales yet.</div>
            </Card>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {(o.saleNumber || o.id).slice(0, 10)}
                      </td>
                      <td className="px-3 py-2">
                        <Pill tone={o.channel === "POS" ? "info" : "muted"}>{o.channel}</Pill>
                      </td>
                      <td className="px-3 py-2 text-sm">{o.customerName || "—"}</td>
                      <td className="px-3 py-2">
                        <Pill
                          tone={
                            o.status === "completed" || o.status === "delivered"
                              ? "success"
                              : o.status === "cancelled"
                                ? "danger"
                                : "warn"
                          }
                        >
                          {o.status}
                        </Pill>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {typeof o.total === "number" ? bdt(o.total) : `৳${o.total}`}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Activity</div>
            <Link href="/dashboard/audit" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {auditEntries.length === 0 ? (
            <div className="mt-4 text-sm text-muted-foreground">No recent activity.</div>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {auditEntries.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <div className="mt-0.5 shrink-0">
                    {e.action.includes("sale") ? (
                      <ShoppingCart size={12} className="text-emerald-600" />
                    ) : e.action.includes("inventory") ? (
                      <Package size={12} className="text-blue-600" />
                    ) : e.action.includes("return") ? (
                      <RotateCcw size={12} className="text-amber-600" />
                    ) : (
                      <CheckCircle2 size={12} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{e.userEmail || "System"}</span>{" "}
                      <span className="text-muted-foreground">{e.action}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={10} />
                      {new Date(e.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {e.entityType && <span>· {e.entityType}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Sales by warehouse */}
      <div className="mt-3">
        <Card className="p-4">
          <div className="text-sm font-medium">Sales by warehouse</div>
          <div className="mt-3 space-y-2">
            {reports?.salesByWarehouse && reports.salesByWarehouse.length > 0 ? (
              reports.salesByWarehouse.map((wh) => (
                <div key={wh.warehouse} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Boxes size={12} className="text-muted-foreground" />
                    <span>{wh.warehouse || "Unassigned"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{wh.orders} orders</span>
                    <span className="font-medium text-foreground">{bdt(wh.revenue)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No warehouse data yet.</div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
