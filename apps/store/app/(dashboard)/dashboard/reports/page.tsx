"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { MetricCard } from "@/components/dashboard/metric-cards";
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
  ShoppingCart,
  Banknote,
  Clock,
  PackageCheck,
  XCircle,
  Tag,
  Undo2,
  UserCheck,
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
import { SortableTable } from "@/components/dashboard/sortable-table";
import { TabStrip } from "@/components/dashboard/tab-strip";
import { FilterChips } from "@/components/ui/filter-chips";
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
      name: settings?.store_info?.name || "Your Shop",
      address: settings?.store_info?.address || "Dhaka, Bangladesh",
      phone: settings?.store_info?.phone || "",
      email: settings?.store_info?.email || "",
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
      <TabStrip
        tabs={visibleTabs.map((t) => ({ key: t.id, label: t.label, icon: t.icon }))}
        active={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {/* ── Orders report ─────────────────────────────────────────────── */}
      {tab === "orders" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={ShoppingCart} label="Total orders" value={orderMetrics.count.toLocaleString()} />
            <MetricCard icon={Banknote} label="Revenue" value={taka(orderMetrics.revenue)} />
            <MetricCard icon={Banknote} label="Avg order" value={taka(orderMetrics.avg)} />
            <MetricCard
              icon={Clock}
              label="Pending"
              value={orderMetrics.pending.toString()}
              sub="Awaiting confirmation"
            />
            <MetricCard icon={PackageCheck} label="Completed" value={orderMetrics.completed.toString()} sub="Fulfilled" />
            <MetricCard icon={Undo2} label="Returned" value={orderMetrics.returned.toString()} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
              <Filter size={12} /> Status
            </span>
            <FilterChips
              items={orderStatuses.map((s) => ({ key: s, label: s }))}
              active={statusFilter}
              onChange={(k) => setStatusFilter(k)}
            />
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

          <SortableTable
            columns={[
              {
                key: "id",
                header: "Order",
                sortable: true,
                className: "font-mono text-xs",
                render: (v) => `#${v.slice(0, 8)}`,
              },
              { key: "customerName", header: "Customer", sortable: true },
              {
                key: "paymentMethod",
                header: "Payment",
                sortable: true,
                className: "capitalize text-muted-foreground",
              },
              {
                key: "status",
                header: "Status",
                sortable: true,
                render: (v) => <Pill tone={statusTone(v)}>{v}</Pill>,
              },
              {
                key: "createdAt",
                header: "Date",
                sortable: true,
                className: "text-muted-foreground",
                render: (v) => new Date(v).toLocaleDateString(),
              },
              {
                key: "total",
                header: "Total",
                sortable: true,
                className: "text-right font-semibold",
                render: (v) => taka(v),
              },
              {
                key: "chevron",
                header: "",
                className: "text-right text-muted-foreground",
                render: (_v, row) =>
                  row.itemCount > 0 ? (
                    expanded.has(row.id) ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )
                  ) : null,
              },
            ]}
            data={filteredOrders.map((o) => ({
              id: o.id,
              customerName: o.customerName,
              paymentMethod: o.paymentMethod,
              status: o.status,
              createdAt: o.createdAt,
              total: o.total,
              itemCount: o.items.length,
              items: o.items,
            }))}
            rowKey={(row) => row.id}
            expandedKeys={expanded}
            onRowClick={(row) => toggle(row.id)}
            rowClassName={(row) =>
              "cursor-pointer " + (expanded.has(row.id) ? "bg-surface" : "")
            }
            detailRow={(row) => <OrderItemsTable items={row.items} />}
            pageSize={25}
            emptyMessage="No orders found."
          />
        </>
      )}

      {/* ── POS sales report ──────────────────────────────────────────── */}
      {tab === "pos" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={ShoppingCart} label="Total sales" value={saleMetrics.count.toLocaleString()} />
            <MetricCard icon={Banknote} label="Revenue" value={bdt(saleMetrics.revenue)} />
            <MetricCard icon={Banknote} label="Avg ticket" value={bdt(saleMetrics.avg)} />
            <MetricCard icon={Tag} label="Discounts" value={bdt(saleMetrics.discounts)} sub="Given on this view" />
            <MetricCard icon={Package} label="Items sold" value={saleMetrics.itemsSold.toLocaleString()} />
            <MetricCard icon={Users} label="Customers" value={saleMetrics.customers.toLocaleString()} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!scopedLocation ? (
              <>
                <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Warehouse size={12} /> Warehouse
                </span>
                <FilterChips
                  items={["All", ...locations.map((l) => l.name)].map((w) => ({
                    key: w,
                    label: w,
                  }))}
                  active={warehouseFilter}
                  onChange={(k) => setWarehouseFilter(k)}
                />
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

          <SortableTable
            columns={[
              {
                key: "saleNumber",
                header: "Sale",
                sortable: true,
                render: (v, row) => (
                  <div>
                    <div className="font-mono text-xs">#{v}</div>
                    <div className="text-[10px] text-muted-foreground">Inv {row.invoiceNumber}</div>
                  </div>
                ),
              },
              {
                key: "createdAt",
                header: "Date",
                sortable: true,
                className: "text-muted-foreground",
                render: (v) => new Date(v).toLocaleDateString(),
              },
              {
                key: "customerName",
                header: "Customer",
                sortable: true,
                render: (v, row) => (
                  <div>
                    {v || "Walk-in"}
                    {row.customerPhone && (
                      <div className="text-xs text-muted-foreground">{row.customerPhone}</div>
                    )}
                  </div>
                ),
              },
              {
                key: "paymentMethods",
                header: "Payment",
                sortable: true,
                className: "capitalize text-muted-foreground",
                render: (v) => v.join(" + ") || "—",
              },
              {
                key: "cashierName",
                header: "Cashier",
                sortable: true,
                className: "text-muted-foreground",
                render: (v) => v || "—",
              },
              {
                key: "warehouse",
                header: "Warehouse",
                sortable: true,
                className: "text-xs text-muted-foreground",
                render: (v) => v || "—",
              },
              {
                key: "total",
                header: "Total",
                sortable: true,
                className: "text-right font-semibold",
                render: (v) => bdt(v),
              },
              {
                key: "actions",
                header: "Actions",
                className: "text-right",
                render: (_v, row) => {
                  const open = expanded.has(row.id);
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintPosReceipt(row.sale);
                        }}
                        className="rounded border border-border bg-background px-2 py-1 text-xs hover:bg-surface"
                        title="Print receipt"
                      >
                        <Printer size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.id);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {row.itemCount > 0 ? (
                          open ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )
                        ) : null}
                      </button>
                    </div>
                  );
                },
              },
            ]}
            data={filteredSales.map((s) => ({
              id: s.id,
              saleNumber: s.saleNumber,
              invoiceNumber: s.invoiceNumber,
              createdAt: s.createdAt,
              customerName: s.customerName,
              customerPhone: s.customerPhone,
              paymentMethods: s.paymentMethods,
              cashierName: s.cashierName,
              warehouse: s.warehouse,
              total: s.total,
              itemCount: s.items.length,
              items: s.items,
              sale: s,
            }))}
            rowKey={(row) => row.id}
            expandedKeys={expanded}
            onRowClick={(row) => toggle(row.id)}
            rowClassName={(row) =>
              "cursor-pointer " + (expanded.has(row.id) ? "bg-surface" : "")
            }
            detailRow={(row) => <SaleItemsTable items={row.items} />}
            pageSize={25}
            emptyMessage="No POS sales found. Ring up a sale at the till to see it here."
          />
        </>
      )}

      {/* ── Warehouse report ──────────────────────────────────────────── */}
      {tab === "warehouse" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricCard
              icon={Banknote}
              label="POS revenue"
              value={bdt(warehouseRevenue)}
              sub={warehouseSelected ? `At ${warehouseSelected}` : "All warehouses"}
            />
            <MetricCard icon={ShoppingCart} label="POS orders" value={warehouseOrders.toString()} />
            <MetricCard
              icon={Warehouse}
              label="Warehouses"
              value={String(scopedLocation ? 1 : locations.length)}
              sub={scopedLocation ? "Scoped to your warehouse" : "Active warehouses"}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!scopedLocation ? (
              <>
                <span className="mr-1 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
                  <Warehouse size={12} /> Warehouse
                </span>
                <FilterChips
                  items={["All", ...locations.map((l) => l.name)].map((w) => ({
                    key: w,
                    label: w,
                  }))}
                  active={warehouseFilter}
                  onChange={(k) => setWarehouseFilter(k)}
                />
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
                  <MetricCard icon={Package} label="Total products" value={filteredInventory.length.toLocaleString()} />
                  <MetricCard
                    icon={Package}
                    label="Total stock"
                    value={filteredInventory.reduce((s, i) => s + i.available, 0).toLocaleString()}
                  />
                  <MetricCard
                    icon={Package}
                    label="Low stock items"
                    value={filteredInventory
                      .filter((i) => i.available > 0 && i.available <= (i.lowStockThreshold ?? 5))
                      .length.toString()}
                    sub="Below threshold"
                  />
                  <MetricCard
                    icon={XCircle}
                    label="Out of stock"
                    value={filteredInventory.filter((i) => i.available === 0).length.toString()}
                  />
                  <MetricCard
                    icon={Package}
                    label="Multi-location"
                    value={filteredInventory
                      .filter((i) => i.byLocation?.length > 1)
                      .length.toString()}
                    sub="Stocked across locations"
                  />
                  <MetricCard
                    icon={Banknote}
                    label="Total value"
                    value={bdt(filteredInventory.reduce((s, i) => s + i.costValue, 0))}
                    sub="At cost"
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

                <SortableTable
                  columns={[
                    { key: "variantName", header: "Product", sortable: true },
                    {
                      key: "sku",
                      header: "SKU",
                      sortable: true,
                      className: "font-mono text-xs text-muted-foreground",
                    },
                    {
                      key: "category",
                      header: "Category",
                      sortable: true,
                      className: "text-muted-foreground",
                      render: (v) => v || "—",
                    },
                    {
                      key: "available",
                      header: "Stock",
                      sortable: true,
                      className: "text-right",
                      render: (v, row) => (
                        <Pill
                          tone={
                            v === 0
                              ? "danger"
                              : v <= row.threshold
                                ? "warn"
                                : "success"
                          }
                        >
                          {v} units
                        </Pill>
                      ),
                    },
                    {
                      key: "costPrice",
                      header: "Cost",
                      sortable: true,
                      className: "text-right",
                      render: (v) => bdt(v),
                    },
                    {
                      key: "value",
                      header: "Value",
                      sortable: true,
                      className: "text-right font-medium",
                      render: (v) => bdt(v),
                    },
                    {
                      key: "locations",
                      header: "Locations",
                      sortable: true,
                      className: "text-xs text-muted-foreground",
                      render: (v) => v || "—",
                    },
                  ]}
                  data={filteredInventory.map((item) => ({
                    variantId: item.variantId,
                    variantName: item.variantName,
                    sku: item.sku,
                    category: item.category,
                    available: item.available,
                    threshold: item.lowStockThreshold ?? 5,
                    costPrice: item.costPrice || 0,
                    value: (item.costPrice || 0) * item.available,
                    locations:
                      item.byLocation
                        ?.map((l) => `${l.location}: ${l.available}`)
                        .join(", ") || "",
                  }))}
                  rowKey={(row) => row.variantId}
                  pageSize={25}
                  emptyMessage="No inventory data available."
                />
              </>
            );
          })()}
        </>
      )}

      {/* ── Customers report ──────────────────────────────────────────── */}
      {tab === "customers" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard icon={Users} label="Total customers" value={customers.length.toLocaleString()} />
            <MetricCard
              icon={Users}
              label="Active buyers"
              value={customers
                .filter(
                  (c) =>
                    (typeof c.totalSpent === "number" ? c.totalSpent : Number(c.totalSpent || 0)) >
                    0,
                )
                .length.toLocaleString()}
            />
            <MetricCard
              icon={Users}
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
            <MetricCard
              icon={Users}
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
              sub="Buyer average"
            />
            <MetricCard
              icon={Users}
              label="Repeat buyers"
              value={customers
                .filter(
                  (c) =>
                    (typeof c.orderCount === "number" ? c.orderCount : Number(c.orderCount || 0)) >
                    1,
                )
                .length.toLocaleString()}
            />
            <MetricCard
              icon={Users}
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

          <SortableTable
            columns={[
              { key: "name", header: "Customer", sortable: true },
              {
                key: "email",
                header: "Email",
                sortable: true,
                className: "text-xs text-muted-foreground",
              },
              {
                key: "phone",
                header: "Phone",
                sortable: true,
                className: "text-xs text-muted-foreground",
                render: (v) => v || "—",
              },
              {
                key: "orderCount",
                header: "Orders",
                sortable: true,
                className: "text-right",
                render: (v) => v || 0,
              },
              {
                key: "totalSpent",
                header: "Total spent",
                sortable: true,
                className: "text-right font-medium",
                render: (v) => bdt(v),
              },
              {
                key: "channel",
                header: "Channel",
                sortable: true,
                render: (v) => (
                  <Pill tone={v === "POS" ? "success" : "info"}>{v || "—"}</Pill>
                ),
              },
            ]}
            data={customers
              .slice()
              .sort(
                (a, b) =>
                  (typeof b.totalSpent === "number"
                    ? b.totalSpent
                    : Number(b.totalSpent || 0)) -
                  (typeof a.totalSpent === "number"
                    ? a.totalSpent
                    : Number(a.totalSpent || 0)),
              )
              .slice(0, 100)
              .map((customer: any) => ({
                id: customer.id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                orderCount: customer.orderCount || 0,
                totalSpent: Number(customer.totalSpent || 0),
                channel: customer.channel,
              }))}
            rowKey={(row) => row.id}
            defaultSortColumn="totalSpent"
            defaultSortDirection="desc"
            pageSize={25}
            emptyMessage="No customers yet."
          />
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
                <MetricCard
                  icon={Banknote}
                  label="Net revenue"
                  value={bdt(s.netRevenue)}
                  sub={`list ${bdt(s.grossRevenue)}`}
                />
                <MetricCard icon={Tag} label="Discounts" value={bdt(s.discounts)} sub="given this period" />
                <MetricCard icon={Package} label="Cost of goods" value={bdt(s.cogs)} sub="actual cost" />
                <MetricCard
                  icon={TrendingUp}
                  label="Gross profit"
                  value={bdt(s.grossProfit)}
                  sub={`${netMargin}% margin`}
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Pre-owned profit"
                  value={bdt(s.preOwnedProfit)}
                  sub="pre-owned category"
                />
                <MetricCard icon={DollarSign} label="Net profit" value={bdt(s.netProfit)} sub="+ exchange − expenses" />
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
            <MetricCard icon={Undo2} label="Total returns" value={String(reportReturns.length)} />
            <MetricCard icon={Undo2} label="Refunded" value={String(refundedReturns.length)} sub="completed" />
            <MetricCard icon={Clock} label="Open" value={String(openReturns.length)} sub="pending / processing" />
            <MetricCard icon={Banknote} label="Refund value" value={bdt(refundedValue)} sub="cash out" />
            <MetricCard
              icon={TrendingUp}
              label="Return rate"
              value={
                (summary?.salesCount ?? posSales.length)
                  ? (
                      (reportReturns.length / (summary?.salesCount ?? posSales.length)) *
                      100
                    ).toFixed(1) + "%"
                  : "0.0%"
              }
              sub="returns ÷ sales"
            />
            <MetricCard
              icon={Undo2}
              label="Exchanges"
              value={String(reportExchanges.length)}
              sub={
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

          <SortableTable
            columns={[
              {
                key: "id",
                header: "RMA",
                sortable: true,
                className: "font-mono text-xs",
                render: (v) => v.slice(0, 14),
              },
              {
                key: "createdAt",
                header: "Date",
                sortable: true,
                className: "text-xs text-muted-foreground",
                render: (v) => new Date(v).toLocaleDateString(),
              },
              {
                key: "customerName",
                header: "Customer",
                sortable: true,
                render: (v) => v || "—",
              },
              {
                key: "productName",
                header: "Product",
                sortable: true,
                render: (v) => v || "—",
              },
              { key: "qty", header: "Qty", sortable: true, className: "text-right" },
              {
                key: "status",
                header: "Status",
                sortable: true,
                render: (v) => (
                  <Pill
                    tone={
                      ["refunded", "completed"].includes((v ?? "").toLowerCase())
                        ? "success"
                        : "warn"
                    }
                  >
                    {v || "—"}
                  </Pill>
                ),
              },
              {
                key: "refundAmount",
                header: "Refund",
                sortable: true,
                className: "text-right font-medium",
                render: (v) => (v ? bdt(v) : "—"),
              },
            ]}
            data={reportReturns.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              customerName: r.customerName,
              productName: r.productName,
              qty: r.qty,
              status: r.status,
              refundAmount: r.refundAmount,
            }))}
            rowKey={(row) => row.id}
            pageSize={25}
            emptyMessage="No returns in this period."
          />
        </>
      )}

      {/* ── Staff performance report ──────────────────────────────────────── */}
      {tab === "staff" && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard icon={Users} label="Total staff" value={staff.length.toString()} />
            <MetricCard
              icon={UserCheck}
              label="Active cashiers"
              value={new Set(posSales.map((s) => s.cashierName).filter(Boolean)).size.toString()}
            />
            <MetricCard
              icon={Banknote}
              label="Staff sales"
              value={bdt(
                posSales.filter((s) => s.cashierName).reduce((s, sale) => s + sale.total, 0),
              )}
            />
            <MetricCard
              icon={Banknote}
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

          <SortableTable
            columns={[
              { key: "name", header: "Staff", sortable: true },
              {
                key: "role",
                header: "Role",
                sortable: true,
                render: (v) => (
                  <Pill tone={v === "owner" ? "success" : v === "manager" ? "info" : "muted"}>
                    {v}
                  </Pill>
                ),
              },
              { key: "sales", header: "Sales", sortable: true, className: "text-right" },
              {
                key: "revenue",
                header: "Revenue",
                sortable: true,
                className: "text-right font-medium",
                render: (v) => bdt(v),
              },
              {
                key: "avg",
                header: "Avg sale",
                sortable: true,
                className: "text-right text-muted-foreground",
                render: (v) => (v != null ? bdt(v) : "—"),
              },
            ]}
            data={staff.map((s: any) => {
              const cashierSales = posSales.filter((ps) => ps.cashierId === s.userId);
              const revenue = cashierSales.reduce((sum, sale) => sum + sale.total, 0);
              return {
                id: s.id,
                name: s.firstName + " " + s.lastName,
                role: s.role,
                sales: cashierSales.length,
                revenue,
                avg: cashierSales.length ? revenue / cashierSales.length : null,
              };
            })}
            rowKey={(row) => row.id}
            pageSize={25}
            emptyMessage="No staff records found."
          />
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
      <SortableTable
        columns={[
          { key: "name", header: "Product", sortable: true },
          { key: "qty", header: "Qty", sortable: true, className: "text-right" },
          {
            key: "price",
            header: "Price",
            sortable: true,
            className: "text-right",
            render: (v) => taka(v),
          },
          {
            key: "total",
            header: "Total",
            sortable: true,
            className: "text-right font-medium",
            render: (v) => taka(v),
          },
        ]}
        data={items.map((item) => ({
          name: item.name,
          qty: item.qty,
          price: item.price,
          total: item.price * item.qty,
        }))}
        rowKey={(row) => row.name + "-" + row.qty}
      />
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
      <SortableTable
        columns={[
          { key: "name", header: "Product", sortable: true },
          {
            key: "sku",
            header: "SKU",
            sortable: true,
            className: "font-mono text-muted-foreground",
            render: (v) => v || "—",
          },
          {
            key: "imeis",
            header: "IMEI / Serial",
            sortable: true,
            className: "font-mono text-muted-foreground",
            render: (v) => (v.length ? v.join(", ") : "—"),
          },
          { key: "qty", header: "Qty", sortable: true, className: "text-right" },
          {
            key: "unitPrice",
            header: "Unit Price",
            sortable: true,
            className: "text-right",
            render: (v) => bdt(v),
          },
          {
            key: "lineTotal",
            header: "Total",
            sortable: true,
            className: "text-right font-medium",
            render: (v) => bdt(v),
          },
        ]}
        data={items.map((item, i) => ({
          _key: i,
          name: item.name,
          sku: item.sku,
          imeis: item.imeis,
          qty: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        }))}
        rowKey={(row) => row._key}
      />
    </div>
  );
}
