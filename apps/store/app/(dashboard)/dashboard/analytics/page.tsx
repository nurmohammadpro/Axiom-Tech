"use client";

import { useMemo } from "react";
import { Card, Stat, Pill } from "@/components/dashboard/dashboard-shell";
import { useDashboardStats, useReports, useCustomers, useSettings } from "@/lib/hooks";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { bdt } from "@/lib/utils";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function Analytics() {
  const { data: stats } = useDashboardStats();
  const { data: reports } = useReports();
  const { data: customers } = useCustomers();
  const { data: settings } = useSettings();

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "Your Shop",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "",
      email: settings?.storeEmail || "",
    }),
    [settings],
  );

  // Calculate actual net profit by deducting cost price from selling price
  const netProfit = reports
    ? Math.max(
        0,
        reports.posSales.reduce((total: number, sale) => {
          const saleProfit = sale.items.reduce((itemTotal: number, item: any) => {
            const sellingPrice = item.unitPrice || 0;
            const costPrice = item.costPrice || 0;
            const quantity = item.qty || 0;
            return itemTotal + (sellingPrice - costPrice) * quantity;
          }, 0);
          return total + saleProfit;
        }, 0) +
          reports.orders.reduce((total: number, order: any) => {
            const orderProfit = order.items.reduce((itemTotal: number, item: any) => {
              const sellingPrice = item.price || 0;
              const costPrice = item.costPrice || 0;
              const quantity = item.qty || 0;
              return itemTotal + (sellingPrice - costPrice) * quantity;
            }, 0);
            return total + orderProfit;
          }, 0),
      )
    : 0;

  // Orders per customer: how many orders the average customer places.
  const ordersPerCustomer =
    stats && stats.totalCustomers > 0 ? (stats.totalOrders / stats.totalCustomers).toFixed(1) : "0.0";

  // Repeat rate: share of customers with more than one order, clamped 0..100.
  const repeatRate =
    stats && stats.totalCustomers > 0
      ? Math.min(
          100,
          Math.max(0, ((stats.totalOrders - stats.totalCustomers) / stats.totalCustomers) * 100),
        ).toFixed(1)
      : "0.0";

  // Sales by channel
  const salesByChannel = stats
    ? [
        { channel: "POS", orders: stats.posOrders, revenue: stats.posRevenue },
        { channel: "Online", orders: stats.onlineOrders, revenue: stats.onlineRevenue },
      ].filter((c) => c.orders > 0)
    : [];

  // Revenue by brand from reports
  const revenueByBrand =
    reports?.posSales?.reduce((acc: Record<string, number>, sale) => {
      const items: { name: string; price?: number; qty?: number }[] = sale.items ?? [];
      if (items.length === 0) {
        // No line detail: attribute the whole sale once, not per item.
        const brand = sale.customerPhone ? "POS" : "Other";
        acc[brand] = (acc[brand] || 0) + (sale.total || 0);
        return acc;
      }
      const share = (sale.total || 0) / items.reduce((t, i) => t + (i.qty || 1), 0);
      items.forEach((item) => {
        const brand = item.name.split(" ")[0] || "Other";
        acc[brand] = (acc[brand] || 0) + share * (item.qty || 1);
      });
      return acc;
    }, {}) ?? {};

  // Cohort analysis - new vs returning (based on actual sales, not just registered customers)
  const customerCohort = reports
    ? {
        // Count unique customers from orders (online) and sales (POS)
        totalCustomers: new Set([
          ...reports.orders
            .map((o: any) => o.customerEmail || o.customerName || o.id)
            .filter(Boolean),
          ...reports.posSales
            .map((s: any) => s.customerPhone || s.customerName || s.id)
            .filter(Boolean),
        ]).size,
        // Returning customers = those who appear in multiple transactions
        returning: (() => {
          const customerCounts = new Map<string, number>();
          reports.orders.forEach((o: any) => {
            const key = o.customerEmail || o.customerName || o.id;
            customerCounts.set(key, (customerCounts.get(key) || 0) + 1);
          });
          reports.posSales.forEach((s: any) => {
            const key = s.customerPhone || s.customerName || s.id;
            customerCounts.set(key, (customerCounts.get(key) || 0) + 1);
          });
          return Array.from(customerCounts.values()).filter((count) => count > 1).length;
        })(),
      }
    : { totalCustomers: 0, returning: 0 };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Gross sales" value={stats ? bdt(stats.totalRevenue) : "—"} />
        <Stat
          label="Net profit"
          value={stats ? bdt(netProfit) : "—"}
          hint="Selling price - Cost price"
        />
        <Stat
          label="Orders / customer"
          value={ordersPerCustomer}
          hint={`${stats?.totalOrders || 0} orders, ${stats?.totalCustomers || 0} customers`}
        />
        <Stat label="Repeat rate" value={`${repeatRate}%`} hint="Returning customers" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {stats && (
          <>
            <button
              onClick={() => {
                generatePDF({
                  title: "Analytics Report",
                  storeInfo,
                  kpis: [
                    { label: "Gross Sales", value: bdtPDF(stats.totalRevenue) },
                    { label: "Net Profit", value: bdtPDF(netProfit) },
                    { label: "Orders / Customer", value: ordersPerCustomer },
                    { label: "Repeat Rate", value: `${repeatRate}%` },
                    { label: "Total Orders", value: String(stats.totalOrders) },
                    { label: "Total Customers", value: String(stats.totalCustomers) },
                  ],
                  columns: [
                    { header: "Metric", key: "metric" },
                    { header: "Value", key: "value", width: 30, align: "right" },
                  ],
                  rows: [
                    { metric: "Gross Sales", value: bdtPDF(stats.totalRevenue) },
                    { metric: "Net Profit", value: bdtPDF(netProfit) },
                    { metric: "POS Revenue", value: bdtPDF(stats.posRevenue) },
                    { metric: "Online Revenue", value: bdtPDF(stats.onlineRevenue) },
                    { metric: "POS Orders", value: String(stats.posOrders) },
                    { metric: "Online Orders", value: String(stats.onlineOrders) },
                    { metric: "Orders / Customer", value: ordersPerCustomer },
                    { metric: "Repeat Rate", value: `${repeatRate}%` },
                    ...Object.entries(revenueByBrand).slice(0, 5).map(([brand, revenue]) => ({
                      metric: `Brand: ${brand}`,
                      value: bdtPDF(revenue),
                    })),
                  ],
                });
                toast.success("PDF exported");
              }}
              className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> PDF
            </button>
            <button
              onClick={() => {
                downloadCSV(
                  ["Metric", "Value"],
                  [
                    ["Gross Sales", stats.totalRevenue],
                    ["Net Profit", netProfit],
                    ["POS Revenue", stats.posRevenue],
                    ["Online Revenue", stats.onlineRevenue],
                    ["POS Orders", stats.posOrders],
                    ["Online Orders", stats.onlineOrders],
                    ["Orders / Customer", ordersPerCustomer],
                    ["Repeat Rate", repeatRate],
                    ...Object.entries(revenueByBrand).slice(0, 5).map(([brand, revenue]) => [
                      `Brand: ${brand}`, revenue,
                    ]),
                  ],
                  `analytics-report-${new Date().toISOString().split("T")[0]}.csv`,
                );
                toast.success("CSV exported");
              }}
              className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> CSV
            </button>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="text-sm font-medium">Sales by channel</div>
          <div className="mt-4">
            {salesByChannel.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No channel data available yet. Connect a sales channel to see breakdown here.
              </div>
            ) : (
              <div className="space-y-3">
                {salesByChannel.map((channel) => (
                  <div key={channel.channel} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Pill tone={channel.channel === "POS" ? "success" : "info"}>
                        {channel.channel}
                      </Pill>
                      <span className="text-sm text-muted-foreground">{channel.orders} orders</span>
                    </div>
                    <span className="text-sm font-medium">{bdt(channel.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Revenue by brand</div>
          <div className="mt-4">
            {Object.keys(revenueByBrand).length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No brand revenue data available yet.
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(revenueByBrand)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([brand, revenue]) => (
                    <div key={brand} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{brand}</span>
                      <span className="font-medium">{bdt(revenue)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-sm font-medium">Cohort · new vs. returning customers</div>
        <Card className="p-4">
          {customerCohort.totalCustomers === 0 ? (
            <div className="text-sm text-muted-foreground">
              No cohort data available yet. Data will appear once more customers are processed.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  New customers
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {customerCohort.totalCustomers - customerCohort.returning}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Returning customers
                </div>
                <div className="mt-2 text-2xl font-semibold">{customerCohort.returning}</div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
