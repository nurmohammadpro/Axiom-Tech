"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Stat, Pill, SortableTable } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { AdvanceSelect } from "@/components/ui/advance-select";
import type { SearchOption } from "@/components/ui/search-select";
import { focusNextField } from "@/lib/focus-navigation";
import { bdt } from "@/lib/utils";
import { PAYMENT_METHODS, METHOD_LABELS, type PaymentMethodId } from "@/lib/payment-methods";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { barcodeLookup } from "@/lib/api";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { useSettings } from "@/lib/hooks";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Shield,
  Upload,
  X,
  Package,
  RefreshCw,
  Search,
  User,
  Calendar,
  CheckCircle,
  XCircle,
  Check,
  Pencil,
  FileText,
  Eye,
  Printer,
  Camera,
  CheckCircle2,
  ScanLine,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/library";
import { parseBarcode, type ParsedBarcode } from "@/lib/barcode-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  nidNumber: number | null;
  dob: string | null;
  nidImages: string[];
  verificationStatus: "unverified" | "verified" | "rejected";
  verificationNotes: string | null;
  isActive: boolean;
  totalExchanges: number;
  totalExchangeValue: number;
  createdAt: string;
}

interface ProductVariant {
  id: number;
  productId: string;
  productName: string;
  name: string;
  sku: string;
  costPrice: number | null;
  sellingPrice: number;
  costCode: string | null;
  sellCode: string | null;
  quantity: number;
}

interface Location {
  id: string;
  name: string;
}

interface ExchangeUnit {
  id: number;
  imei1: string;
  imei2: string;
  serial: string;
  batteryHealth: string;
  conditionGrade: string;
  specs: {
    RAM: string;
    Storage: string;
    Color: string;
  };
}

const CONDITION_OPTIONS = [
  "New",
  "Aslike New (95-100)",
  "Good (90-95)",
  "Average (85-90)",
  "Below Average (80-85)",
  "Bad (Issues)",
];

type Tab = "process" | "history";

const TABS = [
  { key: "process" as Tab, label: "Process Exchange", icon: RefreshCw },
  { key: "history" as Tab, label: "Exchange History", icon: FileText },
];

// ---------------------------------------------------------------------------
// Inline searchable field (type to search; pick from a list below)
// ---------------------------------------------------------------------------

function InlineSearchField({
  text,
  onTextChange,
  options,
  onPick,
  placeholder,
  emptyMessage,
}: {
  text: string;
  onTextChange: (t: string) => void;
  options: SearchOption[];
  onPick: (opt: SearchOption) => void;
  placeholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      (o.label + " " + (o.keywords || []).join(" ")).toLowerCase().includes(q),
    );
  }, [text, options]);

  const pick = (opt: SearchOption) => {
    onPick(opt);
    setOpen(false);
    // Defer so focusNextField runs after React applies any disabled state.
    setTimeout(() => {
      if (inputRef.current) focusNextField(inputRef.current);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && results.length > 0) {
        pick(results[highlighted] ?? results[0]);
      } else if (inputRef.current) {
        focusNextField(inputRef.current);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={(e) => {
          setOpen(true);
          setHighlighted(0);
          e.currentTarget.select();
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-border bg-background py-1.5 pl-3 pr-8 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80"
      />
      <Search
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto border border-border bg-popover text-sm shadow-sm">
          {results.map((opt, idx) => (
            <li
              key={opt.value}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt);
              }}
              onMouseEnter={() => setHighlighted(idx)}
              className={
                "cursor-pointer px-3 py-1.5 " +
                (idx === highlighted ? "bg-accent text-accent-foreground" : "text-foreground")
              }
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
      {open && text.trim() && results.length === 0 && (
        <div className="absolute z-30 mt-1 w-full border border-border bg-popover px-3 py-2 text-xs text-muted-foreground">
          {emptyMessage || "No results found."}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExchangesPage() {
  const [tab, setTab] = useState<Tab>("process");
  const router = useRouter();

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard">
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">Device Exchange</h2>
          <p className="text-sm text-muted-foreground">
            Process device exchanges with customer verification
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors " +
                (active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {tab === "process" && <ProcessExchangeTab />}
        {tab === "history" && <ExchangeHistoryTab />}
      </div>
    </>
  );
}

// ===========================================================================
// Tab 1: Process Exchange
// ===========================================================================

function ProcessExchangeTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["dashboard", "locations"],
    queryFn: () => fetch("/api/dashboard/locations").then((r) => r.json()),
  });

  return (
    <>
      <div className="mb-4">
        <Button variant="default" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Process Exchange
        </Button>
      </div>

      {showForm && (
        <ExchangeForm
          locations={locations}
          onClose={() => setShowForm(false)}
          onCompleted={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ["dashboard", "exchanges"] });
            qc.invalidateQueries({ queryKey: ["dashboard", "exchange-customers"] });
          }}
        />
      )}
    </>
  );
}

// ===========================================================================
// Tab 2: Exchange History
// ===========================================================================

interface ExchangeRecord {
  id: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  tradeInCostCode: string | null;
  tradeInDCode: string | null;
  tradeInSellCode: string | null;
  tradeInAgreedValue: number;
  tradeInProductName: string | null;
  newDeviceName: string;
  newDeviceVariant: string;
  newProductPrice: number;
  newDeviceUnit?: { imei1?: string | null; imei2?: string | null; serial?: string | null } | null;
  invoiceNumber: string | null;
  barcodeValue: string | null;
  paymentAmount: number;
  paymentMethod: string;
  paymentReference: string | null;
  payments?: { method: string; amount: number; reference?: string | null }[] | null;
  locationId: string | null;
  notes: string | null;
  status: string;
  tradeInItems: any[];
}

function ExchangeHistoryTab() {
  const qc = useQueryClient();
  const { data: exchanges = [], isLoading } = useQuery<ExchangeRecord[]>({
    queryKey: ["dashboard", "exchange-history"],
    queryFn: () => fetch("/api/dashboard/exchange-history").then((r) => r.json()),
  });
  const { data: settings } = useSettings();

  const [verifyingCustomer, setVerifyingCustomer] = useState<Customer | null>(null);
  const [viewingExchange, setViewingExchange] = useState<ExchangeRecord | null>(null);

  // Quick Exchange Lookup (mirrors the Orders page Quick Invoice Lookup)
  const [lookupInput, setLookupInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<ExchangeRecord | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const barcodeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (barcodeReaderRef.current) barcodeReaderRef.current.reset();
    };
  }, []);

  const handleLookup = async () => {
    if (!lookupInput.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/dashboard/exchange-history?search=${encodeURIComponent(lookupInput.trim())}`,
      );
      if (!res.ok) throw new Error("Lookup failed");
      const matches: ExchangeRecord[] = await res.json();
      if (matches.length === 1) {
        setLookupResult(matches[0]);
        setViewingExchange(matches[0]);
      } else if (matches.length === 0) {
        setLookupError("Exchange not found");
      } else {
        setLookupError(`${matches.length} exchanges match — refine your search`);
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
          setLookupInput(result.getText());
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

  function handlePrintExchange(e: ExchangeRecord) {
    if (!settings) return;
    const storeInfo = (settings?.store_info ?? {}) as Record<string, any>;
    const policies = (storeInfo.receiptPolicies || "")
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);
    const ref = e.barcodeValue || e.invoiceNumber || `EXC-${e.id.slice(0, 8).toUpperCase()}`;
    const tradeInName = e.tradeInProductName || e.tradeInCostCode || "Trade-in";
    const oldItems = (e.tradeInItems || []).map((u: any, i: number) => ({
      sl: i + 1,
      description: tradeInName,
      unitPrice: e.tradeInAgreedValue,
      qty: 1,
      total: e.tradeInAgreedValue,
      imei1: u.imei1 || undefined,
      imei2: u.imei2 || undefined,
      serialNumber: u.serial || undefined,
    }));
    const newDevice = `${e.newDeviceName}${
      e.newDeviceVariant && e.newDeviceVariant !== "Default" ? ` (${e.newDeviceVariant})` : ""
    }`;

    const receiptData: ReceiptData = {
      invoiceNumber: ref,
      date: new Date(e.createdAt),
      barcodeNumber: ref,
      storeInfo: {
        name: storeInfo.name || "PlayStore",
        address: storeInfo.address || "Dhaka, Bangladesh",
        phone: storeInfo.phone || "01727811918",
        email: storeInfo.email || "info@playstore.com.bd",
        website: storeInfo.website || undefined,
        logo: storeInfo.logo || undefined,
      },
      customer: {
        name: e.customerName || "Walk-in",
        phone: e.customerPhone || undefined,
      },
      items: [
        ...oldItems,
        {
          sl: oldItems.length + 1,
          description: newDevice,
          unitPrice: e.newProductPrice,
          qty: 1,
          total: e.newProductPrice,
          imei1: e.newDeviceUnit?.imei1 ?? undefined,
          imei2: e.newDeviceUnit?.imei2 ?? undefined,
          serialNumber: e.newDeviceUnit?.serial ?? undefined,
        },
      ],
      totals: {
        subtotal: e.newProductPrice,
        tradeInCredit: e.tradeInAgreedValue,
        grandTotal: Math.max(0, e.newProductPrice - e.tradeInAgreedValue),
        paid: e.paymentAmount,
      },
      payments:
        Array.isArray(e.payments) && e.payments.length > 0
          ? e.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference ?? undefined,
            }))
          : [
              {
                method: e.paymentMethod === "cash" ? "cash" : e.paymentMethod,
                amount: e.paymentAmount,
                reference: e.paymentReference ?? undefined,
              },
            ],
      policies,
      headerText: storeInfo.receiptHeader || undefined,
      footerText: storeInfo.receiptFooter || undefined,
      copies: Number(storeInfo.receiptCopies) || 1,
      isExchange: true,
      exchangeItems: {
        oldItems,
        newItems: [
          {
            sl: 1,
            description: newDevice,
            unitPrice: e.newProductPrice,
            qty: 1,
            total: e.newProductPrice,
            imei1: e.newDeviceUnit?.imei1 ?? undefined,
            imei2: e.newDeviceUnit?.imei2 ?? undefined,
            serialNumber: e.newDeviceUnit?.serial ?? undefined,
          },
        ],
      },
    };

    printReceipt(receiptData);
  }

  const totalExchanges = exchanges.length;
  const totalTradeInValue = exchanges.reduce((sum, e) => sum + e.tradeInAgreedValue, 0);
  const totalRevenue = exchanges.reduce((sum, e) => sum + e.paymentAmount, 0);

  return (
    <>
      {/* Quick Exchange Lookup */}
      <div className="mt-4">
        <SearchInput
          value={lookupInput}
          onChange={(e) => setLookupInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="e.g. 260817001234 or EXC-20260819-..."
          label="Quick Exchange Lookup"
          description="scan or enter barcode / exchange number"
          actions={
            <>
              {!scanning ? (
                <Button onClick={startScanning} variant="outline" size="sm" title="Scan barcode">
                  <Camera size={14} />
                </Button>
              ) : (
                <Button onClick={stopScanning} variant="destructive" size="sm">
                  <X size={14} />
                </Button>
              )}
              <Button
                onClick={handleLookup}
                disabled={lookupLoading || !lookupInput.trim()}
                size="sm"
              >
                {lookupLoading ? "Searching..." : "Verify"}
              </Button>
            </>
          }
        />
        <Card className="mt-3 p-4">
          {scanning && (
            <div className="relative">
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
            <div className="flex items-center gap-2 text-sm text-red-600">
              <XCircle size={14} /> {lookupError}
            </div>
          )}
          {lookupResult && (
            <div className="border border-border rounded p-4">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Verified Exchange</div>
                    <div className="text-xs text-muted-foreground">
                      {lookupResult.barcodeValue || lookupResult.invoiceNumber || lookupResult.id} ·{" "}
                      {new Date(lookupResult.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <Pill tone="success">Valid</Pill>
              </div>
              <div className="mb-3 flex gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <User size={12} className="text-muted-foreground" />
                  {lookupResult.customerName || "Walk-in"}
                </span>
                {lookupResult.customerPhone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} className="text-muted-foreground" />
                    {lookupResult.customerPhone}
                  </span>
                )}
              </div>
              <div className="mb-3 border border-border rounded divide-y divide-border">
                <div className="flex justify-between p-2 text-sm">
                  <div>
                    <span className="mr-1 text-muted-foreground">#1</span>
                    {lookupResult.newDeviceName}
                    {lookupResult.newDeviceVariant ? ` · ${lookupResult.newDeviceVariant}` : ""}
                    {lookupResult.newDeviceUnit?.imei1 && (
                      <div className="text-xs text-muted-foreground">
                        IMEI: {lookupResult.newDeviceUnit.imei1}
                        {lookupResult.newDeviceUnit.imei2
                          ? ` / ${lookupResult.newDeviceUnit.imei2}`
                          : ""}
                        {lookupResult.newDeviceUnit.serial
                          ? ` · S/N ${lookupResult.newDeviceUnit.serial}`
                          : ""}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div>{bdt(lookupResult.newProductPrice)}</div>
                    <div className="text-xs text-muted-foreground">New device</div>
                  </div>
                </div>
                <div className="flex justify-between p-2 text-sm">
                  <div>
                    <span className="mr-1 text-muted-foreground">↩</span>
                    {lookupResult.tradeInProductName || lookupResult.tradeInCostCode || "Trade-in"}
                  </div>
                  <div className="text-right">
                    <div>{bdt(lookupResult.tradeInAgreedValue)}</div>
                    <div className="text-xs text-muted-foreground">Trade-in value</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="rounded border border-border bg-surface p-3 text-sm">
                  <span className="mr-2 text-muted-foreground">Paid</span>
                  <span className="font-semibold">{bdt(lookupResult.paymentAmount)}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingExchange(lookupResult)}
                >
                  View Details
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total Exchanges" value={String(totalExchanges)} hint="All time" />
        <Stat label="Trade-in Value" value={bdt(totalTradeInValue)} hint="Total devices received" />
        <Stat label="Revenue" value={bdt(totalRevenue)} hint="Total payments collected" />
      </div>

      <div className="mt-3">
        <SortableTable
          columns={[
            {
              key: "createdAt",
              header: "Date",
              sortable: true,
              render: (val) => (
                <span className="text-xs text-muted-foreground">
                  {val ? new Date(val).toLocaleDateString() : "-"}
                </span>
              ),
            },
            {
              key: "customerName",
              header: "Customer",
              sortable: true,
              render: (val, row) => (
                <div>
                  <div className="font-medium">{val || "Walk-in"}</div>
                  {row.customerEmail && (
                    <div className="text-xs text-muted-foreground">{row.customerEmail}</div>
                  )}
                </div>
              ),
            },
            {
              key: "customerPhone",
              header: "Mobile",
              sortable: true,
              render: (val) => <span className="text-xs">{val || "-"}</span>,
            },
            {
              key: "tradeInCostCode",
              header: "Trade-in Device",
              sortable: false,
              render: (val, row) => (
                <div className="text-xs">
                  <div>Cost: {row.tradeInCostCode || "-"}</div>
                  <div>D Code: {row.tradeInDCode || "-"}</div>
                  <div>Sell: {row.tradeInSellCode || "-"}</div>
                </div>
              ),
            },
            {
              key: "imei",
              header: "IMEI",
              sortable: false,
              render: (_val, row) => {
                const items = row.tradeInItems;
                return items && items.length > 0 ? (
                  <div className="space-y-1">
                    {items.map((item: any, idx: number) => (
                      <div key={idx} className="text-[10px] text-muted-foreground">
                        {item.imei1 || "-"} / {item.imei2 || "-"}
                      </div>
                    ))}
                  </div>
                ) : (
                  "-"
                );
              },
            },
            {
              key: "tradeInAgreedValue",
              header: "Trade-in Value",
              sortable: true,
              render: (val) => <span className="font-medium">{bdt(val)}</span>,
            },
            {
              key: "newDeviceName",
              header: "New Device",
              sortable: true,
              render: (val, row) => (
                <div>
                  <div className="text-xs">{val}</div>
                  <div className="text-xs text-muted-foreground">{bdt(row.newProductPrice)}</div>
                </div>
              ),
            },
            {
              key: "paymentInfo",
              header: "Payment",
              sortable: false,
              render: (_val, row) => {
                if (Array.isArray(row.payments) && row.payments.length > 0) {
                  return (
                    <div className="space-y-0.5">
                      {row.payments.map((p: any, i: number) => (
                        <div key={i} className="text-xs">
                          {METHOD_LABELS[p.method] ?? p.method}{" "}
                          <span className="font-medium">{bdt(p.amount)}</span>
                          {p.reference && (
                            <span className="text-muted-foreground"> ({p.reference})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <>
                    <div className="text-xs">{row.paymentMethod}</div>
                    <div className="font-medium">{bdt(row.paymentAmount)}</div>
                  </>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              sortable: true,
              render: (val) => (
                <Pill tone={val === "complete" ? "success" : "warn"}>
                  {val === "complete" ? "Complete" : val}
                </Pill>
              ),
            },
            {
              key: "actions",
              header: "",
              sortable: false,
              render: (_val, row) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="View details"
                    onClick={() => setViewingExchange(row)}
                  >
                    <Eye size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Print receipt"
                    onClick={() => handlePrintExchange(row)}
                  >
                    <Printer size={16} />
                  </Button>
                </div>
              ),
            },
          ]}
          data={exchanges}
          rowKey={(e) => e.id}
          defaultSortColumn="createdAt"
          defaultSortDirection="desc"
          emptyMessage="No exchanges yet. Process your first exchange to see history here."
        />
      </div>

      {verifyingCustomer && (
        <CustomerVerificationModal
          customer={verifyingCustomer}
          onClose={() => setVerifyingCustomer(null)}
          onVerified={() => {
            setVerifyingCustomer(null);
            qc.invalidateQueries({ queryKey: ["dashboard", "exchange-history"] });
          }}
        />
      )}

      {viewingExchange && (
        <ExchangeDetailModal
          exchange={viewingExchange}
          onClose={() => setViewingExchange(null)}
          onPrint={() => handlePrintExchange(viewingExchange)}
        />
      )}
    </>
  );
}

// ===========================================================================
// Customer Verification Modal
// ===========================================================================

function CustomerVerificationModal({
  customer,
  onClose,
  onVerified,
}: {
  customer: Customer;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(status: "verified" | "rejected") {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/exchange-customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationStatus: status,
          verificationNotes: notes || null,
        }),
      });
      if (!res.ok) throw new Error("Verification failed");
      toast.success(status === "verified" ? "Customer verified" : "Customer rejected");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg border border-border bg-background p-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-3 text-sm font-medium">Verify Customer</div>

        <div className="mb-4 p-3 bg-muted rounded">
          <div className="font-medium">{customer.name}</div>
          <div className="text-xs text-muted-foreground">{customer.phone}</div>
          {customer.email && <div className="text-xs text-muted-foreground">{customer.email}</div>}
          {customer.nidNumber && (
            <div className="text-xs text-muted-foreground">NID: {customer.nidNumber}</div>
          )}
        </div>

        {customer.nidImages && customer.nidImages.length > 0 && (
          <div className="mb-4">
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
              NID Images
            </label>
            <div className="flex flex-wrap gap-2">
              {customer.nidImages.map((url, i) => (
                <img
                  key={url}
                  src={url}
                  alt={`NID ${i + 1}`}
                  className="h-20 w-32 border border-border object-cover rounded"
                />
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
            Verification Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add verification notes..."
            rows={3}
            className="w-full border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-between">
          <Button variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleVerify("rejected")}
              disabled={loading}
              className="border-sale text-sale hover:bg-sale/10"
            >
              <XCircle size={14} className="mr-1" /> Reject
            </Button>
            <Button
              variant="default"
              onClick={() => handleVerify("verified")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check size={14} className="mr-1" /> Verify
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 3: Exchange Inventory
// ===========================================================================

// ===========================================================================
// Exchange Form
// ===========================================================================

function ExchangeForm({
  locations,
  onClose,
  onCompleted,
}: {
  locations: Location[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Customer selection
  const [customerId, setCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerNidNumber, setCustomerNidNumber] = useState("");
  const [customerDob, setCustomerDob] = useState("");
  const [customerNidImages, setCustomerNidImages] = useState<string[]>([]);
  const [uploadingNid, setUploadingNid] = useState(false);

  // Trade-in device details
  const [tradeInProductId, setTradeInProductId] = useState("");
  const [tradeInProductName, setTradeInProductName] = useState("");
  const [tradeInCategory, setTradeInCategory] = useState("pre-owned");
  const [tradeInBrandId, setTradeInBrandId] = useState<number | null>(null);
  const [tradeInCostCode, setTradeInCostCode] = useState("");
  const [tradeInDCode, setTradeInDCode] = useState("");
  const [tradeInSellCode, setTradeInSellCode] = useState("");
  const [tradeInCostPrice, setTradeInCostPrice] = useState("");
  const [tradeInSellPrice, setTradeInSellPrice] = useState("");
  const [tradeInQty, setTradeInQty] = useState("1");

  // Device units (IMEI tracking)
  const [tradeInUnits, setTradeInUnits] = useState<ExchangeUnit[]>([
    { id: 1, imei1: "", imei2: "", serial: "", batteryHealth: "", conditionGrade: "Good (90-95)", specs: { RAM: "", Storage: "", Color: "" } },
  ]);
  const [tradeInScanInput, setTradeInScanInput] = useState("");
  const [lastParsed, setLastParsed] = useState<ParsedBarcode | null>(null);

  // New device selection
  const [newDeviceVariantId, setNewDeviceVariantId] = useState<number | null>(null);
  const [newDeviceBasePrice, setNewDeviceBasePrice] = useState("");
  const [newDeviceSearch, setNewDeviceSearch] = useState("");
  const [newDeviceImeiSearch, setNewDeviceImeiSearch] = useState("");
  const [newDeviceImeiLookupLoading, setNewDeviceImeiLookupLoading] = useState(false);
  const [newDeviceImei, setNewDeviceImei] = useState("");
  const [newDeviceImei2, setNewDeviceImei2] = useState("");
  const [newDeviceSerial, setNewDeviceSerial] = useState("");
  const [discount, setDiscount] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Payment (split tenders, like the POS checkout)
  const [paymentLines, setPaymentLines] = useState<
    { id: string; method: PaymentMethodId; amount: string; reference: string }[]
  >([]);
  const [methodOpen, setMethodOpen] = useState(false);
  const [methodCursor, setMethodCursor] = useState(0);
  const addPaymentBtnRef = useRef<HTMLButtonElement>(null);
  const methodWrapRef = useRef<HTMLDivElement>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const refRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [submitting, setSubmitting] = useState(false);

  // Queries
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["dashboard", "exchange-customers"],
    queryFn: () => fetch("/api/dashboard/exchange-customers").then((r) => r.json()),
  });

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["dashboard", "products"],
    queryFn: () => fetch("/api/dashboard/products").then((r) => r.json()),
  });

  const { data: brands = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["dashboard", "brands"],
    queryFn: () => fetch("/api/dashboard/brands").then((r) => r.json()),
  });

  // Fetch categories dynamically from the database
  const { data: dbCategories = [] } = useQuery<{ id: number; name: string; slug: string }[]>({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/categories").then((r) => r.json()),
  });

  const categoryOptions = useMemo(() => {
    if (dbCategories.length > 0) {
      return dbCategories.map((c) => ({ value: c.slug, label: c.name }));
    }
    return [
      { value: "pre-owned", label: "Pre-Owned" },
      { value: "official", label: "Official" },
    ];
  }, [dbCategories]);

  // In-stock devices fetched from inventory directly (source of truth for the exchange).
  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ["dashboard", "inventory"],
    queryFn: () => fetch("/api/dashboard/inventory").then((r) => r.json()),
  });

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Flat list of customers for the searchable select
  const customerOptions: SearchOption[] = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: `${c.name} - ${c.phone}`,
        keywords: [c.name, c.phone, c.email || "", c.city || ""],
      })),
    [customers],
  );

  // Flat list of trade-in products for the searchable select
  const tradeInOptions: SearchOption[] = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.name,
        keywords: [p.name, p.costCode || "", p.sellCode || ""],
      })),
    [products],
  );

  // Flat list of in-stock device variants for the searchable select
  const newDeviceOptions: SearchOption[] = useMemo(() => {
    const opts: SearchOption[] = [];
    for (const item of inventoryItems) {
      if (item.available > 0 && item.active !== false) {
        opts.push({
          value: String(item.variantId),
          label: `${item.productName} ${item.variantName} - ${bdt(item.sellingPrice)} (In stock: ${item.available})`,
          keywords: [
            item.productName,
            item.variantName,
            item.sku,
            String(item.sellingPrice),
            item.imei1 || "",
            item.imei2 || "",
            item.serialNumber || "",
          ],
        });
      }
    }
    return opts;
  }, [inventoryItems]);

  // Calculate payment required
  const tradeInValue = Number(tradeInCostPrice) || 0;
  const newDeviceBase = Number(newDeviceBasePrice) || 0;
  const discountValue = Number(discount) || 0;
  const newDevicePriceValue = Math.max(0, newDeviceBase - discountValue);
  const paymentRequired = Math.max(0, newDevicePriceValue - tradeInValue);
  const paidPoisha = paymentLines.reduce(
    (s, l) => s + (Math.round(parseFloat(l.amount || "0")) || 0),
    0,
  );
  const change = Math.max(0, paidPoisha - paymentRequired);
  const remaining = Math.max(0, paymentRequired - paidPoisha);

  // Close the payment-method dropdown when clicking elsewhere.
  useEffect(() => {
    if (!methodOpen) return;
    const h = (e: MouseEvent) => {
      if (methodWrapRef.current && !methodWrapRef.current.contains(e.target as Node)) {
        setMethodOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [methodOpen]);

  function addPaymentMethod(id: PaymentMethodId) {
    const lineId = crypto.randomUUID();
    setPaymentLines((prev) => [...prev, { id: lineId, method: id, amount: "", reference: "" }]);
    setMethodOpen(false);
    setTimeout(() => {
      const el = amountRefs.current[lineId];
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
  }

  function updatePaymentLine(id: string, patch: Partial<{ amount: string; reference: string }>) {
    setPaymentLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removePaymentLine(id: string) {
    setPaymentLines((prev) => prev.filter((l) => l.id !== id));
  }

  function applyNewDeviceSelection(
    variantId: number,
    label: string,
    price: number,
    imei1 = "",
    imei2 = "",
    serial = "",
  ) {
    setNewDeviceVariantId(variantId);
    setNewDeviceBasePrice(String(price));
    setNewDeviceSearch(label);
    setNewDeviceImei(imei1);
    setNewDeviceImei2(imei2);
    setNewDeviceSerial(serial);
    setDiscount("");
  }

  async function handleNewDeviceImeiLookup() {
    const id = newDeviceImeiSearch.trim();
    if (!id) {
      toast.error("Enter an IMEI or serial number");
      return;
    }
    setNewDeviceImeiLookupLoading(true);
    try {
      const res = await barcodeLookup(id);
      if (res.match === "unit" && res.unit && res.variant) {
        if (res.unit.status !== "available") {
          toast.error("This device is not available in stock");
          return;
        }
        const label = `${res.product?.name ?? ""} ${res.variant.name}`.trim();
        applyNewDeviceSelection(
          res.variant.id,
          label,
          res.variant.sellingPrice,
          res.unit.imei1 ?? id,
          res.unit.imei2 ?? "",
          res.unit.serialNumber ?? "",
        );
        toast.success("Device found");
      } else if (res.match === "variant" && res.variant) {
        const label = `${res.product?.name ?? ""} ${res.variant.name}`.trim();
        applyNewDeviceSelection(res.variant.id, label, res.variant.sellingPrice);
        toast.success("Device variant found — enter IMEI if serialized");
      } else if (res.match === "multi") {
        toast.error("Barcode matches multiple products — enter the device IMEI/serial instead");
      } else {
        toast.error("No in-stock device found with that IMEI");
      }
    } catch {
      toast.error("No device found with that IMEI or serial");
    } finally {
      setNewDeviceImeiLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedCustomer && (!customerName.trim() || !customerPhone.trim())) {
      toast.error("Customer name and phone are required");
      return;
    }

    if (!tradeInProductName.trim()) {
      toast.error("Trade-in device name is required");
      return;
    }

    if (!tradeInCostCode.trim() || !tradeInSellCode.trim()) {
      toast.error("Cost code and sell code are required");
      return;
    }

    if (!tradeInCostPrice || Number(tradeInCostPrice) <= 0) {
      toast.error("Cost price is required");
      return;
    }

    if (!tradeInSellPrice || Number(tradeInSellPrice) <= 0) {
      toast.error("Sell price is required");
      return;
    }

    if (!newDeviceVariantId) {
      toast.error("Please select a new device");
      return;
    }

    if (newDeviceBase <= 0) {
      toast.error("Selected device has no selling price set");
      return;
    }

    if (newDevicePriceValue <= 0) {
      toast.error("Discount cannot exceed the device price");
      return;
    }

    if (!locationId) {
      toast.error("Please select a location");
      return;
    }

    // Validate trade-in unit IMEIs
    for (let i = 0; i < tradeInUnits.length; i++) {
      const u = tradeInUnits[i];
      if (u.imei1.trim()) {
        const normalized = normalizeImei(u.imei1);
        if (normalized.length !== 15 || !luhnValid(normalized)) {
          toast.error(`Unit ${i + 1} IMEI 1 is invalid — check the number and try again`);
          return;
        }
      }
      if (u.imei2.trim()) {
        const normalized = normalizeImei(u.imei2);
        if (normalized.length !== 15 || !luhnValid(normalized)) {
          toast.error(`Unit ${i + 1} IMEI 2 is invalid — check the number and try again`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      // Step 1: Create/update customer if needed
      let finalCustomerId = customerId;
      if (!finalCustomerId) {
        const customerRes = await fetch("/api/dashboard/exchange-customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: customerName.trim(),
            phone: customerPhone.trim(),
            email: customerEmail || null,
            address: customerAddress || null,
            city: customerCity || null,
            nidNumber: customerNidNumber ? Number(customerNidNumber) : null,
            dob: customerDob || null,
            nidImages: customerNidImages,
          }),
        });
        if (!customerRes.ok) throw new Error("Failed to create customer");
        const customerData = await customerRes.json();
        finalCustomerId = customerData.id;
      }

      // Step 2: Process exchange
      const exchangeRes = await fetch("/api/dashboard/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: finalCustomerId,
          tradeIn: {
            productName: tradeInProductName.trim(),
            category: tradeInCategory,
            brandId: tradeInBrandId,
            costCode: tradeInCostCode.trim(),
            dCode: tradeInDCode.trim(),
            sellCode: tradeInSellCode.trim(),
            agreedValue: Number(tradeInCostPrice),
            costPrice: Number(tradeInCostPrice),
            sellPrice: Number(tradeInSellPrice),
            qty: Number(tradeInQty),
            units: tradeInUnits.filter((u) => u.imei1.trim() || u.serial.trim()),
          },
          newDevice: {
            variantId: newDeviceVariantId,
            price: newDevicePriceValue,
            imei1: newDeviceImei.trim(),
            imei2: newDeviceImei2.trim(),
            serial: newDeviceSerial.trim(),
          },
          payments: paymentLines.map((l) => ({
            method: l.method,
            amount: Math.round(parseFloat(l.amount || "0")) || 0,
            reference: l.reference.trim() || null,
          })),
          locationId,
          notes: notes || null,
        }),
      });

      if (!exchangeRes.ok) {
        const err = await exchangeRes.json().catch(() => ({}));
        throw new Error(err.error || "Exchange processing failed");
      }

      toast.success("Exchange processed successfully!");
      onCompleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Exchange processing failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNidUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (customerNidImages.length + files.length > 2) {
      toast.error("NID has only 2 parts (front & back). Max 2 images.");
      return;
    }
    setUploadingNid(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/dashboard/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
        }
        const data = await res.json();
        setCustomerNidImages((prev) => [...prev, data.url]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingNid(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80";

  // Enter key navigation
  const handleEnterKey = (e: React.KeyboardEvent, nextFieldId?: string) => {
    if (e.key === "Enter" && nextFieldId) {
      e.preventDefault();
      const nextElement = document.getElementById(nextFieldId);
      if (nextElement) {
        nextElement.focus();
        if (nextElement instanceof HTMLInputElement) {
          nextElement.select();
        }
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl border border-border bg-background p-4 max-h-[90vh] overflow-y-auto"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
        <div className="mb-3 pr-8 text-sm font-medium">Process Device Exchange</div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Customer Details */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User size={14} /> Customer Details
            </h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Search Existing Customer
                </label>
                <InlineSearchField
                  text={customerSearch}
                  onTextChange={setCustomerSearch}
                  options={customerOptions}
                  onPick={(opt) => {
                    setCustomerId(opt.value);
                    setCustomerSearch(opt.label);
                  }}
                  placeholder="Search customer by name or phone…"
                  emptyMessage="No customer found. Add new below."
                />
              </div>

              <div className="text-xs text-muted-foreground text-center">OR ADD NEW CUSTOMER</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Name *
                  </label>
                  <input
                    id="customer-name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "customer-phone")}
                    disabled={!!customerId}
                    placeholder="Full name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Phone *
                  </label>
                  <input
                    id="customer-phone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "customer-email")}
                    disabled={!!customerId}
                    placeholder="017xxxxxxxx"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Email
                  </label>
                  <input
                    id="customer-email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "customer-city")}
                    disabled={!!customerId}
                    placeholder="email@example.com"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    City
                  </label>
                  <input
                    id="customer-city"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "customer-address")}
                    disabled={!!customerId}
                    placeholder="e.g. Dhaka"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Address
                </label>
                <input
                  id="customer-address"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  onKeyDown={(e) => handleEnterKey(e, "customer-nid")}
                  disabled={!!customerId}
                  placeholder="Street address"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    NID Number
                  </label>
                  <input
                    id="customer-nid"
                    value={customerNidNumber}
                    onChange={(e) => setCustomerNidNumber(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "customer-dob")}
                    disabled={!!customerId}
                    inputMode="numeric"
                    placeholder="1234567890"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Date of Birth
                  </label>
                  <input
                    id="customer-dob"
                    type="date"
                    value={customerDob}
                    onChange={(e) => setCustomerDob(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-product")}
                    disabled={!!customerId}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Upload NID <span className="normal-case">(optional)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleNidUpload}
                  disabled={uploadingNid || !!customerId}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingNid || !!customerId}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={13} /> {uploadingNid ? "Uploading…" : "Choose Files"}
                  </Button>
                  {customerNidImages.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {customerNidImages.length}/2 uploaded
                    </span>
                  )}
                </div>
                {customerNidImages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {customerNidImages.map((url, i) => (
                      <div key={url} className="relative">
                        <img
                          src={url}
                          alt={`NID ${i + 1}`}
                          className="h-16 w-24 border border-border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCustomerNidImages((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="absolute -right-1.5 -top-1.5 border border-border bg-background p-0.5 text-muted-foreground hover:text-sale"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded">
                  <Shield size={14} />
                  <span className="text-xs">
                    {selectedCustomer.verificationStatus === "verified"
                      ? "✓ Verified Customer"
                      : selectedCustomer.verificationStatus === "rejected"
                        ? "✗ Rejected Customer"
                        : "⚠ Unverified Customer"}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Trade-in Device */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Package size={14} /> Trade-in Device
            </h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Device Name *
                </label>
                <InlineSearchField
                  text={tradeInProductName}
                  onTextChange={(t) => {
                    setTradeInProductName(t);
                    setTradeInProductId("");
                  }}
                  options={tradeInOptions}
                  onPick={(opt) => {
                    setTradeInProductId(opt.value);
                    setTradeInProductName(opt.label);
                    const product = products.find((p) => p.id === opt.value);
                    if (product) {
                      if (product.costCode) setTradeInCostCode(product.costCode);
                      if (product.dCode) setTradeInDCode(product.dCode);
                      if (product.sellCode) setTradeInSellCode(product.sellCode);
                    }
                  }}
                  placeholder="Search existing or type a new device name…"
                  emptyMessage="No matching device — the typed name will be used as a new device."
                />
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Cost Code *
                  </label>
                  <input
                    id="tradein-costcode"
                    value={tradeInCostCode}
                    onChange={(e) => setTradeInCostCode(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-dcode")}
                    placeholder="e.g., A12"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    D Code
                  </label>
                  <input
                    id="tradein-dcode"
                    value={tradeInDCode}
                    onChange={(e) => setTradeInDCode(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-sellcode")}
                    placeholder="e.g., D10"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Sell Code *
                  </label>
                  <input
                    id="tradein-sellcode"
                    value={tradeInSellCode}
                    onChange={(e) => setTradeInSellCode(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-qty")}
                    placeholder="e.g., B25"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Qty *
                  </label>
                  <input
                    id="tradein-qty"
                    type="number"
                    min="1"
                    value={tradeInQty}
                    onChange={(e) => setTradeInQty(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-costprice")}
                    className={inputCls}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Category *
                </label>
                <AdvanceSelect
                  value={tradeInCategory}
                  onValueChange={setTradeInCategory}
                  placeholder="Select category"
                >
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </AdvanceSelect>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Brand
                </label>
                <AdvanceSelect
                  value={tradeInBrandId?.toString() || ""}
                  onValueChange={(value) => setTradeInBrandId(value ? Number(value) : null)}
                  placeholder="Select brand"
                >
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id.toString()}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </AdvanceSelect>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Cost Price *
                  </label>
                  <input
                    id="tradein-costprice"
                    type="number"
                    value={tradeInCostPrice}
                    onChange={(e) => setTradeInCostPrice(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "tradein-sellprice")}
                    placeholder="25000"
                    className={inputCls}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Sell Price *
                  </label>
                  <input
                    id="tradein-sellprice"
                    type="number"
                    value={tradeInSellPrice}
                    onChange={(e) => setTradeInSellPrice(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "new-device-variant")}
                    placeholder="35000"
                    className={inputCls}
                    required
                  />
                </div>
              </div>

              {/* Quick Scan for Trade-in Device */}
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <ScanLine size={14} className="text-muted-foreground" />
                  <span className="text-xs font-medium">Quick Scan Trade-in Device</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Scan phone box barcode to auto-fill IMEI + Serial. Works with all brands.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tradeInScanInput}
                    onChange={(e) => setTradeInScanInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const trimmed = tradeInScanInput.trim();
                        if (!trimmed) return;
                        const parsed = parseBarcode(trimmed);
                        setLastParsed(parsed);
                        // Update first unit with parsed data
                        setTradeInUnits((prev) => {
                          const first = prev[0];
                          if (!first) return prev;
                          return [
                            {
                              ...first,
                              imei1: parsed.imei1 ?? first.imei1,
                              imei2: parsed.imei2 ?? first.imei2,
                              serial: parsed.serial ?? first.serial,
                            },
                            ...prev.slice(1),
                          ];
                        });
                        setTradeInScanInput("");
                        if (parsed.imei1 && parsed.serial) {
                          toast.success(`Parsed IMEI: ${parsed.imei1} + S/N: ${parsed.serial}`);
                        } else if (parsed.imei1) {
                          toast.success(`Parsed IMEI: ${parsed.imei1}`);
                        } else if (parsed.serial) {
                          toast.success(`Parsed S/N: ${parsed.serial}`);
                        }
                      }
                    }}
                    placeholder="Scan barcode here..."
                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                  />
                </div>
                {lastParsed && (
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    <span>Last: </span>
                    {lastParsed.brand && (
                      <span className="font-medium mr-1">{lastParsed.brand}</span>
                    )}
                    {lastParsed.imei1 && (
                      <span className="font-mono">IMEI: {lastParsed.imei1}</span>
                    )}
                    {lastParsed.serial && (
                      <span className="font-mono ml-1">S/N: {lastParsed.serial}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Device Units */}
              {tradeInUnits.map((unit, index) => (
                <div key={unit.id} className="p-3 border border-border rounded space-y-2">
                  <div className="text-xs font-medium">Unit {index + 1}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        IMEI 1 *
                      </label>
                      <input
                        type="text"
                        value={unit.imei1}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) => (i === index ? { ...u, imei1: val } : u)),
                          );
                        }}
                        placeholder="123456789012345"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">IMEI 2</label>
                      <input
                        type="text"
                        value={unit.imei2}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) => (i === index ? { ...u, imei2: val } : u)),
                          );
                        }}
                        placeholder="123456789012346"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-muted-foreground">Serial</label>
                    <input
                      type="text"
                      value={unit.serial}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTradeInUnits((prev) =>
                          prev.map((u, i) => (i === index ? { ...u, serial: val } : u)),
                        );
                      }}
                      placeholder="Serial number"
                      className="w-full border border-border bg-background px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        Battery %
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={unit.batteryHealth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) => (i === index ? { ...u, batteryHealth: val } : u)),
                          );
                        }}
                        placeholder="85"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        Condition
                      </label>
                      <select
                        value={unit.conditionGrade}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) => (i === index ? { ...u, conditionGrade: val } : u)),
                          );
                        }}
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      >
                        {CONDITION_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">RAM</label>
                      <input
                        type="text"
                        value={unit.specs.RAM}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) =>
                              i === index ? { ...u, specs: { ...u.specs, RAM: val } } : u
                            ),
                          );
                        }}
                        placeholder="8GB"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">Storage</label>
                      <input
                        type="text"
                        value={unit.specs.Storage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) =>
                              i === index ? { ...u, specs: { ...u.specs, Storage: val } } : u
                            ),
                          );
                        }}
                        placeholder="128GB"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">Color</label>
                      <input
                        type="text"
                        value={unit.specs.Color}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTradeInUnits((prev) =>
                            prev.map((u, i) =>
                              i === index ? { ...u, specs: { ...u.specs, Color: val } } : u
                            ),
                          );
                        }}
                        placeholder="Black"
                        className="w-full border border-border bg-background px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newId = Math.max(...tradeInUnits.map((u) => u.id), 0) + 1;
                    setTradeInUnits([
                      ...tradeInUnits,
                      {
                        id: newId,
                        imei1: "",
                        imei2: "",
                        serial: "",
                        batteryHealth: "",
                        conditionGrade: "Good (90-95)",
                        specs: { RAM: "", Storage: "", Color: "" },
                      },
                    ]);
                  }}
                >
                  <Plus size={12} /> Add Unit
                </Button>
                {tradeInUnits.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTradeInUnits((prev) => prev.slice(0, -1))}
                  >
                    <Trash2 size={12} /> Remove Last
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* New Device & Payment */}
          <Card className="p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <RefreshCw size={14} /> New Device & Payment
            </h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Find New Device by IMEI *
                </label>
                <div className="flex gap-2">
                  <input
                    id="new-device-imei-search"
                    type="text"
                    value={newDeviceImeiSearch}
                    onChange={(e) => setNewDeviceImeiSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleNewDeviceImeiLookup();
                      }
                    }}
                    placeholder="Scan or enter IMEI / serial number…"
                    className={inputCls}
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="shrink-0"
                    disabled={newDeviceImeiLookupLoading || !newDeviceImeiSearch.trim()}
                    onClick={() => void handleNewDeviceImeiLookup()}
                  >
                    {newDeviceImeiLookupLoading ? "Searching…" : "Find Device"}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground text-center">OR SEARCH BY MODEL</div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Search by Model
                </label>
                <InlineSearchField
                  text={newDeviceSearch}
                  onTextChange={(t) => {
                    setNewDeviceSearch(t);
                    setNewDeviceVariantId(null);
                    setNewDeviceBasePrice("");
                    setNewDeviceImei("");
                    setNewDeviceImei2("");
                    setNewDeviceSerial("");
                    setNewDeviceImeiSearch("");
                  }}
                  options={newDeviceOptions}
                  onPick={(opt) => {
                    const vid = Number(opt.value);
                    const item = inventoryItems.find((i: any) => i.variantId === vid);
                    applyNewDeviceSelection(
                      vid,
                      opt.label,
                      item?.sellingPrice ?? 0,
                      item?.imei1 ?? "",
                      item?.imei2 ?? "",
                      item?.serialNumber ?? "",
                    );
                    setNewDeviceImeiSearch("");
                  }}
                  placeholder="Search by model name, SKU…"
                  emptyMessage="No in-stock device matches."
                />
              </div>

              {newDeviceVariantId && (
                <div className="grid grid-cols-2 gap-3 rounded border border-border bg-muted/40 p-3">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                      IMEI 1
                    </label>
                    <input
                      id="new-device-imei"
                      type="text"
                      value={newDeviceImei}
                      onChange={(e) => setNewDeviceImei(e.target.value)}
                      placeholder="Primary IMEI"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                      Serial
                    </label>
                    <input
                      id="new-device-serial"
                      type="text"
                      value={newDeviceSerial}
                      onChange={(e) => setNewDeviceSerial(e.target.value)}
                      placeholder="Serial number"
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                      IMEI 2 (dual SIM)
                    </label>
                    <input
                      id="new-device-imei2"
                      type="text"
                      value={newDeviceImei2}
                      onChange={(e) => setNewDeviceImei2(e.target.value)}
                      placeholder="Optional second IMEI"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Discount
                  </label>
                  <input
                    id="new-device-discount"
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    onKeyDown={(e) => handleEnterKey(e, "exchange-add-payment")}
                    placeholder="0"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Location *
                  </label>
                  <AdvanceSelect
                    value={locationId}
                    onValueChange={setLocationId}
                    placeholder="Select location"
                  >
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </AdvanceSelect>
                </div>
              </div>

              {/* Exchange Summary */}
              <div className="p-3 bg-muted rounded">
                <div className="text-xs font-semibold mb-2">EXCHANGE SUMMARY</div>
                <div className="space-y-1 text-sm">
                  {tradeInValue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trade-in Device Price:</span>
                      <span className="font-medium">- {bdt(tradeInValue)}</span>
                    </div>
                  )}
                  {discountValue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount:</span>
                      <span className="font-medium">- {bdt(discountValue)}</span>
                    </div>
                  )}
                  {newDeviceVariantId ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">New Device:</span>
                        <span className="font-medium">+ {bdt(newDeviceBase)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1 mt-1">
                        <span className="font-medium">Total:</span>
                        <span className="font-bold text-lg">{bdt(paymentRequired)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Select a new device to see the total.
                    </div>
                  )}
                </div>
              </div>

              {/* Split payment lines (like the POS checkout) */}
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Payment
                </label>
                <div ref={methodWrapRef} className="relative">
                  <Button
                    ref={addPaymentBtnRef}
                    id="exchange-add-payment"
                    type="button"
                    variant="surface"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setMethodCursor(0);
                      setMethodOpen((o) => !o);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMethodCursor((c) => Math.min(c + 1, PAYMENT_METHODS.length - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMethodCursor((c) => Math.max(c - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (methodOpen) addPaymentMethod(PAYMENT_METHODS[methodCursor].id);
                        else setMethodOpen(true);
                      } else if (e.key === "Escape") {
                        setMethodOpen(false);
                      }
                    }}
                  >
                    <Plus size={13} /> Add payment
                  </Button>
                  {methodOpen && (
                    <div className="absolute right-0 z-30 mt-1 w-full overflow-hidden border border-border bg-popover text-sm shadow-sm">
                      {PAYMENT_METHODS.map((m, i) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseEnter={() => setMethodCursor(i)}
                          onClick={() => addPaymentMethod(m.id)}
                          className={
                            "flex w-full items-center justify-between px-3 py-1.5 text-left " +
                            (i === methodCursor
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground")
                          }
                        >
                          <span>{m.label}</span>
                          {i === methodCursor && <span className="text-xs opacity-60">↵</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {paymentLines.length === 0 ? (
                  <div className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Add a payment method to begin.
                  </div>
                ) : (
                  <div className="mt-1.5 space-y-1.5">
                    {paymentLines.map((l) => (
                      <div key={l.id} className="flex items-center gap-1.5">
                        <span className="w-20 shrink-0 text-xs font-medium">
                          {METHOD_LABELS[l.method] ?? l.method}
                        </span>
                        <input
                          ref={(el) => {
                            amountRefs.current[l.id] = el;
                          }}
                          value={l.amount}
                          onChange={(e) => updatePaymentLine(l.id, { amount: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = refRefs.current[l.id];
                              if (next) {
                                next.focus();
                                next.select();
                              }
                            }
                          }}
                          inputMode="decimal"
                          placeholder="0"
                          className="w-full flex-1 border border-border bg-surface/50 px-2 py-1 text-right text-sm outline-none"
                        />
                        <input
                          ref={(el) => {
                            refRefs.current[l.id] = el;
                          }}
                          value={l.reference}
                          onChange={(e) => updatePaymentLine(l.id, { reference: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPaymentBtnRef.current?.focus();
                            }
                          }}
                          placeholder="Ref"
                          className="w-32 shrink-0 border border-border bg-surface/50 px-2 py-1 text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removePaymentLine(l.id)}
                          className="shrink-0 text-muted-foreground hover:text-sale"
                          aria-label="Remove payment"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {remaining > 0 ? (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-sale">{bdt(remaining)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Change</span>
                  <span className="text-emerald-600">{bdt(change)}</span>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Exchange notes..."
                  rows={2}
                  className={inputCls}
                />
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            disabled={submitting || (paymentRequired > 0 && paidPoisha < paymentRequired)}
          >
            {submitting ? "Processing..." : "Process Exchange"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ===========================================================================
// Exchange Detail Modal
// ===========================================================================

function ExchangeDetailModal({
  exchange: e,
  onClose,
  onPrint,
}: {
  exchange: ExchangeRecord;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg border border-border bg-background p-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Exchange Details</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" title="Print receipt" onClick={onPrint}>
              <Printer size={16} />
            </Button>
            <Button variant="ghost" size="icon" title="Close" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="mb-4 p-3 bg-muted rounded">
          <div className="font-medium">{e.customerName || "Walk-in"}</div>
          {e.customerPhone && (
            <div className="text-xs text-muted-foreground">{e.customerPhone}</div>
          )}
          {e.customerEmail && (
            <div className="text-xs text-muted-foreground">{e.customerEmail}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(e.createdAt).toLocaleDateString("en-BD", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            Trade-in Device
          </label>
          <div className="space-y-1 rounded border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Device</span>
              <span className="font-medium">
                {e.tradeInProductName || e.tradeInCostCode || "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost Code</span>
              <span>{e.tradeInCostCode || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sell Code</span>
              <span>{e.tradeInSellCode || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agreed Value</span>
              <span className="font-medium">{bdt(e.tradeInAgreedValue)}</span>
            </div>
            {e.tradeInItems && e.tradeInItems.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="mb-1 text-xs text-muted-foreground">Units</div>
                {e.tradeInItems.map((item: any, idx: number) => (
                  <div key={idx} className="text-xs">
                    <div>
                      IMEI: {item.imei1 || "-"} {item.imei2 ? `/ ${item.imei2}` : ""}
                    </div>
                    <div>Serial: {item.serial || "-"}</div>
                    {item.batteryHealth && <div>Battery: {item.batteryHealth}%</div>}
                    {item.conditionGrade && <div>Condition: {item.conditionGrade}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            New Device
          </label>
          <div className="space-y-1 rounded border border-border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Device</span>
              <span className="font-medium">{e.newDeviceName}</span>
            </div>
            {e.newDeviceVariant && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variant</span>
                <span>{e.newDeviceVariant}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">{bdt(e.newProductPrice)}</span>
            </div>
            {(e.newDeviceUnit?.imei1 || e.newDeviceUnit?.imei2 || e.newDeviceUnit?.serial) && (
              <div className="border-t border-border pt-2">
                <div className="mb-1 text-xs text-muted-foreground">Unit</div>
                <div className="text-xs">
                  <div>
                    IMEI: {e.newDeviceUnit?.imei1 || "-"}{" "}
                    {e.newDeviceUnit?.imei2 ? `/ ${e.newDeviceUnit.imei2}` : ""}
                  </div>
                  <div>Serial: {e.newDeviceUnit?.serial || "-"}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            Payment
          </label>
          <div className="space-y-1 rounded border border-border p-3 text-sm">
            {Array.isArray(e.payments) && e.payments.length > 0 ? (
              e.payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{METHOD_LABELS[p.method] ?? p.method}</span>
                  <span>
                    <span className="font-medium">{bdt(p.amount)}</span>
                    {p.reference && (
                      <span className="ml-2 text-xs text-muted-foreground">({p.reference})</span>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex justify-between">
                <span>{e.paymentMethod || "cash"}</span>
                <span className="font-medium">{bdt(e.paymentAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium">{bdt(e.paymentAmount)}</span>
            </div>
          </div>
        </div>

        {e.notes && (
          <div className="mb-4">
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
              Notes
            </label>
            <div className="rounded border border-border p-3 text-sm">{e.notes}</div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>Status: {e.status === "complete" ? "Complete" : e.status}</span>
          {e.locationId && <span>Location: {e.locationId}</span>}
        </div>
      </div>
    </div>
  );
}
