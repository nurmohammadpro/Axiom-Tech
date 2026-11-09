"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Table, Pill, Stat, Card } from "@/components/dashboard/dashboard-shell";
import { SearchInput } from "@/components/ui/search-input";
import { useDashboardOrders, useLocations, useSessionScope } from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import {
  Filter,
  Search,
  Eye,
  Trash2,
  Download,
  Printer,
  Camera,
  X,
  CheckCircle2,
  XCircle,
  User,
  Phone,
  MapPin,
  CreditCard,
  Package,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks";
import { generatePDF, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { BrowserMultiFormatReader } from "@zxing/library";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statuses = [
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

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "payment confirmed", label: "Payment Confirmed" },
  { value: "sent to courier", label: "Sent to Courier" },
  { value: "completed", label: "Completed" },
  { value: "returned", label: "Returned" },
];

function fmtTotal(o: { channel?: string; total?: number }): string {
  return bdtPDF(o.total ?? 0);
}

/** Local-time YYYY-MM-DD for the API's date window. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

interface VerifiedInvoice {
  verified: true;
  id?: string;
  invoiceNumber: string;
  saleNumber: string;
  barcodeValue?: string;
  createdAt: string;
  customer?: { name: string; phone?: string; email?: string };
  items: Array<{
    id: number;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    discountAmount: number;
    imei1?: string;
    imei2?: string;
    serialNumber?: string;
  }>;
  payments: Array<{ method: string; amount: number; reference?: string }>;
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
    paid: number;
    change: number;
  };
  storeInfo: { location: string; cashierId: string; channel: string };
  status: string;
}

export default function Orders() {
  const [filter, setFilter] = useState("All");
  const [warehouse, setWarehouse] = useState("All");
  const [search, setSearch] = useState("");
  const { data: locations = [] } = useLocations();
  const { data: me } = useSessionScope();
  const scopedLocation = me?.isScoped ? (me.storeLocation ?? null) : null;
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ id: string; status: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedPayment, setExpandedPayment] = useState<string | null>(null);
  const { data: settings } = useSettings();

  // Invoice lookup state (unified with search)
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<VerifiedInvoice | null>(null);
  const [viewingOrder, setViewingOrder] = useState<VerifiedInvoice | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  const storeInfo: StoreInfo = useMemo(() => {
    const si = settings?.store_info;
    if (si && typeof si === "object") {
      return {
        name: si.name || "Your Shop",
        address: si.address || "",
        phone: si.phone || "",
        email: si.email || "",
        website: si.website || "",
        logo: si.logo || "",
        tagline: si.tagline || "",
      };
    }
    return {
      name: "Your Shop",
      address: "123 Market Street, Dhaka",
      phone: "",
      email: "",
      website: "",
      logo: "",
      tagline: "iPhone, Samsung, Pixel, MacBook & accessories on sale",
    };
  }, [settings]);

  const params: Record<string, string> = { page: String(page), pageSize: "50" };
  if (filter !== "All") params.status = filter.toLowerCase();
  if (!scopedLocation && warehouse !== "All") params.warehouse = warehouse;
  if (search.trim()) params.search = search.trim();
  if (dateRange?.from) params.from = ymd(dateRange.from);
  if (dateRange?.to) params.to = ymd(dateRange.to);

  const { data: ordersData } = useDashboardOrders(params);
  const orders = ordersData?.orders ?? [];
  const summary = ordersData?.summary;
  const total = ordersData?.total ?? 0;
  const pageSize = ordersData?.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // The API applies status/warehouse/search/date filters server-side.
  const displayOrders = orders;

  // Any filter change starts the list over at page 1.
  useEffect(() => {
    setPage(1);
  }, [filter, warehouse, search, dateRange, scopedLocation]);

  // Cards are GLOBAL for the current warehouse + date window — independent of
  // the status filter, so they no longer collapse to 0 when you filter.
  const pendingCount = summary?.pending ?? 0;
  const confirmedCount = summary?.confirmed ?? 0;
  const paymentConfirmedCount = summary?.paymentConfirmed ?? 0;
  const sentToCourierCount = summary?.sentToCourier ?? 0;
  const completedCount = summary?.completed ?? 0;
  const returnedCount = summary?.returned ?? 0;
  const posCount = summary?.pos ?? 0;

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (barcodeReaderRef.current) barcodeReaderRef.current.reset();
    };
  }, []);

  const handleLookup = async () => {
    if (!search.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      let res = await fetch(`/api/sales/verify/${encodeURIComponent(search.trim())}`);
      if (res.ok) {
        const saleResult = await res.json();
        setLookupResult(saleResult);
        setViewingOrder(saleResult);
      } else {
        res = await fetch(`/api/orders/${encodeURIComponent(search.trim())}`);
        if (res.ok) {
          const order = await res.json();
          const result: VerifiedInvoice = {
            verified: true,
            id: order.id,
            invoiceNumber: order.invoiceNumber || order.saleNumber || order.id,
            saleNumber: order.saleNumber || order.invoiceNumber || order.id,
            createdAt: order.createdAt,
            customer: order.customerName
              ? {
                  name: order.customerName,
                  phone: order.customerPhone || undefined,
                  email: order.customerEmail || undefined,
                }
              : undefined,
            items: (order.items || []).map((item: any, idx: number) => ({
              id: item.id || idx,
              // The orders API returns name/price/qty (order_items rows and the
              // POS branch both use this shape); sales/verify uses productName/
              // unitPrice/quantity. Read either.
              productName: item.productName || item.name || "Unknown Product",
              variantName: item.variantName || "",
              sku: item.sku || "",
              quantity: item.quantity || item.qty || 1,
              unitPrice: item.unitPrice || item.price || 0,
              totalPrice: item.totalPrice || item.price * item.qty || 0,
              discountAmount: item.discountAmount || 0,
              imei1: item.imei1 || undefined,
              imei2: item.imei2 || undefined,
              serialNumber: item.serialNumber || undefined,
            })),
            payments: order.paymentMethod
              ? [{ method: order.paymentMethod, amount: order.total || 0 }]
              : [],
            totals: {
              subtotal: order.subtotal || 0,
              discount: order.discountAmount || 0,
              tax: order.tax || 0,
              grandTotal: order.total || 0,
              paid: order.paidAmount || order.total || 0,
              change: 0,
            },
            storeInfo: {
              location: order.warehouse || "Online",
              cashierId: "Online",
              channel: order.channel || "online",
            },
            status: order.status || "unknown",
          };
          setLookupResult(result);
          setViewingOrder(result);
        } else {
          setLookupError("Invoice or order not found");
        }
      }
    } catch {
      setLookupError("Network error — please try again");
    } finally {
      setLookupLoading(false);
    }
  };

  const startScanning = async () => {
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      barcodeReaderRef.current = reader;
      const devices = await reader.listVideoInputDevices();
      if (devices.length === 0) {
        setScanning(false);
        return;
      }
      await reader.decodeFromVideoDevice(devices[0].deviceId, videoRef.current!, (result) => {
        if (result) {
          setSearch(result.getText());
          setScanning(false);
          reader.reset();
          setTimeout(() => handleLookup(), 100);
        }
      });
    } catch {
      setScanning(false);
    }
  };

  const stopScanning = () => {
    if (barcodeReaderRef.current) {
      barcodeReaderRef.current.reset();
      barcodeReaderRef.current = null;
    }
    setScanning(false);
  };

  const handleStatusSelect = (orderId: string, newStatus: string) => {
    if (newStatus === "returned") {
      setStatusTarget({ id: orderId, status: newStatus });
    } else {
      void handleStatusChange(orderId, newStatus);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setStatusUpdating(orderId);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update status");
      }
      toast.success(`Status updated to ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["dashboard", "orders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleDelete = (orderId: string) => setDeleteTarget(orderId);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/orders/${deleteTarget}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete order");
      }
      toast.success("Order deleted");
      qc.invalidateQueries({ queryKey: ["dashboard", "orders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handlePrintInvoice = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}`);
      if (!response.ok) throw new Error("Failed to fetch order details");
      const order = await response.json();
      if (!order) throw new Error("Order not found");
      const ref =
        order.barcodeValue || order.saleNumber || order.invoiceNumber || order.id || "UNKNOWN";
      const si = settings?.store_info ?? {};
      const policies = (si.receiptPolicies || "")
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);
      printReceipt({
        invoiceNumber: order.invoiceNumber || order.saleNumber || order.id || "UNKNOWN",
        date: order.createdAt ? new Date(order.createdAt) : new Date(),
        barcodeNumber: ref,
        storeInfo,
        customer: {
          name: order.customerName || "Guest",
          phone: order.customerPhone || undefined,
          address: order.shippingAddress
            ? Object.values(order.shippingAddress).filter(Boolean).join(", ")
            : undefined,
        },
        items: (order.items || []).map((item: any, idx: number) => ({
          sl: idx + 1,
          description: `${item.productName || item.name || "Product"}${item.variantName ? ` (${item.variantName})` : ""}`,
          unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
          qty: Number(item.quantity) || Number(item.qty) || 1,
          total: Number(item.totalPrice) || 0,
          imei1: item.imei1 || undefined,
          imei2: item.imei2 || undefined,
          serialNumber: item.serialNumber || undefined,
          discountAmount: Number(item.discountAmount) || 0,
          categorySlug: item.categorySlug ?? undefined,
        })),
        totals: {
          subtotal: Number(order.subtotal) || 0,
          discount: Number(order.discountAmount) > 0 ? Number(order.discountAmount) : undefined,
          tax: Number(order.tax) || 0,
          grandTotal: Number(order.total) || 0,
          paid: Number(order.paidAmount) || Number(order.total) || 0,
          change: 0,
        },
        payments: order.paymentMethod
          ? [
              {
                method: order.paymentMethod,
                amount: Number(order.paidAmount) || Number(order.total) || 0,
              },
            ]
          : [],
        policies,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate invoice");
    }
  };

  const exportToCSV = () => {
    if (displayOrders.length === 0) {
      toast.error("No orders to export");
      return;
    }
    const headers = [
      "Order ID",
      "Customer",
      "Status",
      "Channel",
      "Warehouse",
      "Payment",
      "Total",
      "Date",
    ];
    const rows = displayOrders.map((o) => [
      o.id,
      o.customerName,
      o.status,
      o.channel,
      o.warehouse || "",
      o.paymentMethod || "",
      o.total.toString(),
      new Date(o.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join(
      "\n",
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const exportToPDF = () => {
    if (displayOrders.length === 0) {
      toast.error("No orders to export");
      return;
    }
    generatePDF({
      title: "Orders Report",
      subtitle: filter !== "All" ? `Filtered by status: ${filter}` : undefined,
      storeInfo,
      kpis: [
        { label: "Total Orders", value: String(displayOrders.length) },
        { label: "POS Orders", value: String(posCount) },
        { label: "Returned", value: String(returnedCount) },
        {
          label: "Generated",
          value: new Date().toLocaleDateString("en-BD", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        },
      ],
      columns: [
        { header: "#", key: "id", width: 22 },
        { header: "Customer", key: "customer" },
        { header: "Status", key: "status", width: 22 },
        { header: "Channel", key: "channel", width: 18 },
        { header: "Warehouse", key: "warehouse", width: 20 },
        { header: "Payment", key: "payment", width: 18 },
        { header: "Total", key: "total", width: 24, align: "right" },
        { header: "Date", key: "date", width: 20 },
      ],
      rows: displayOrders.map((o) => ({
        id: o.id.slice(0, 10),
        customer: o.customerName || "—",
        status: o.status,
        channel: o.channel,
        warehouse: o.warehouse || "—",
        payment: o.paymentMethod || "—",
        total: fmtTotal(o),
        date: new Date(o.createdAt).toLocaleDateString(),
      })),
    });
    toast.success("PDF exported");
  };

  const rows = displayOrders.map((o) => {
    const payments: { method: string; amount: number; reference: string | null }[] = (o as any)
      .payments || [{ method: o.paymentMethod, amount: o.total, reference: null }];
    const isExpanded = expandedPayment === o.id;
    return [
      <input
        key="sel"
        type="checkbox"
        checked={selected.has(o.id)}
        onChange={(e) => {
          setSelected((prev) => {
            const n = new Set(prev);
            if (e.target.checked) n.add(o.id);
            else n.delete(o.id);
            return n;
          });
        }}
        className="h-3.5 w-3.5"
        onClick={(e) => e.stopPropagation()}
      />,
      <span key="i" className="font-mono text-xs">
        #{o.id.slice(0, 8)}
      </span>,
      <span key="c" className="truncate max-w-[120px]">
        {o.customerName}
      </span>,
      <span key="ph" className="font-mono text-xs flex items-center gap-1">
        <Phone size={10} className="text-muted-foreground" />
        {o.customerPhone || "—"}
      </span>,
      <Pill key="s" tone={statusTone(o.status)}>
        {o.status}
      </Pill>,
      <span key="ch">{o.channel}</span>,
      o.warehouse || "—",
      <div key="pay" className="min-w-[140px]">
        <button
          onClick={() => setExpandedPayment(isExpanded ? null : o.id)}
          className="flex flex-wrap items-center gap-1 text-left"
          title={payments.length > 1 ? "Click to expand split payment" : undefined}
        >
          <Pill tone="muted">{payments[0]?.method || o.paymentMethod}</Pill>
          {payments.length > 1 && (
            <span className="inline-flex items-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium leading-none text-background">
              +{payments.length - 1}
            </span>
          )}
          {payments.length > 1 &&
            (isExpanded ? (
              <ChevronUp size={12} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={12} className="text-muted-foreground" />
            ))}
        </button>
        {isExpanded && payments.length > 1 && (
          <div className="mt-1 rounded border border-border bg-surface p-1.5 text-[11px] space-y-1">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">{p.method}</span>
                <span className="font-mono">{bdt(p.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-1 font-semibold">
              <span>Total</span>
              <span className="font-mono">{fmtTotal(o)}</span>
            </div>
          </div>
        )}
      </div>,
      <span key="t" className="font-mono text-xs">
        {fmtTotal(o)}
      </span>,
      <span key="d" className="text-muted-foreground">
        {new Date(o.createdAt).toLocaleDateString()}
      </span>,
      <div key="actions" className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="surface" size="icon" className="h-7 w-7 text-muted-foreground">
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/orders/${o.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handlePrintInvoice(o.id)}>
              <Printer className="mr-2 h-4 w-4" />
              Print Invoice
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={o.status}
              onValueChange={(v) => handleStatusSelect(o.id, v)}
            >
              {statusOptions.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleDelete(o.id)}
              className="text-sale focus:text-sale"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>,
    ];
  });

  return (
    <>
      {/* Unified Search — phone, customer, invoice, barcode, IMEI, order ID */}
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleLookup()}
        placeholder="Search by customer, phone, invoice #, barcode, IMEI, or order ID… (/)"
        label="Search Orders"
        description="customer • phone • invoice • barcode • IMEI • order ID — press Enter or Verify to lookup exact barcode"
        actions={
          <>
            {!scanning ? (
              <Button
                onClick={startScanning}
                variant="outline"
                size="sm"
                title="Scan barcode / IMEI"
              >
                <Camera size={14} />
              </Button>
            ) : (
              <Button onClick={stopScanning} variant="destructive" size="sm">
                <X size={14} />
              </Button>
            )}
            <Button onClick={handleLookup} disabled={lookupLoading || !search.trim()} size="sm">
              {lookupLoading ? "Searching..." : "Verify"}
            </Button>
          </>
        }
      />
      {(scanning || lookupError || lookupResult) && (
        <Card className="p-4">
          {scanning && (
            <div className="mt-3 relative">
              <video
                ref={videoRef}
                className="w-full h-40 object-cover rounded border border-border"
                muted
                playsInline
              />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded text-xs">
                Align barcode within frame
              </div>
            </div>
          )}
          {lookupError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <XCircle size={14} /> {lookupError}
            </div>
          )}
          {lookupResult && (
            <div className="mt-3 border border-border rounded p-4">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">Verified Invoice</div>
                    <div className="text-xs text-muted-foreground">
                      {lookupResult.invoiceNumber} ·{" "}
                      {new Date(lookupResult.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <Pill tone="success">Valid</Pill>
              </div>
              {lookupResult.customer && (
                <div className="mb-3 flex gap-4 text-sm">
                  {lookupResult.customer.name && (
                    <span className="flex items-center gap-1">
                      <User size={12} className="text-muted-foreground" />
                      {lookupResult.customer.name}
                    </span>
                  )}
                  {lookupResult.customer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={12} className="text-muted-foreground" />
                      {lookupResult.customer.phone}
                    </span>
                  )}
                </div>
              )}
              <div className="border border-border rounded divide-y divide-border mb-3">
                {lookupResult.items.map((item, idx) => (
                  <div key={item.id} className="p-2 flex justify-between text-sm">
                    <div>
                      <span className="text-muted-foreground mr-1">#{idx + 1}</span>
                      {item.productName}
                      {item.variantName ? ` · ${item.variantName}` : ""}
                    </div>
                    <div className="text-right">
                      <div>{bdt(item.totalPrice)}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity} × {bdt(item.unitPrice)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-surface border border-border rounded p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{bdt(lookupResult.totals.subtotal)}</span>
                </div>
                {lookupResult.totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span>-{bdt(lookupResult.totals.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold pt-1 border-t border-border/50">
                  <span>Grand Total</span>
                  <span>{bdt(lookupResult.totals.grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Paid ({lookupResult.payments[0]?.method || "Cash"})
                  </span>
                  <span>{bdt(lookupResult.totals.paid)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Stats — global for the current warehouse + date window (not the status filter) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pending" value={pendingCount.toString()} hint="Awaiting confirmation" />
        <Stat label="Confirmed" value={confirmedCount.toString()} hint="Ready to process" />
        <Stat
          label="Payment Confirmed"
          value={paymentConfirmedCount.toString()}
          hint="Paid orders"
        />
        <Stat label="Sent to courier" value={sentToCourierCount.toString()} hint="In transit" />
        <Stat label="Completed" value={completedCount.toString()} hint="Fulfilled orders" />
        <Stat label="Returned" value={returnedCount.toString()} hint="Returned orders" />
      </div>

      <div className="mt-3 text-sm text-muted-foreground">
        {summary?.total ?? displayOrders.length} order
        {(summary?.total ?? displayOrders.length) !== 1 ? "s" : ""} total
        {summary ? ` · ${summary.pos} POS · ${summary.online} online` : ""}
        {summary && displayOrders.length !== summary.total
          ? ` · ${displayOrders.length} shown`
          : ""}
        {dateRange?.from || dateRange?.to || search || filter !== "All" ? " · filtered" : ""}
      </div>

      <div className="my-3 flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!scopedLocation ? (
          <Select value={warehouse} onValueChange={setWarehouse}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Warehouses</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.name}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground">
            Warehouse: <span className="font-medium text-foreground">{scopedLocation}</span>
          </span>
        )}

        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          className="h-8 w-[260px] text-xs"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="surface"
            size="sm"
            onClick={exportToCSV}
            disabled={displayOrders.length === 0 || exporting}
            className="h-8"
          >
            <Download size={13} /> Export CSV
          </Button>
          <Button
            variant="surface"
            size="sm"
            onClick={exportToPDF}
            disabled={displayOrders.length === 0 || exporting}
            className="h-8"
          >
            <Download size={13} /> Export PDF
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="my-2 flex flex-wrap items-center gap-2 border border-border bg-surface px-3 py-2 text-xs">
          <span className="font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              for (const id of Array.from(selected)) await handleStatusChange(id, "completed");
              setSelected(new Set());
            }}
          >
            Mark Completed
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              for (const id of Array.from(selected)) handlePrintInvoice(id);
              setSelected(new Set());
            }}
          >
            Print Invoices
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="my-2 flex flex-wrap items-center gap-2">
        {selected.size > 0 && (
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.size === displayOrders.length && displayOrders.length > 0}
              onChange={(e) => {
                if (e.target.checked) setSelected(new Set(displayOrders.map((o) => o.id)));
                else setSelected(new Set());
              }}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs text-muted-foreground">Select all {displayOrders.length}</span>
          </span>
        )}
      </div>

      <Table
        columns={[
          "",
          "Order",
          "Customer",
          "Phone",
          "Status",
          "Channel",
          "Warehouse",
          "Payment",
          "Total",
          "Date",
          "Actions",
        ]}
        rows={rows}
        sortData={displayOrders}
        sortKeys={[
          null,
          null,
          "customerName",
          "customerPhone",
          "status",
          "channel",
          "warehouse",
          "paymentMethod",
          "total",
          "createdAt",
          null,
        ]}
      />

      {/* Pagination */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total === 0
            ? "No orders"
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="surface"
            size="sm"
            className="h-7"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={13} /> Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            variant="surface"
            size="sm"
            className="h-7"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight size={13} />
          </Button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete order"
          description={`Delete order #${deleteTarget.slice(0, 8)}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      )}

      {statusTarget && (
        <ConfirmDialog
          open={!!statusTarget}
          onOpenChange={(open) => !open && setStatusTarget(null)}
          title="Return order"
          description={`Move order #${statusTarget.id.slice(0, 8)} to Returned? Its items will be restored to stock.`}
          confirmLabel="Return order"
          onConfirm={() => {
            if (statusTarget) void handleStatusChange(statusTarget.id, statusTarget.status);
            setStatusTarget(null);
          }}
        />
      )}

      {viewingOrder && (
        <OrderDetailModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
          onPrint={() => {
            if (viewingOrder.id) handlePrintInvoice(viewingOrder.id);
          }}
        />
      )}
    </>
  );
}

// ===========================================================================
// Order Detail Modal (opened by the Quick Invoice Lookup)
// ===========================================================================

function OrderDetailModal({
  order,
  onClose,
  onPrint,
}: {
  order: VerifiedInvoice;
  onClose: () => void;
  onPrint?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Order Details</div>
          <div className="flex items-center gap-1">
            {onPrint && (
              <Button variant="ghost" size="icon" title="Print invoice" onClick={onPrint}>
                <Printer size={16} />
              </Button>
            )}
            <Button variant="ghost" size="icon" title="Close" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="mb-4 rounded bg-muted p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{order.customer?.name || "Guest"}</div>
              {order.customer?.phone && (
                <div className="text-xs text-muted-foreground">{order.customer.phone}</div>
              )}
              {order.customer?.email && (
                <div className="text-xs text-muted-foreground">{order.customer.email}</div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString("en-BD", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div className="text-right">
              <Pill tone={statusTone(order.status)}>{order.status}</Pill>
              <div className="mt-1 text-xs text-muted-foreground">{order.invoiceNumber}</div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            Items
          </label>
          <div className="divide-y divide-border rounded border border-border">
            {order.items.map((item, idx) => (
              <div key={item.id ?? idx} className="p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {item.productName}
                    {item.variantName ? ` · ${item.variantName}` : ""}
                  </span>
                  <span className="font-medium">{bdt(item.totalPrice)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.quantity} × {bdt(item.unitPrice)}
                  {item.imei1 ? ` · IMEI ${item.imei1}${item.imei2 ? ` / ${item.imei2}` : ""}` : ""}
                  {item.serialNumber ? ` · S/N ${item.serialNumber}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            Payment
          </label>
          <div className="space-y-1 rounded border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{bdt(order.totals.subtotal)}</span>
            </div>
            {order.totals.discount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>-{bdt(order.totals.discount)}</span>
              </div>
            )}
            {order.totals.tax > 0 && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{bdt(order.totals.tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <span>Grand Total</span>
              <span>{bdt(order.totals.grandTotal)}</span>
            </div>
            {order.payments.length > 0 && (
              <div className="space-y-0.5 border-t border-border pt-1">
                {order.payments.map((p, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>
                      {p.method}
                      {p.reference ? ` (${p.reference})` : ""}
                    </span>
                    <span>{bdt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium">{bdt(order.totals.paid)}</span>
            </div>
            {order.totals.change > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Change</span>
                <span>{bdt(order.totals.change)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            {order.storeInfo.channel === "POS" ? "POS sale" : "Online order"}
            {order.storeInfo.location ? ` · ${order.storeInfo.location}` : ""}
          </span>
          <span>#{order.saleNumber}</span>
        </div>
      </div>
    </div>
  );
}
