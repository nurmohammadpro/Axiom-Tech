"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, Pill, Stat } from "@/components/dashboard/dashboard-shell";
import {
  useLocations,
  useReports,
  useSessionScope,
  useInventory,
  useCustomers,
  useCampaigns,
  useStaff,
  useSettings,
} from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Warehouse,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  Shield,
  BarChart3,
  Download,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { resolveRange, type DateRange } from "@/lib/date-range";
import type {
  ReportExchange,
  ReportOrder,
  ReportOrderItem,
  ReportReturn,
  ReportSale,
  ReportSaleItem,
} from "@/lib/api";

type Tab =
  | "orders"
  | "pos"
  | "warehouse"
  | "inventory"
  | "customers"
  | "profit"
  | "returns"
  | "staff";

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "orders", label: "Orders", icon: Package },
  { id: "pos", label: "POS Sales", icon: TrendingUp },
  { id: "warehouse", label: "Warehouse", icon: Warehouse },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "profit", label: "Profit/Loss", icon: DollarSign },
  { id: "returns", label: "Returns", icon: Shield },
  { id: "staff", label: "Staff Performance", icon: BarChart3 },
];

const orderStatuses = [
  "All",
  "Pending",
  "Confirmed",
  "Payment Confirmed",
  "Sent to Courier",
  "Completed",
  "Returned",
] as const;

function statusTone(status: string): "success" | "warn" | "danger" | "info" | "muted" {
  const s = status.toLowerCase();
  if (s === "completed") return "success";
  if (s === "payment confirmed" || s === "confirmed") return "info";
  if (s === "sent to courier") return "warn";
  if (s === "returned") return "danger";
  return "muted";
}

/** Online order amounts are stored as whole taka. */
const taka = (n: number) => bdt(n ?? 0);

const activeCls = "border-primary bg-primary text-primary-foreground";
const idleCls = "border-border text-muted-foreground hover:text-foreground";

export default function Reports() {
  const [tab, setTab] = useState<Tab>("orders");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<DateRange>(() => resolveRange("30d"));

  const { data: locations = [] } = useLocations();
  const { data: me } = useSessionScope();
  const scopedLocation = me?.isScoped ? (me.storeLocation ?? null) : null;
  const userRole = me?.staffRole || me?.role || "customer";
  const isOwner = userRole === "owner";
  const isManager = userRole === "manager";
  const isSalesman = userRole === "salesman";
  const { data: report } = useReports({ from: range.from, to: range.to });
  const { data: inventory = [] } = useInventory();
  const { data: customers = [] } = useCustomers();
  const { data: campaigns = [] } = useCampaigns();
  const { data: staff = [] } = useStaff();
  const { data: settings } = useSettings();

  // Filter tabs based on role
  const visibleTabs = useMemo(() => {
    if (isOwner) return tabs;
    if (isManager) {
      return tabs.filter((t) =>
        ["orders", "pos", "warehouse", "inventory", "customers", "returns"].includes(t.id),
      );
    }
    // Salesman
    return tabs.filter((t) => ["pos", "inventory", "customers", "returns"].includes(t.id));
  }, [isOwner, isManager, isSalesman]);

  // Reset tab if current tab is not visible for this role
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.store_info?.name || "Play Store",
      address: settings?.store_info?.address || "Dhaka, Bangladesh",
      phone: settings?.store_info?.phone || "01727811918",
      email: settings?.store_info?.email || "info@playstore.com.bd",
      logo: settings?.store_info?.logo || undefined,
    }),
    [settings],
  );

  const orders = report?.orders ?? [];
  const posSales = report?.posSales ?? [];
  const byWarehouse = report?.salesByWarehouse ?? [];
  const reportReturns = report?.returns ?? [];
  const reportExchanges = report?.exchanges ?? [];
  const summary = report?.summary ?? null;
  const refundedReturns = reportReturns.filter((r) =>
    ["refunded", "completed"].includes((r.status ?? "").toLowerCase()),
  );
  const openReturns = reportReturns.filter(
    (r) => !["refunded", "completed", "rejected"].includes((r.status ?? "").toLowerCase()),
  );
  const refundedValue = refundedReturns.reduce((s, r) => s + (r.refundAmount ?? 0), 0);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Helper function to print receipt from POS sales report
  function handlePrintPosReceipt(sale: ReportSale) {
    const receiptData: ReceiptData = {
      invoiceNumber: sale.invoiceNumber,
      date: new Date(sale.createdAt),
      barcodeNumber: sale.invoiceNumber,
      storeInfo,
      customer: {
        name: sale.customerName || "Walk-in",
        phone: sale.customerPhone || undefined,
      },
      items: sale.items.map((item, idx) => ({
        sl: idx + 1,
        description: item.name,
        unitPrice: item.unitPrice,
        qty: item.qty,
        total: item.unitPrice * item.qty,
        discountAmount: item.discountAmount ?? 0,
        categorySlug: item.categorySlug ?? undefined,
      })),
      totals: {
        subtotal: sale.subtotal,
        discount: sale.discountAmount > 0 ? sale.discountAmount : undefined,
        tax: sale.taxAmount > 0 ? sale.taxAmount : undefined,
        grandTotal: sale.total,
        paid: sale.total,
        change: 0,
      },
      payments: [
        {
          method: sale.paymentMethods.length ? sale.paymentMethods.join(" + ") : "Unknown",
          amount: sale.total,
        },
      ],
    };
    printReceipt(receiptData);
  }

  // ── Orders report ────────────────────────────────────────────────────────
  const filteredOrders = useMemo(
    () =>
      statusFilter === "All"
        ? orders
        : orders.filter((o) => o.status.toLowerCase() === statusFilter.toLowerCase()),
    [orders, statusFilter],
  );

  const orderMetrics = useMemo(() => {
    const revenue = filteredOrders.reduce((s, o) => s + o.total, 0);
    return {
      count: filteredOrders.length,
      revenue,
      avg: filteredOrders.length ? Math.round(revenue / filteredOrders.length) : 0,
      pending: filteredOrders.filter((o) => o.status.toLowerCase() === "pending").length,
      completed: filteredOrders.filter((o) => o.status.toLowerCase() === "completed").length,
      returned: filteredOrders.filter((o) => o.status.toLowerCase() === "returned").length,
    };
  }, [filteredOrders]);

  // ── POS sales report ─────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const loc = scopedLocation ?? (warehouseFilter === "All" ? null : warehouseFilter);
    if (!loc) return posSales;
    return posSales.filter((s) => s.warehouse === loc);
  }, [posSales, warehouseFilter, scopedLocation]);

  const saleMetrics = useMemo(() => {
    const revenue = filteredSales.reduce((s, x) => s + x.total, 0);
    const discounts = filteredSales.reduce((s, x) => s + x.discountAmount, 0);
    const itemsSold = filteredSales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty, 0), 0);
    const customers = new Set(filteredSales.map((s) => s.customerPhone || s.customerName)).size;
    return {
      count: filteredSales.length,
      revenue,
      avg: filteredSales.length ? Math.round(revenue / filteredSales.length) : 0,
      discounts,
      itemsSold,
      customers,
    };
  }, [filteredSales]);

  // ── Warehouse report ─────────────────────────────────────────────────────
  const warehouseSelected = scopedLocation ?? (warehouseFilter === "All" ? null : warehouseFilter);
  const visibleWarehouses = warehouseSelected
    ? byWarehouse.filter((w) => w.warehouse === warehouseSelected)
    : byWarehouse;
  const warehouseRevenue = visibleWarehouses.reduce((s, w) => s + w.revenue, 0);
  const warehouseOrders = visibleWarehouses.reduce((s, w) => s + w.orders, 0);

  return (
    <>
      {/* Date range — applies to every report tab */}
      <div className="mb-3 border border-border bg-surface/50 px-3 py-2">
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {/* Report tabs */}
      <div className="flex flex-wrap items-center gap-1">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "flex items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors " +
              (tab === t.id ? activeCls : idleCls)
            }
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Orders report ─────────────────────────────────────────────── */}
      {tab === "orders" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total orders" value={orderMetrics.count.toLocaleString()} />
            <Stat label="Revenue" value={taka(orderMetrics.revenue)} />
            <Stat label="Avg order" value={taka(orderMetrics.avg)} />
            <Stat
              label="Pending"
              value={orderMetrics.pending.toString()}
              hint="Awaiting confirmation"
            />
            <Stat label="Completed" value={orderMetrics.completed.toString()} hint="Fulfilled" />
            <Stat label="Returned" value={orderMetrics.returned.toString()} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
              <Filter size={12} /> Status
            </span>
            {orderStatuses.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={
                  "border px-2.5 py-1 text-xs transition-colors " +
                  (statusFilter === s ? activeCls : idleCls)
                }
              >
                {s}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredOrders.length} order{filteredOrders.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => {
                if (filteredOrders.length === 0) {
                  toast.error("No orders to export");
                  return;
                }
                generatePDF({
                  title: "Orders Report",
                  storeInfo,
                  kpis: [
                    { label: "Total Orders", value: String(orderMetrics.count) },
                    { label: "Revenue", value: bdtPDF(orderMetrics.revenue) },
                    { label: "Avg Order", value: bdtPDF(orderMetrics.avg) },
                    { label: "Pending", value: String(orderMetrics.pending) },
                    { label: "Completed", value: String(orderMetrics.completed) },
                    { label: "Returned", value: String(orderMetrics.returned) },
                  ],
                  columns: [
                    { header: "Order", key: "id", width: 22 },
                    { header: "Customer", key: "customer" },
                    { header: "Payment", key: "payment", width: 22 },
                    { header: "Status", key: "status", width: 24 },
                    { header: "Date", key: "date", width: 20 },
                    { header: "Total", key: "total", width: 24, align: "right" },
                  ],
                  rows: filteredOrders.map((o) => ({
                    id: o.id.slice(0, 8),
                    customer: o.customerName || "—",
                    payment: o.paymentMethod || "—",
                    status: o.status,
                    date: new Date(o.createdAt).toLocaleDateString(),
                    total: bdtPDF(o.total),
                  })),
                  grandTotal: { label: "Total Revenue", value: bdtPDF(orderMetrics.revenue) },
                });
                toast.success("PDF exported");
              }}
              className="ml-2 flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> PDF
            </button>
            <button
              onClick={() => {
                if (filteredOrders.length === 0) {
                  toast.error("No orders to export");
                  return;
                }
                downloadCSV(
                  ["Order ID", "Customer", "Payment", "Status", "Date", "Total"],
                  filteredOrders.map((o) => [
                    o.id.slice(0, 8),
                    o.customerName || "—",
                    o.paymentMethod || "—",
                    o.status,
                    new Date(o.createdAt).toLocaleDateString(),
                    o.total,
                  ]),
                  `orders-report-${new Date().toISOString().split("T")[0]}.csv`,
                );
                toast.success("CSV exported");
              }}
              className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> CSV
            </button>
          </div>

          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const open = expanded.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr
                        onClick={() => toggle(o.id)}
                        className={
                          "cursor-pointer border-b border-border last:border-b-0 hover:bg-surface " +
                          (open ? "bg-surface" : "")
                        }
                      >
                        <td className="px-3 py-2 font-mono text-xs">#{o.id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{o.customerName}</td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">
                          {o.paymentMethod}
                        </td>
                        <td className="px-3 py-2">
                          <Pill tone={statusTone(o.status)}>{o.status}</Pill>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{taka(o.total)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {o.items.length > 0 ? (
                            open ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )
                          ) : null}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-surface/50">
                          <td colSpan={7} className="px-6 py-3">
                            <OrderItemsTable items={o.items} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── POS sales report ──────────────────────────────────────────── */}
      {tab === "pos" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total sales" value={saleMetrics.count.toLocaleString()} />
            <Stat label="Revenue" value={bdt(saleMetrics.revenue)} />
            <Stat label="Avg ticket" value={bdt(saleMetrics.avg)} />
            <Stat label="Discounts" value={bdt(saleMetrics.discounts)} hint="Given on this view" />
            <Stat label="Items sold" value={saleMetrics.itemsSold.toLocaleString()} />
            <Stat label="Customers" value={saleMetrics.customers.toLocaleString()} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            {!scopedLocation ? (
              <>
                <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Warehouse size={12} /> Warehouse
                </span>
                {["All", ...locations.map((l) => l.name)].map((w) => (
                  <button
                    key={w}
                    onClick={() => setWarehouseFilter(w)}
                    className={
                      "border px-2.5 py-1 text-xs transition-colors " +
                      (warehouseFilter === w ? activeCls : idleCls)
                    }
                  >
                    {w}
                  </button>
                ))}
              </>
            ) : (
              <span className="border border-border px-2.5 py-1 text-xs text-muted-foreground">
                Warehouse: <span className="font-medium text-foreground">{scopedLocation}</span>
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredSales.length} sale{filteredSales.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => {
                if (filteredSales.length === 0) {
                  toast.error("No sales to export");
                  return;
                }
                generatePDF({
                  title: "POS Sales Report",
                  storeInfo,
                  kpis: [
                    { label: "Total Sales", value: String(saleMetrics.count) },
                    { label: "Revenue", value: bdtPDF(saleMetrics.revenue) },
                    { label: "Avg Ticket", value: bdtPDF(saleMetrics.avg) },
                    { label: "Discounts", value: bdtPDF(saleMetrics.discounts) },
                    { label: "Items Sold", value: String(saleMetrics.itemsSold) },
                    { label: "Customers", value: String(saleMetrics.customers) },
                  ],
                  columns: [
                    { header: "Sale #", key: "saleNumber", width: 18 },
                    { header: "Invoice", key: "invoice", width: 18 },
                    { header: "Date", key: "date", width: 18 },
                    { header: "Customer", key: "customer", width: 25 },
                    { header: "Products", key: "products" },
                    { header: "Seller", key: "cashier", width: 18 },
                    { header: "Warehouse", key: "warehouse", width: 18 },
                    { header: "Total", key: "total", width: 20, align: "right" },
                  ],
                  rows: filteredSales.map((s) => ({
                    saleNumber: s.saleNumber,
                    invoice: s.invoiceNumber,
                    date: new Date(s.createdAt).toLocaleDateString(),
                    customer: s.customerName || "Walk-in",
                    products: s.items.map((i) => `${i.name} (${i.qty})`).join(", ") || "—",
                    cashier: s.cashierName || "—",
                    warehouse: s.warehouse || "—",
                    total: bdtPDF(s.total),
                  })),
                  grandTotal: { label: "Total Revenue", value: bdtPDF(saleMetrics.revenue) },
                });
                toast.success("PDF exported");
              }}
              className="ml-2 flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> PDF
            </button>
            <button
              onClick={() => {
                if (filteredSales.length === 0) {
                  toast.error("No sales to export");
                  return;
                }
                downloadCSV(
                  [
                    "Sale #",
                    "Invoice",
                    "Date",
                    "Customer",
                    "Phone",
                    "Products",
                    "Seller",
                    "Warehouse",
                    "Total",
                  ],
                  filteredSales.map((s) => [
                    s.saleNumber,
                    s.invoiceNumber,
                    new Date(s.createdAt).toLocaleDateString(),
                    s.customerName || "Walk-in",
                    s.customerPhone || "",
                    s.items.map((i) => `${i.name} (${i.qty})`).join(", ") || "—",
                    s.cashierName || "",
                    s.warehouse || "",
                    s.total,
                  ]),
                  `pos-sales-report-${new Date().toISOString().split("T")[0]}.csv`,
                );
                toast.success("CSV exported");
              }}
              className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
            >
              <Download size={12} /> CSV
            </button>
          </div>

          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Sale</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Cashier</th>
                  <th className="px-3 py-2 font-medium">Warehouse</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => {
                  const open = expanded.has(s.id);
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => toggle(s.id)}
                        className={
                          "cursor-pointer border-b border-border last:border-b-0 hover:bg-surface " +
                          (open ? "bg-surface" : "")
                        }
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">#{s.saleNumber}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Inv {s.invoiceNumber}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2">
                          {s.customerName || "Walk-in"}
                          {s.customerPhone && (
                            <div className="text-xs text-muted-foreground">{s.customerPhone}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">
                          {s.paymentMethods.join(" + ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{s.cashierName || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {s.warehouse || "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{bdt(s.total)}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintPosReceipt(s);
                              }}
                              className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-surface"
                              title="Print receipt"
                            >
                              <Printer size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(s.id);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {s.items.length > 0 ? (
                                open ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )
                              ) : null}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-border bg-surface/50">
                          <td colSpan={9} className="px-6 py-3">
                            <SaleItemsTable items={s.items} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                      No POS sales found. Ring up a sale at the till to see it here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Warehouse report ──────────────────────────────────────────── */}
      {tab === "warehouse" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat
              label="POS revenue"
              value={bdt(warehouseRevenue)}
              hint={warehouseSelected ? `At ${warehouseSelected}` : "All warehouses"}
            />
            <Stat label="POS orders" value={warehouseOrders.toString()} />
            <Stat
              label="Warehouses"
              value={String(scopedLocation ? 1 : locations.length)}
              hint={scopedLocation ? "Scoped to your warehouse" : "Active warehouses"}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            {!scopedLocation ? (
              <>
                <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Warehouse size={12} /> Warehouse
                </span>
                {["All", ...locations.map((l) => l.name)].map((w) => (
                  <button
                    key={w}
                    onClick={() => setWarehouseFilter(w)}
                    className={
                      "border px-2.5 py-1 text-xs transition-colors " +
                      (warehouseFilter === w ? activeCls : idleCls)
                    }
                  >
                    {w}
                  </button>
                ))}
              </>
            ) : (
              <span className="border border-border px-2.5 py-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{scopedLocation}</span>
              </span>
            )}
            <span className="ml-auto" />
            {byWarehouse.length > 0 && (
              <>
                <button
                  onClick={() => {
                    generatePDF({
                      title: "Warehouse Report",
                      storeInfo,
                      kpis: [
                        { label: "POS Revenue", value: bdtPDF(warehouseRevenue) },
                        { label: "POS Orders", value: String(warehouseOrders) },
                        {
                          label: "Warehouses",
                          value: String(scopedLocation ? 1 : locations.length),
                        },
                      ],
                      columns: [
                        { header: "Warehouse", key: "warehouse" },
                        { header: "Revenue", key: "revenue", width: 26, align: "right" },
                        { header: "Orders", key: "orders", width: 14, align: "right" },
                      ],
                      rows: visibleWarehouses.map((w) => ({
                        warehouse: w.warehouse,
                        revenue: bdtPDF(w.revenue),
                        orders: String(w.orders),
                      })),
                      grandTotal: { label: "Total Revenue", value: bdtPDF(warehouseRevenue) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    downloadCSV(
                      ["Warehouse", "Revenue", "Orders"],
                      visibleWarehouses.map((w) => [w.warehouse, w.revenue, w.orders]),
                      `warehouse-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </>
            )}
          </div>

          <div className="mt-3">
            <div className="mb-2 text-sm font-medium">Sales by warehouse</div>
            <Card className="p-4">
              {byWarehouse.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No POS sales yet. Ring up a sale at the till to see per-warehouse revenue here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {byWarehouse.map((w) => {
                    const active = warehouseSelected === w.warehouse;
                    return (
                      <button
                        key={w.warehouse}
                        onClick={() => !scopedLocation && setWarehouseFilter(w.warehouse)}
                        className={
                          "border p-3 text-left transition-colors " +
                          (active
                            ? "border-foreground bg-surface"
                            : "border-border hover:bg-surface")
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{w.warehouse}</span>
                          {active && (
                            <span className="text-[10px] uppercase text-primary">viewing</span>
                          )}
                        </div>
                        <div className="mt-1 text-lg font-semibold">{bdt(w.revenue)}</div>
                        <div className="text-xs text-muted-foreground">{w.orders} orders</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ── Inventory report ──────────────────────────────────────────── */}
      {tab === "inventory" && (
        <>
          {(() => {
            // Filter inventory by scoped location for salesmen/managers
            const filteredInventory = scopedLocation
              ? inventory.filter(
                  (i) =>
                    i.location === scopedLocation ||
                    i.byLocation?.some((loc) => loc.location === scopedLocation),
                )
              : inventory;

            return (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Total products" value={filteredInventory.length.toLocaleString()} />
                  <Stat
                    label="Total stock"
                    value={filteredInventory.reduce((s, i) => s + i.available, 0).toLocaleString()}
                  />
                  <Stat
                    label="Low stock items"
                    value={filteredInventory
                      .filter((i) => i.available > 0 && i.available <= (i.lowStockThreshold ?? 5))
                      .length.toString()}
                    hint="Below threshold"
                  />
                  <Stat
                    label="Out of stock"
                    value={filteredInventory.filter((i) => i.available === 0).length.toString()}
                  />
                  <Stat
                    label="Multi-location"
                    value={filteredInventory
                      .filter((i) => i.byLocation?.length > 1)
                      .length.toString()}
                    hint="Stocked across locations"
                  />
                  <Stat
                    label="Total value"
                    value={bdt(filteredInventory.reduce((s, i) => s + i.costValue, 0))}
                    hint="At cost"
                  />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="ml-auto text-xs text-muted-foreground">
                    {filteredInventory.length} product{filteredInventory.length !== 1 ? "s" : ""}
                    {scopedLocation && (
                      <span className="ml-2 text-muted-foreground">at {scopedLocation}</span>
                    )}
                  </span>
                  {filteredInventory.length > 0 && (
                    <>
                      <button
                        onClick={() => {
                          generatePDF({
                            title: "Inventory Report",
                            storeInfo,
                            kpis: [
                              { label: "Total Products", value: String(filteredInventory.length) },
                              {
                                label: "Total Stock",
                                value: filteredInventory
                                  .reduce((s, i) => s + i.available, 0)
                                  .toLocaleString(),
                              },
                              {
                                label: "Low Stock",
                                value: filteredInventory
                                  .filter(
                                    (i) =>
                                      i.available > 0 && i.available <= (i.lowStockThreshold ?? 5),
                                  )
                                  .length.toString(),
                              },
                              {
                                label: "Out of Stock",
                                value: inventory.filter((i) => i.available === 0).length.toString(),
                              },
                              {
                                label: "Total Value",
                                value: bdtPDF(
                                  filteredInventory.reduce((s, i) => s + i.costValue, 0),
                                ),
                              },
                            ],
                            columns: [
                              { header: "Product", key: "product" },
                              { header: "SKU", key: "sku", width: 22 },
                              { header: "Category", key: "category", width: 22 },
                              { header: "Stock", key: "stock", width: 14, align: "right" },
                              { header: "Cost", key: "cost", width: 22, align: "right" },
                              { header: "Value", key: "value", width: 22, align: "right" },
                              { header: "Locations", key: "locations" },
                            ],
                            rows: filteredInventory.map((item) => ({
                              product: item.variantName,
                              sku: item.sku,
                              category: item.category || "—",
                              stock: String(item.available),
                              cost: bdtPDF(item.costPrice || 0),
                              value: bdtPDF(item.costValue),
                              locations:
                                item.byLocation
                                  ?.map((l) => `${l.location}: ${l.available}`)
                                  .join(", ") || "—",
                            })),
                            grandTotal: {
                              label: "Total Inventory Value",
                              value: bdtPDF(
                                filteredInventory.reduce(
                                  (s, i) => s + (i.costPrice || 0) * i.available,
                                  0,
                                ),
                              ),
                            },
                          });
                          toast.success("PDF exported");
                        }}
                        className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                      >
                        <Download size={12} /> PDF
                      </button>
                      <button
                        onClick={() => {
                          downloadCSV(
                            [
                              "Product",
                              "SKU",
                              "Category",
                              "Stock",
                              "Cost Price",
                              "Value",
                              "Locations",
                            ],
                            filteredInventory.map((item) => [
                              item.variantName,
                              item.sku,
                              item.category || "",
                              item.available,
                              item.costPrice || 0,
                              (item.costPrice || 0) * item.available,
                              item.byLocation
                                ?.map((l) => `${l.location}: ${l.available}`)
                                .join("; ") || "",
                            ]),
                            `inventory-report-${new Date().toISOString().split("T")[0]}.csv`,
                          );
                          toast.success("CSV exported");
                        }}
                        className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                      >
                        <Download size={12} /> CSV
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-3 overflow-x-auto border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 text-right font-medium">Stock</th>
                        <th className="px-3 py-2 text-right font-medium">Cost</th>
                        <th className="px-3 py-2 text-right font-medium">Value</th>
                        <th className="px-3 py-2 font-medium">Locations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item) => (
                        <tr
                          key={item.variantId}
                          className="border-b border-border last:border-b-0 hover:bg-surface"
                        >
                          <td className="px-3 py-2">{item.variantName}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                            {item.sku}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {item.category || "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Pill
                              tone={
                                item.available === 0
                                  ? "danger"
                                  : item.available <= (item.lowStockThreshold ?? 5)
                                    ? "warn"
                                    : "success"
                              }
                            >
                              {item.available} units
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-right">{bdt(item.costPrice || 0)}</td>
                          <td className="px-3 py-2 text-right font-medium">
                            {bdt((item.costPrice || 0) * item.available)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {item.byLocation
                              ?.map((l) => `${l.location}: ${l.available}`)
                              .join(", ") || "—"}
                          </td>
                        </tr>
                      ))}
                      {inventory.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                            No inventory data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* ── Customers report ──────────────────────────────────────────── */}
      {tab === "customers" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total customers" value={customers.length.toLocaleString()} />
            <Stat
              label="Active buyers"
              value={customers
                .filter(
                  (c) =>
                    (typeof c.totalSpent === "number" ? c.totalSpent : Number(c.totalSpent || 0)) >
                    0,
                )
                .length.toLocaleString()}
            />
            <Stat
              label="Total revenue"
              value={bdt(
                customers.reduce<number>(
                  (s, c) =>
                    s +
                    (typeof c.totalSpent === "number" ? c.totalSpent : Number(c.totalSpent || 0)),
                  0,
                ),
              )}
            />
            <Stat
              label="Avg LTV"
              value={bdt(
                customers.length
                  ? Math.round(
                      customers.reduce<number>(
                        (s, c) =>
                          s +
                          (typeof c.totalSpent === "number"
                            ? c.totalSpent
                            : Number(c.totalSpent || 0)),
                        0,
                      ) /
                        customers.filter(
                          (c) =>
                            (typeof c.totalSpent === "number"
                              ? c.totalSpent
                              : Number(c.totalSpent || 0)) > 0,
                        ).length,
                    )
                  : 0,
              )}
              hint="Buyer average"
            />
            <Stat
              label="Repeat buyers"
              value={customers
                .filter(
                  (c) =>
                    (typeof c.orderCount === "number" ? c.orderCount : Number(c.orderCount || 0)) >
                    1,
                )
                .length.toLocaleString()}
            />
            <Stat
              label="New customers"
              value={customers
                .filter((c: any) => !c.totalSpent || Number(c.totalSpent) === 0)
                .length.toLocaleString()}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="ml-auto text-xs text-muted-foreground">
              {customers.length} customer{customers.length !== 1 ? "s" : ""}
            </span>
            {customers.length > 0 && (
              <>
                <button
                  onClick={() => {
                    const sorted = [...customers].sort(
                      (a: any, b: any) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0),
                    );
                    const totalRevenue = customers.reduce<number>(
                      (s, c) =>
                        s +
                        (typeof c.totalSpent === "number"
                          ? c.totalSpent
                          : Number(c.totalSpent || 0)),
                      0,
                    );
                    const activeBuyers = customers.filter(
                      (c) =>
                        (typeof c.totalSpent === "number"
                          ? c.totalSpent
                          : Number(c.totalSpent || 0)) > 0,
                    ).length;
                    generatePDF({
                      title: "Customers Report",
                      storeInfo,
                      kpis: [
                        { label: "Total Customers", value: String(customers.length) },
                        { label: "Active Buyers", value: String(activeBuyers) },
                        { label: "Total Revenue", value: bdtPDF(totalRevenue) },
                        {
                          label: "Avg LTV",
                          value: bdtPDF(activeBuyers ? Math.round(totalRevenue / activeBuyers) : 0),
                        },
                      ],
                      columns: [
                        { header: "Customer", key: "name" },
                        { header: "Email", key: "email" },
                        { header: "Phone", key: "phone", width: 22 },
                        { header: "Orders", key: "orders", width: 14, align: "right" },
                        { header: "Total Spent", key: "total", width: 24, align: "right" },
                        { header: "Channel", key: "channel", width: 18 },
                      ],
                      rows: sorted.slice(0, 100).map((c: any) => ({
                        name: c.name,
                        email: c.email || "—",
                        phone: c.phone || "—",
                        orders: String(c.orderCount || 0),
                        total: bdtPDF(Number(c.totalSpent || 0)),
                        channel: c.channel || "—",
                      })),
                      grandTotal: { label: "Total Revenue", value: bdtPDF(totalRevenue) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    const sorted = [...customers].sort(
                      (a: any, b: any) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0),
                    );
                    downloadCSV(
                      ["Customer", "Email", "Phone", "Orders", "Total Spent", "Channel"],
                      sorted.map((c: any) => [
                        c.name,
                        c.email || "",
                        c.phone || "",
                        c.orderCount || 0,
                        Number(c.totalSpent || 0),
                        c.channel || "",
                      ]),
                      `customers-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </>
            )}
          </div>

          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium">Total spent</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                </tr>
              </thead>
              <tbody>
                {customers
                  .sort(
                    (a, b) =>
                      (typeof b.totalSpent === "number"
                        ? b.totalSpent
                        : Number(b.totalSpent || 0)) -
                      (typeof a.totalSpent === "number" ? a.totalSpent : Number(a.totalSpent || 0)),
                  )
                  .slice(0, 100)
                  .map((customer: any) => (
                    <tr
                      key={customer.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="px-3 py-2">{customer.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{customer.email}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {customer.phone || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{customer.orderCount || 0}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {bdt(Number(customer.totalSpent || 0))}
                      </td>
                      <td className="px-3 py-2">
                        <Pill tone={customer.channel === "POS" ? "success" : "info"}>
                          {customer.channel || "—"}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                {customers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                      No customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Profit/Loss report ──────────────────────────────────────────── */}
      {tab === "profit" &&
        (() => {
          const s = summary ?? {
            grossRevenue: 0,
            discounts: 0,
            netRevenue: 0,
            cogs: 0,
            grossProfit: 0,
            preOwnedProfit: 0,
            itemsSold: 0,
            salesCount: 0,
            exchangeValueIn: 0,
            exchangeCost: 0,
            exchangeProfit: 0,
            exchangeCount: 0,
            expenses: 0,
            netProfit: 0,
            from: null,
            to: null,
          };
          const netMargin =
            s.netRevenue > 0 ? ((s.grossProfit / s.netRevenue) * 100).toFixed(1) : "0.0";
          const pl: { label: string; value: number }[] = [
            { label: "Gross revenue (list)", value: s.grossRevenue },
            { label: "Discounts", value: -s.discounts },
            { label: "Net revenue", value: s.netRevenue },
            { label: "Cost of goods sold", value: -s.cogs },
            { label: "Gross profit", value: s.grossProfit },
            { label: "Exchange profit", value: s.exchangeProfit },
            { label: "Operating expenses", value: -s.expenses },
            { label: "Net profit", value: s.netProfit },
          ];
          const fmt = (v: number) => (v < 0 ? `-${bdt(Math.abs(v))}` : bdt(v));

          return (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat
                  label="Net revenue"
                  value={bdt(s.netRevenue)}
                  hint={`list ${bdt(s.grossRevenue)}`}
                />
                <Stat label="Discounts" value={bdt(s.discounts)} hint="given this period" />
                <Stat label="Cost of goods" value={bdt(s.cogs)} hint="actual cost" />
                <Stat
                  label="Gross profit"
                  value={bdt(s.grossProfit)}
                  hint={`${netMargin}% margin`}
                />
                <Stat
                  label="Pre-owned profit"
                  value={bdt(s.preOwnedProfit)}
                  hint="pre-owned category"
                />
                <Stat label="Net profit" value={bdt(s.netProfit)} hint="+ exchange − expenses" />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{range.label}</span>
                <span className="ml-auto" />
                <button
                  onClick={() => {
                    generatePDF({
                      title: "Profit & Loss Report",
                      storeInfo,
                      kpis: [
                        { label: "Net Revenue", value: bdtPDF(s.netRevenue) },
                        { label: "Cost of Goods", value: bdtPDF(s.cogs) },
                        { label: "Gross Profit", value: bdtPDF(s.grossProfit) },
                        { label: "Net Profit", value: bdtPDF(s.netProfit) },
                      ],
                      columns: [
                        { header: "Metric", key: "metric" },
                        { header: "Amount", key: "amount", width: 30, align: "right" },
                      ],
                      rows: pl.map((p) => ({ metric: p.label, amount: fmt(p.value) })),
                      grandTotal: { label: "Net Profit", value: bdtPDF(s.netProfit) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    downloadCSV(
                      ["Metric", "Amount"],
                      pl.map((p) => [p.label, p.value]),
                      `profit-loss-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </div>

              <div className="mt-3">
                <Card className="p-4">
                  <div className="mb-2 text-sm font-medium">Profit breakdown</div>
                  <div className="space-y-2">
                    {pl.map((p, i) => {
                      const isNet = i === pl.length - 1;
                      return (
                        <div key={p.label}>
                          {(i === 3 || isNet) && <div className="my-2 border-t border-border" />}
                          <div className="flex items-center justify-between text-sm">
                            <span className={isNet ? "font-medium" : "text-muted-foreground"}>
                              {p.label}
                            </span>
                            <span
                              className={
                                isNet
                                  ? `font-semibold ${p.value >= 0 ? "text-emerald-600" : "text-sale"}`
                                  : "font-medium"
                              }
                            >
                              {fmt(p.value)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            </>
          );
        })()}

      {/* ── Returns report ─────────────────────────────────────────────── */}
      {tab === "returns" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total returns" value={String(reportReturns.length)} />
            <Stat label="Refunded" value={String(refundedReturns.length)} hint="completed" />
            <Stat label="Open" value={String(openReturns.length)} hint="pending / processing" />
            <Stat label="Refund value" value={bdt(refundedValue)} hint="cash out" />
            <Stat
              label="Return rate"
              value={
                (summary?.salesCount ?? posSales.length)
                  ? (
                      (reportReturns.length / (summary?.salesCount ?? posSales.length)) *
                      100
                    ).toFixed(1) + "%"
                  : "0.0%"
              }
              hint="returns ÷ sales"
            />
            <Stat
              label="Exchanges"
              value={String(reportExchanges.length)}
              hint={
                reportExchanges.length ? `in ${bdt(summary?.exchangeValueIn ?? 0)}` : "trade-ins"
              }
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{range.label}</span>
            <span className="ml-auto" />
            {reportReturns.length > 0 && (
              <>
                <button
                  onClick={() => {
                    generatePDF({
                      title: "Returns Report",
                      storeInfo,
                      kpis: [
                        { label: "Total Returns", value: String(reportReturns.length) },
                        { label: "Refunded", value: String(refundedReturns.length) },
                        { label: "Refund Value", value: bdtPDF(refundedValue) },
                      ],
                      columns: [
                        { header: "RMA", key: "rma", width: 24 },
                        { header: "Date", key: "date", width: 20 },
                        { header: "Customer", key: "customer" },
                        { header: "Product", key: "product" },
                        { header: "Status", key: "status", width: 18 },
                        { header: "Refund", key: "refund", width: 22, align: "right" },
                      ],
                      rows: reportReturns.map((r) => ({
                        rma: r.id.slice(0, 14),
                        date: new Date(r.createdAt).toLocaleDateString(),
                        customer: r.customerName || "—",
                        product: r.productName || "—",
                        status: r.status || "—",
                        refund: r.refundAmount ? bdtPDF(r.refundAmount) : "—",
                      })),
                      grandTotal: { label: "Refund Value", value: bdtPDF(refundedValue) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    downloadCSV(
                      [
                        "RMA",
                        "Date",
                        "Customer",
                        "Product",
                        "Qty",
                        "Status",
                        "Refund",
                        "Method",
                        "Channel",
                      ],
                      reportReturns.map((r) => [
                        r.id,
                        new Date(r.createdAt).toLocaleDateString(),
                        r.customerName || "",
                        r.productName || "",
                        r.qty,
                        r.status || "",
                        r.refundAmount ?? 0,
                        r.refundMethod || "",
                        r.channel || "",
                      ]),
                      `returns-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </>
            )}
          </div>

          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">RMA</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Refund</th>
                </tr>
              </thead>
              <tbody>
                {reportReturns.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.id.slice(0, 14)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">{r.customerName || "—"}</td>
                    <td className="px-3 py-2">{r.productName || "—"}</td>
                    <td className="px-3 py-2 text-right">{r.qty}</td>
                    <td className="px-3 py-2">
                      <Pill
                        tone={
                          ["refunded", "completed"].includes((r.status ?? "").toLowerCase())
                            ? "success"
                            : "warn"
                        }
                      >
                        {r.status || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {r.refundAmount ? bdt(r.refundAmount) : "—"}
                    </td>
                  </tr>
                ))}
                {reportReturns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                      No returns in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Staff performance report ──────────────────────────────────────── */}
      {tab === "staff" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total staff" value={staff.length.toString()} />
            <Stat
              label="Active cashiers"
              value={new Set(posSales.map((s) => s.cashierName).filter(Boolean)).size.toString()}
            />
            <Stat
              label="Staff sales"
              value={bdt(
                posSales.filter((s) => s.cashierName).reduce((s, sale) => s + sale.total, 0),
              )}
            />
            <Stat
              label="Avg per cashier"
              value={bdt(
                new Set(posSales.map((s) => s.cashierName).filter(Boolean)).size
                  ? posSales.filter((s) => s.cashierName).reduce((s, sale) => s + sale.total, 0) /
                      new Set(posSales.map((s) => s.cashierName).filter(Boolean)).size
                  : 0,
              )}
            />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="ml-auto text-xs text-muted-foreground">
              {staff.length} staff member{staff.length !== 1 ? "s" : ""}
            </span>
            {staff.length > 0 && (
              <>
                <button
                  onClick={() => {
                    const staffData = staff.map((s: any) => {
                      const cashierSales = posSales.filter((ps) => ps.cashierId === s.userId);
                      const revenue = cashierSales.reduce((sum, sale) => sum + sale.total, 0);
                      return {
                        name: s.firstName + " " + s.lastName,
                        role: s.role,
                        sales: cashierSales.length,
                        revenue,
                        avg: cashierSales.length ? Math.round(revenue / cashierSales.length) : 0,
                      };
                    });
                    const totalRevenue = staffData.reduce((s, d) => s + d.revenue, 0);
                    generatePDF({
                      title: "Staff Performance Report",
                      storeInfo,
                      kpis: [
                        { label: "Total Staff", value: String(staff.length) },
                        {
                          label: "Active Cashiers",
                          value: String(
                            new Set(posSales.map((s) => s.cashierName).filter(Boolean)).size,
                          ),
                        },
                        { label: "Staff Sales", value: bdtPDF(totalRevenue) },
                      ],
                      columns: [
                        { header: "Staff", key: "name" },
                        { header: "Role", key: "role", width: 18 },
                        { header: "Sales", key: "sales", width: 14, align: "right" },
                        { header: "Revenue", key: "revenue", width: 24, align: "right" },
                        { header: "Avg Sale", key: "avg", width: 22, align: "right" },
                      ],
                      rows: staffData.map((d) => ({
                        name: d.name,
                        role: d.role,
                        sales: String(d.sales),
                        revenue: bdtPDF(d.revenue),
                        avg: d.sales ? bdtPDF(d.avg) : "—",
                      })),
                      grandTotal: { label: "Total Revenue", value: bdtPDF(totalRevenue) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    const staffData = staff.map((s: any) => {
                      const cashierSales = posSales.filter((ps) => ps.cashierId === s.userId);
                      const revenue = cashierSales.reduce((sum, sale) => sum + sale.total, 0);
                      return [
                        s.firstName + " " + s.lastName,
                        s.role,
                        cashierSales.length,
                        revenue,
                        cashierSales.length ? Math.round(revenue / cashierSales.length) : 0,
                      ];
                    });
                    downloadCSV(
                      ["Staff", "Role", "Sales", "Revenue", "Avg Sale"],
                      staffData,
                      `staff-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </>
            )}
          </div>

          <div className="mt-3 overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 text-right font-medium">Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">Avg sale</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s: any) => {
                  const cashierSales = posSales.filter((ps) => ps.cashierId === s.userId);
                  const revenue = cashierSales.reduce((sum, sale) => sum + sale.total, 0);
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="px-3 py-2">{s.firstName + " " + s.lastName}</td>
                      <td className="px-3 py-2">
                        <Pill
                          tone={
                            s.role === "owner" ? "success" : s.role === "manager" ? "info" : "muted"
                          }
                        >
                          {s.role}
                        </Pill>
                      </td>
                      <td className="px-3 py-2 text-right">{cashierSales.length}</td>
                      <td className="px-3 py-2 text-right font-medium">{bdt(revenue)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {cashierSales.length ? bdt(revenue / cashierSales.length) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      No staff records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function OrderItemsTable({ items }: { items: ReportOrderItem[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        Items · {items.reduce((s, i) => s + i.qty, 0)} unit{items.length !== 1 ? "s" : ""}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 font-medium">Product</th>
            <th className="pb-1 text-right font-medium">Qty</th>
            <th className="pb-1 text-right font-medium">Price</th>
            <th className="pb-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="py-1">{item.name}</td>
              <td className="py-1 text-right">{item.qty}</td>
              <td className="py-1 text-right">{taka(item.price)}</td>
              <td className="py-1 text-right font-medium">{taka(item.price * item.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SaleItemsTable({ items }: { items: ReportSaleItem[] }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        Items · {items.reduce((s, i) => s + i.qty, 0)} unit
        {items.reduce((s, i) => s + i.qty, 0) !== 1 ? "s" : ""}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 font-medium">Product</th>
            <th className="pb-1 font-medium">SKU</th>
            <th className="pb-1 font-medium">IMEI / Serial</th>
            <th className="pb-1 text-right font-medium">Qty</th>
            <th className="pb-1 text-right font-medium">Unit Price</th>
            <th className="pb-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="py-1">{item.name}</td>
              <td className="py-1 font-mono text-muted-foreground">{item.sku || "—"}</td>
              <td className="py-1 font-mono text-muted-foreground">
                {item.imeis.length ? item.imeis.join(", ") : "—"}
              </td>
              <td className="py-1 text-right">{item.qty}</td>
              <td className="py-1 text-right">{bdt(item.unitPrice)}</td>
              <td className="py-1 text-right font-medium">{bdt(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
