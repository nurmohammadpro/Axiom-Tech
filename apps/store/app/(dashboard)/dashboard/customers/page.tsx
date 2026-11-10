"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Stat, SortableTable } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/dashboard/dashboard-shell";
import { useCustomers, useSettings } from "@/lib/hooks";
import {
  Filter,
  Download,
  FileText,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Globe,
  Store,
  RefreshCw,
  TrendingUp,
  Users,
  Star,
  Calendar,
  MapPin,
  Phone,
  Mail,
  BarChart3,
  Target,
  Award,
  Zap,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker, datePresets } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toast } from "sonner";
import { bdt } from "@/lib/utils";
import type { Customer, CustomerPurchase } from "@/lib/api";
import {
  generatePDF,
  bdtPDF,
  type StoreInfo,
  type PDFReportConfig,
} from "@/lib/pdf-utils";
import { getCustomerPurchases } from "@/lib/api";
import { FilterChips } from "@/components/ui/filter-chips";

const PAGE_SIZE = 15;

const channels = ["All", "Online", "POS", "Both"] as const;

type TabValue = "customers" | "analytics" | "segments";
const spendingTiers = [
  { label: "All Customers", min: 0 },
  { label: "Low Spenders (< 5k)", min: 0, max: 5000 },
  { label: "Regular (5k - 25k)", min: 5000, max: 25000 },
  { label: "High Value (25k - 75k)", min: 25000, max: 75000 },
  { label: "VIP (75k+)", min: 75000 },
] as const;

function channelPill(ch: string) {
  if (ch === "Both")
    return (
      <Pill tone="info">
        <span className="flex items-center gap-1">
          <RefreshCw size={10} /> Both
        </span>
      </Pill>
    );
  if (ch === "Online")
    return (
      <Pill tone="info">
        <span className="flex items-center gap-1">
          <Globe size={10} /> Online
        </span>
      </Pill>
    );
  return (
    <Pill tone="warn">
      <span className="flex items-center gap-1">
        <Store size={10} /> POS
      </span>
    </Pill>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("All");
  const [page, setPage] = useState(1);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<CustomerPurchase[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const { data: settings } = useSettings();
  const { data: customers = [], isLoading } = useCustomers(search || undefined, channel);

  const storeInfo: StoreInfo = useMemo(() => {
    const si = settings?.store_info;
    if (si && typeof si === "object") {
      return {
        name: si.name || "Your Shop",
        address: si.address || "",
        phone: si.phone || "",
        email: si.email || "",
        tagline: si.tagline || "",
      };
    }
    return {
      name: "Your Shop",
      address: "123 Market Street, Dhaka",
      phone: "",
      email: "",
      tagline: "iPhone, Samsung, Pixel, MacBook & accessories on sale",
    };
  }, [settings]);

  // Stats
  const totalCustomers = customers.length;
  const onlineCount = customers.filter(
    (c) => c.channel === "Online" || c.channel === "Both",
  ).length;
  const posCount = customers.filter((c) => c.channel === "POS" || c.channel === "Both").length;
  // Ensure totalSpent is treated as a number — sometimes API returns it as a string,
  // which makes `+` perform string concatenation (0 + "75000" => "075000"). Coerce
  // to Number to avoid malformed totals.
  const totalRevenue = customers.reduce((s, c) => s + Number(c.totalSpent || 0), 0);
  const avgSpend = totalCustomers > 0 ? Math.round(totalRevenue / totalCustomers) : 0;

  // Pagination
  const totalPages = Math.ceil(customers.length / PAGE_SIZE);
  const paginated = useMemo(
    () => customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [customers, page],
  );

  // View purchase history
  const handleViewPurchases = useCallback(async (customer: Customer) => {
    setViewCustomer(customer);
    setLoadingPurchases(true);
    try {
      const data = await getCustomerPurchases({
        customerId: customer.id,
        phone: customer.phone || undefined,
        email: customer.email || undefined,
      });
      setPurchases(data);
    } catch (e) {
      toast.error("Failed to load purchase history");
      setPurchases([]);
    } finally {
      setLoadingPurchases(false);
    }
  }, []);

  // Generate invoice PDF for a single purchase
  const generateInvoicePDF = useCallback(
    (purchase: CustomerPurchase) => {
      const customer = viewCustomer;
      const invNumber = purchase.invoiceNumber || `INV-${purchase.id.slice(0, 12).toUpperCase()}`;

      generatePDF({
        title: "INVOICE",
        storeInfo,
        kpis: [
          { label: "Invoice No", value: invNumber.slice(0, 16) },
          { label: "Date", value: new Date(purchase.date).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" }) },
          { label: "Channel", value: purchase.channel },
          { label: "Items", value: String(purchase.items.length) },
        ],
        details: {
          left: {
            title: "Sold To",
            rows: [
              { label: "Name", value: customer ? `${customer.firstName} ${customer.lastName || ""}`.trim() : "Guest", bold: true },
              { label: "Phone", value: customer?.phone || "—" },
              { label: "Email", value: customer?.email || "—" },
            ],
          },
          right: {
            title: "Other Details",
            rows: [
              { label: "Channel", value: purchase.channel },
              { label: "Payment", value: purchase.paymentMethod || (purchase.channel === "POS" ? "Cash" : "Online") },
              { label: "Total", value: bdtPDF(purchase.total) },
            ],
          },
        },
        columns: [
          { header: "#", key: "sl", width: 10, align: "center" },
          { header: "Product", key: "name" },
          { header: "Qty", key: "qty", width: 14, align: "center" },
          { header: "Unit Price", key: "price", width: 28, align: "right" },
          { header: "Discount", key: "discount", width: 28, align: "right" },
          { header: "Total", key: "total", width: 28, align: "right" },
        ],
        rows: purchase.items.map((item, i) => ({
          sl: String(i + 1),
          name: item.name,
          qty: String(item.qty),
          price: bdtPDF(item.price),
          discount: item.discountAmount ? bdtPDF(item.discountAmount) : "—",
          total: bdtPDF(item.lineTotal ?? item.price * item.qty),
        })),
        grandTotal: { label: "Grand Total", value: bdtPDF(purchase.total) },
        signatures: { left: "Customer Signature", right: "Authorized Signature" },
        terms: [
          "Goods once sold will not be refunded or changed.",
          "Products under warranty will be repaired or replaced by the manufacturer.",
          "Please keep the full box and invoice for warranty claims.",
        ],
      });
    },
    [storeInfo, viewCustomer],
  );

  // Export all customers to CSV
  const exportCSV = useCallback(() => {
    if (customers.length === 0) {
      toast.error("No customers to export");
      return;
    }
    const headers = [
      "SL",
      "Name",
      "Mobile",
      "Email",
      "Channel",
      "Total Items",
      "Total Amount",
      "Average Spent",
      "Joined",
    ];
    const rows = customers.map((c, i) => [
      String(i + 1),
      `${c.firstName} ${c.lastName || ""}`.trim(),
      c.phone || "",
      c.email || "",
      c.channel,
      String(c.totalItems),
      String(c.totalSpent),
      c.orderCount > 0 ? String(Math.round(c.totalSpent / c.orderCount)) : "0",
      new Date(c.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }, [customers]);

  // Export all customers to PDF
  const exportPDF = useCallback(() => {
    if (customers.length === 0) {
      toast.error("No customers to export");
      return;
    }

    generatePDF({
      title: "Sales Summary Report",
      storeInfo,
      kpis: [
        { label: "Total Revenue", value: bdtPDF(totalRevenue) },
        { label: "Avg. Spend", value: totalCustomers > 0 ? bdtPDF(Math.round(totalRevenue / totalCustomers)) : "—" },
        { label: "Total Customers", value: String(totalCustomers) },
        { label: "Channel Split", value: `Online ${onlineCount}  POS ${posCount}` },
      ],
      columns: [
        { header: "#", key: "sl", width: 8, align: "center" },
        { header: "Customer", key: "name" },
        { header: "Channel", key: "channel", width: 18 },
        { header: "Orders", key: "orders", width: 14, align: "center" },
        { header: "Contact", key: "contact" },
        { header: "Total Spent", key: "total", width: 26, align: "right" },
        { header: "Avg / Order", key: "avg", width: 26, align: "right" },
      ],
      rows: customers.map((c, i) => ({
        sl: String(i + 1),
        name: `${c.firstName} ${c.lastName || ""}`.trim() || "Guest",
        channel: c.channel,
        orders: String(c.orderCount),
        contact: c.phone || c.email || "—",
        total: bdtPDF(Number(c.totalSpent)),
        avg: c.orderCount > 0 ? bdtPDF(Math.round(Number(c.totalSpent) / c.orderCount)) : "—",
      })),
      grandTotal: { label: "Grand Total Revenue", value: bdtPDF(totalRevenue) },
    });

    toast.success("PDF exported");
  }, [customers, totalCustomers, onlineCount, posCount, totalRevenue, storeInfo]);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Total Customers" value={String(totalCustomers)} />
        <Stat label="Online" value={String(onlineCount)} hint="From storefront orders" />
        <Stat label="POS" value={String(posCount)} hint="Walk-in / in-store" />
        <Stat label="Avg Spend" value={bdt(avgSpend)} hint={`Total ${bdt(totalRevenue)}`} />
      </div>

      {/* Filters & Actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            placeholder="Search name, email, phone, or NID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            label="Search Customers"
            description="search by name, email, phone, or NID number"
          />
          <span className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
            <Filter size={12} /> Channel
          </span>
          <FilterChips
            items={channels.map((ch) => ({ key: ch, label: ch }))}
            active={channel}
            onChange={(k) => {
              setChannel(k);
              setPage(1);
            }}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="surface" size="sm" onClick={exportCSV} disabled={customers.length === 0}>
            <Download size={13} /> CSV
          </Button>
          <Button variant="surface" size="sm" onClick={exportPDF} disabled={customers.length === 0}>
            <FileText size={13} /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading customers…</div>
      ) : customers.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No customers found.</div>
      ) : (
        <>
          <div className="mt-3">
            <SortableTable
              data={paginated}
              rowKey={(c) => c.id}
              pageSize={25}
              defaultSortColumn="totalSpent"
              defaultSortDirection="desc"
              emptyMessage="No customers found."
              columns={[
                {
                  key: "sl",
                  header: "SL",
                  sortable: false,
                  className: "text-xs text-muted-foreground",
                  render: (_val, _row, idx) => (page - 1) * PAGE_SIZE + idx + 1,
                },
                {
                  key: "firstName",
                  header: "Name",
                  sortable: true,
                  render: (_val, c) => (
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-medium">
                        {c.firstName?.[0]}
                        {c.lastName?.[0] || ""}
                      </div>
                      <div className="font-medium">
                        {c.firstName} {c.lastName || ""}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "phone",
                  header: "Mobile",
                  sortable: true,
                  className: "text-muted-foreground",
                  render: (_val, c) => c.phone || "—",
                },
                {
                  key: "email",
                  header: "Email",
                  sortable: true,
                  className: "text-muted-foreground",
                  render: (_val, c) => c.email || "—",
                },
                {
                  key: "channel",
                  header: "Channel",
                  sortable: true,
                  render: (_val, c) => channelPill(c.channel),
                },
                {
                  key: "totalItems",
                  header: "Items",
                  sortable: true,
                  className: "text-center",
                  render: (_val, c) => c.totalItems,
                },
                {
                  key: "totalSpent",
                  header: "Total Amount",
                  sortable: true,
                  className: "font-semibold",
                  render: (_val, c) => bdt(c.totalSpent),
                },
                {
                  key: "avgSpent",
                  header: "Avg Spent",
                  sortable: false,
                  className: "text-muted-foreground",
                  render: (_val, c) =>
                    c.orderCount > 0
                      ? bdt(Math.round(Number(c.totalSpent) / c.orderCount))
                      : "—",
                },
                {
                  key: "actions",
                  header: "",
                  sortable: false,
                  className: "text-right",
                  render: (_val, c) => (
                    <button
                      onClick={() => void handleViewPurchases(c)}
                      className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                      title="View purchases"
                    >
                      <Eye size={12} />
                    </button>
                  ),
                },
              ]}
            />
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, customers.length)}{" "}
                of {customers.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border border-border p-1 hover:bg-surface disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("ellipsis");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "ellipsis" ? (
                      <span key={`e${i}`} className="px-1">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={
                          "border px-2 py-1 text-xs transition-colors " +
                          (page === p
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:text-foreground")
                        }
                      >
                        {p}
                      </button>
                    ),
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="border border-border p-1 hover:bg-surface disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Purchase History Modal */}
      {viewCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setViewCustomer(null)}
        >
          <div
            className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
              <div>
                <div className="font-semibold">
                  {viewCustomer.firstName} {viewCustomer.lastName || ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  {viewCustomer.phone || ""} {viewCustomer.phone && viewCustomer.email ? "· " : ""}
                  {viewCustomer.email || ""} · {viewCustomer.channel}
                </div>
              </div>
              <button
                onClick={() => setViewCustomer(null)}
                className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3 border-b border-border px-5 py-3">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Purchases</div>
                <div className="text-lg font-semibold">{viewCustomer.orderCount}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Total Spent</div>
                <div className="text-lg font-semibold">{bdt(Number(viewCustomer.totalSpent))}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Avg / Visit</div>
                <div className="text-lg font-semibold">
                  {viewCustomer.orderCount > 0
                    ? bdt(Math.round(viewCustomer.totalSpent / viewCustomer.orderCount))
                    : "—"}
                </div>
              </div>
            </div>

            {/* Purchases List */}
            <div className="px-5 py-3">
              {loadingPurchases ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading purchases…
                </div>
              ) : purchases.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No purchases found.
                </div>
              ) : (
                <div className="space-y-3">
                  {purchases.map((p) => (
                    <div key={p.id} className="border border-border bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ShoppingCart size={14} className="text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">#{p.id.slice(0, 12)}</span>
                              <Pill tone={p.channel === "POS" ? "warn" : "info"}>{p.channel}</Pill>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(p.date).toLocaleDateString("en-BD", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                              {" · "}
                              {p.items.length} item
                              {p.items.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{bdt(p.total)}</span>
                          <button
                            onClick={() => generateInvoicePDF(p)}
                            className="flex items-center gap-1 border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                            title="Download invoice PDF"
                          >
                            <FileText size={11} /> Invoice
                          </button>
                        </div>
                      </div>

                      {/* Inline items */}
                      <div className="mt-2 ml-7">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="pb-1 font-medium">Product</th>
                              <th className="pb-1 text-right font-medium">Qty</th>
                              <th className="pb-1 text-right font-medium">Price</th>
                              <th className="pb-1 text-right font-medium">Discount</th>
                              <th className="pb-1 text-right font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.items.map((item, i) => (
                              <tr key={i} className="border-t border-border/50">
                                <td className="py-1">{item.name}</td>
                                <td className="py-1 text-right">{item.qty}</td>
                                <td className="py-1 text-right">{bdt(item.price)}</td>
                                <td className="py-1 text-right">
                                  {item.discountAmount ? bdt(item.discountAmount) : "—"}
                                </td>
                                <td className="py-1 text-right">
                                  {bdt(item.lineTotal ?? item.price * item.qty)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
