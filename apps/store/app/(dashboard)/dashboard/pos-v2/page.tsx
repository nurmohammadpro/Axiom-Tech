"use client";

/**
 * POS v2 — the simplified "regular POS".
 *
 * One search/scan field, product tiles, tap-to-add, a guided unit step for
 * serialized stock, and a single payment screen. Shares the exact commit API
 * with the classic POS (/api/sales/commit) so stock, invoices and receipts
 * behave identically. The classic POS stays available until sign-off.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadPosCatalog } from "@/lib/pos-catalog";
import { barcodeLookup, commitSale, getLocations, getSettings } from "@/lib/api";
import type { Location, PosCatalogItem, PosCatalogUnit } from "@/lib/api";
import { bdt } from "@/lib/utils";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  Landmark,
  Pause,
  Play,
  Plus,
  Printer,
  ScanLine,
  Search,
  Smartphone,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";

// -- Bengali labels (phase 7) ------------------------------------------------

type Lang = "en" | "bn";
const STRINGS = {
  search: { en: "Search or scan name, SKU, barcode, IMEI…", bn: "নাম, SKU, বারকোড বা IMEI খুঁজুন…" },
  scanHint: { en: "Scan a barcode or IMEI — it goes straight to the cart", bn: "বারকোড বা IMEI স্ক্যান করুন — সরাসরি কার্টে যুক্ত হবে" },
  cart: { en: "Cart", bn: "কার্ট" },
  emptyCart: { en: "Tap a product to add it", bn: "যোগ করতে পণ্যে ট্যাপ করুন" },
  subtotal: { en: "Subtotal", bn: "সাবটোটাল" },
  discount: { en: "Discount", bn: "ছাড়" },
  total: { en: "Total", bn: "মোট" },
  paid: { en: "Paid", bn: "প্রদান" },
  change: { en: "Change", bn: "ফেরত" },
  remaining: { en: "Remaining", bn: "বাকি" },
  charge: { en: "Charge", bn: "নগদ গ্রহণ" },
  customer: { en: "Customer", bn: "ক্রেতা" },
  walkIn: { en: "Walk-in", bn: "সাধারণ" },
  chooseUnit: { en: "Choose the device", bn: "ডিভাইসটি বাছুন" },
  chooseUnitHint: { en: "Match the IMEI/serial against the device in hand", bn: "হাতের ডিভাইসের সাথে IMEI/সিরিয়াল মিলিয়ে নিন" },
  noStock: { en: "Out of stock", bn: "স্টক নেই" },
  held: { en: "Held", bn: "আটকে রাখা" },
  hold: { en: "Hold", bn: "রাখুন" },
  newSale: { en: "New sale", bn: "নতুন বিক্রি" },
  print: { en: "Print receipt", bn: "রসিদ প্রিন্ট" },
  saleComplete: { en: "Sale complete", bn: "বিক্রয় সম্পন্ন" },
  offline: { en: "Offline — showing the cached catalog; charges need internet", bn: "অফলাইন — সংরক্ষিত ক্যাটালগ দেখানো হচ্ছে; বিক্রয়ে ইন্টারনেট লাগবে" },
} as const;
const t = (key: keyof typeof STRINGS, lang: Lang) => STRINGS[key][lang];

const METHODS = [
  { id: "cash", label: { en: "Cash", bn: "ক্যাশ" }, icon: Banknote },
  { id: "bkash", label: { en: "bKash", bn: "বিকাশ" }, icon: Smartphone },
  { id: "nagad", label: { en: "Nagad", bn: "নগদ" }, icon: Smartphone },
  { id: "card", label: { en: "Card", bn: "কার্ড" }, icon: Landmark },
  { id: "bank", label: { en: "Bank", bn: "ব্যাংক" }, icon: Landmark },
] as const;

interface CartLine {
  key: string;
  variantId: number;
  unitId?: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  imei?: string | null;
  warrantyPolicyId?: number | null;
  categorySlug?: string | null;
}

interface HeldTicket {
  id: string;
  label: string;
  at: number;
  lines: CartLine[];
  customerName: string;
  customerPhone: string;
}

const HOLDS_KEY = "axiom-pos-v2-holds";

function loadHolds(): HeldTicket[] {
  try {
    return JSON.parse(localStorage.getItem(HOLDS_KEY) || "[]") as HeldTicket[];
  } catch {
    return [];
  }
}
function saveHolds(holds: HeldTicket[]) {
  localStorage.setItem(HOLDS_KEY, JSON.stringify(holds));
}

export default function PosV2Page() {
  const qc = useQueryClient();
  const [lang, setLang] = useState<Lang>("en");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: string; reference: string }[]>([]);
  const [unitSheet, setUnitSheet] = useState<PosCatalogItem | null>(null);
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: catalog = [], refetch: refetchCatalog } = useQuery({
    queryKey: ["pos-v2-catalog"],
    queryFn: async () => (await loadPosCatalog()).items,
  });
  const offline = useQuery({
    queryKey: ["pos-v2-offline"],
    queryFn: async () => (await loadPosCatalog()).offline,
    staleTime: 30_000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["dashboard", "locations"],
    queryFn: getLocations,
  });
  const { data: settings } = useQuery({
    queryKey: ["dashboard", "settings"],
    queryFn: getSettings,
  });

  useEffect(() => {
    setHeld(loadHolds());
  }, []);

  // -- derived -------------------------------------------------------------

  const cats = useMemo(
    () => ["All", ...new Set(catalog.map((c) => c.category).filter(Boolean) as string[])],
    [catalog],
  );

  const filtered = useMemo(
    () =>
      catalog.filter(
        (c) =>
          (tab === "All" || c.category === tab) &&
          (q === "" ||
            c.productName.toLowerCase().includes(q.toLowerCase()) ||
            c.variantName.toLowerCase().includes(q.toLowerCase()) ||
            c.sku.toLowerCase().includes(q.toLowerCase()) ||
            (c.barcode && c.barcode.includes(q))),
      ),
    [catalog, tab, q],
  );

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const parsedDiscount = parseFloat(discountInput || "0");
  const discount = Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? Math.round(parsedDiscount) : 0;
  const total = Math.max(0, subtotal - discount);
  const paid = payments.reduce((s, p) => s + (Number.isFinite(parseFloat(p.amount)) ? Math.round(parseFloat(p.amount)) : 0), 0);
  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);
  const canCharge = cart.length > 0 && remaining === 0 && !busy;

  const storeInfo = ((settings?.store_info ?? {}) as Record<string, any>);

  // -- cart actions --------------------------------------------------------

  const addQuantityLine = useCallback((item: PosCatalogItem) => {
    setCart((c) => {
      const existing = c.find((l) => l.variantId === item.variantId && !l.unitId);
      if (existing) {
        return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...c,
        {
          key: `v${item.variantId}`,
          variantId: item.variantId,
          name: item.productName,
          sku: item.sku,
          qty: 1,
          unitPrice: item.sellingPrice,
          warrantyPolicyId: item.warrantyPolicyId,
          categorySlug: item.categorySlug,
        },
      ];
    });
  }, []);

  const addUnitLine = useCallback((item: PosCatalogItem, unit: PosCatalogUnit) => {
    setCart((c) => {
      if (c.some((l) => l.unitId === unit.id)) return c;
      return [
        ...c,
        {
          key: `u${unit.id}`,
          variantId: item.variantId,
          unitId: unit.id,
          name: item.productName,
          sku: item.sku,
          qty: 1,
          unitPrice: unit.currentPrice ?? item.sellingPrice,
          imei: unit.imei1 ?? unit.imei2 ?? unit.serialNumber,
          warrantyPolicyId: item.warrantyPolicyId,
          categorySlug: item.categorySlug,
        },
      ];
    });
  }, []);

  const onTileClick = (item: PosCatalogItem) => {
    if (item.requiresUnit) {
      if (item.sellableAvailable <= 0) {
        toast.error(t("noStock", lang));
        return;
      }
      setUnitSheet(item);
    } else {
      if (item.available <= 0) {
        toast.error(t("noStock", lang));
        return;
      }
      addQuantityLine(item);
    }
  };

  const onSearchEnter = async () => {
    const code = q.trim();
    if (!code) return;
    try {
      const res = await barcodeLookup(code);
      if (res.match === "unit" && res.unit && res.variant) {
        const item = catalog.find((c) => c.variantId === res.variant!.id);
        if (item) {
          const unit = item.units.find((u) => u.id === res.unit!.id);
          if (unit && unit.sellable) {
            addUnitLine(item, unit);
            setQ("");
            return;
          }
          if (unit && !unit.sellable) {
            toast.error("FIFO stock order — sell the older batch first");
            return;
          }
        }
        // Unit not in the loaded catalog snapshot: add directly by lookup data.
        setCart((c) =>
          c.some((l) => l.unitId === res.unit!.id)
            ? c
            : [
                ...c,
                {
                  key: `u${res.unit!.id}`,
                  variantId: res.variant!.id,
                  unitId: res.unit!.id,
                  name: res.product?.name ?? res.variant!.name,
                  sku: res.variant!.sku,
                  qty: 1,
                  unitPrice: res.unit!.currentPrice ?? res.variant!.sellingPrice,
                  imei: res.unit!.imei1 ?? res.unit!.imei2 ?? res.unit!.serialNumber,
                  warrantyPolicyId: res.product?.warrantyPolicyId ?? null,
                  categorySlug: res.product?.categorySlug ?? null,
                },
              ],
        );
        setQ("");
      } else if (res.match === "variant" && res.variant) {
        const item = catalog.find((c) => c.variantId === res.variant!.id);
        if (item) {
          onTileClick(item);
          setQ("");
        } else {
          toast.error("Found in catalog sync — reload the POS to sell it");
        }
      } else if (res.match === "multi" && res.candidates?.length) {
        const items = res.candidates
          .map((c) => catalog.find((x) => x.variantId === c.variantId))
          .filter((x): x is PosCatalogItem => Boolean(x));
        if (items.length === 1) {
          onTileClick(items[0]);
          setQ("");
        } else if (items.length > 1) {
          toast.error(`${items.length} products share this code — pick from the tiles below`);
        }
      } else {
        toast.error("Not found");
      }
    } catch {
      toast.error("Lookup failed — check your connection");
    }
  };

  // -- hold / recall -------------------------------------------------------

  const holdSale = () => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: crypto.randomUUID(),
      label: `${t("held", lang)} ${held.length + 1}`,
      at: Date.now(),
      lines: cart,
      customerName,
      customerPhone,
    };
    const next = [...held, ticket];
    setHeld(next);
    saveHolds(next);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setDiscountInput("");
    setPayments([]);
  };

  const recallSale = (ticket: HeldTicket) => {
    const next = held.filter((h) => h.id !== ticket.id);
    setHeld(next);
    saveHolds(next);
    setCart(ticket.lines);
    setCustomerName(ticket.customerName);
    setCustomerPhone(ticket.customerPhone);
  };

  // -- charge --------------------------------------------------------------

  const charge = async () => {
    if (!canCharge) return;
    setBusy(true);
    try {
      const result = await commitSale({
        idempotencyKey: crypto.randomUUID(),
        channel: "pos",
        customer:
          customerName.trim() || customerPhone.trim()
            ? { name: customerName.trim() || t("walkIn", lang), phone: customerPhone.trim() || undefined }
            : undefined,
        locationId: locations.find((l: Location) => l.isDefault)?.name ?? locations[0]?.name,
        lines: cart.map((l) => ({
          variantId: l.variantId,
          unitId: l.unitId,
          quantity: l.qty,
          unitPrice: l.unitPrice,
          warrantyPolicyId: l.warrantyPolicyId,
        })),
        payments: payments.map((p) => ({
          method: p.method,
          amount: Math.round(parseFloat(p.amount) || 0),
          reference: p.reference.trim() || undefined,
        })),
      });

      // Receipt
      const policies = String(storeInfo.receiptPolicies || "")
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);
      const receipt: ReceiptData = {
        invoiceNumber: result.sale.invoiceNumber,
        date: new Date(result.sale.createdAt),
        barcodeNumber: result.sale.barcodeValue || result.sale.saleNumber,
        storeInfo: {
          name: storeInfo.name || "Your Shop",
          address: storeInfo.address || "",
          phone: storeInfo.phone || "",
          email: storeInfo.email || "",
          website: storeInfo.website || undefined,
          logo: storeInfo.logo || undefined,
        },
        customer: {
          name: customerName.trim() || t("walkIn", lang),
          phone: customerPhone.trim() || undefined,
        },
        items: cart.map((l, idx) => ({
          sl: idx + 1,
          description: l.name,
          unitPrice: l.unitPrice,
          qty: l.qty,
          total: l.unitPrice * l.qty,
          imei1: l.imei || undefined,
          categorySlug: l.categorySlug ?? undefined,
        })),
        totals: {
          subtotal,
          discount: discount > 0 ? discount : undefined,
          grandTotal: total,
          paid: result.sale.paidAmount,
          change: result.sale.changeAmount,
        },
        payments: payments.map((p) => ({
          method: p.method,
          amount: Math.round(parseFloat(p.amount) || 0),
          reference: p.reference.trim() || undefined,
        })),
        policies,
        headerText: storeInfo.receiptHeader || undefined,
        footerText: storeInfo.receiptFooter || undefined,
        copies: Number(storeInfo.receiptCopies) || 1,
      };

      setDone({ result, receipt, soldCart: cart });
      void qc.invalidateQueries({ queryKey: ["pos-v2-catalog"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "stats"] });
    } catch (e: any) {
      toast.error(e?.message || "Sale failed");
    } finally {
      setBusy(false);
    }
  };

  const resetSale = () => {
    setDone(null);
    setCart([]);
    setDiscountInput("");
    setCustomerName("");
    setCustomerPhone("");
    setPayments([]);
    setQ("");
    searchRef.current?.focus();
  };

  const printDone = () => {
    if (done) printReceipt(done.receipt);
  };

  // -- completed state -----------------------------------------------------

  const [done, setDone] = useState<null | {
    result: Awaited<ReturnType<typeof commitSale>>;
    receipt: ReceiptData;
    soldCart: CartLine[];
  }>(null);

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check size={22} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t("saleComplete", lang)}</h1>
        <div className="w-full border border-border bg-background p-4 text-sm">
          <Row label="Sale" value={done.result.sale.saleNumber} mono />
          <Row label="Invoice" value={done.result.sale.invoiceNumber} mono />
          <Row label={t("total", lang)} value={bdt(done.result.sale.totalAmount)} bold />
          <Row label={t("paid", lang)} value={bdt(done.result.sale.paidAmount)} />
          {done.result.sale.changeAmount > 0 && <Row label={t("change", lang)} value={bdt(done.result.sale.changeAmount)} />}
          <Row label="Verify" value={done.result.verificationCode} mono />
        </div>
        <div className="flex w-full gap-2">
          <button
            onClick={printDone}
            className="flex flex-1 items-center justify-center gap-1.5 border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-surface"
          >
            <Printer size={15} /> {t("print", lang)}
          </button>
          <button
            onClick={resetSale}
            className="flex-1 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("newSale", lang)}
          </button>
        </div>
      </div>
    );
  }

  // -- main layout ---------------------------------------------------------

  return (
    <div className="grid grid-cols-1 gap-3 lg:h-[calc(100dvh-145px)] lg:grid-cols-[1fr_400px]">
      {/* Left: search + tiles */}
      <div className="flex min-w-0 flex-col">
        <div className="mb-3 border border-border bg-background p-3">
          <div className="flex items-center gap-2 border border-border px-3 focus-within:border-primary">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSearchEnter();
              }}
              placeholder={t("search", lang)}
              className="h-11 w-full bg-background text-sm outline-none"
              autoFocus
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{t("scanHint", lang)}</span>
            <button
              onClick={() => setLang(lang === "en" ? "bn" : "en")}
              className="border border-border px-1.5 py-0.5 font-medium hover:text-foreground"
            >
              {lang === "en" ? "বাংলা" : "EN"}
            </button>
          </div>
          {offline.data && (
            <div className="mt-2 flex items-center gap-1.5 border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              <WifiOff size={12} /> {t("offline", lang)}
            </div>
          )}
        </div>

        {cats.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setTab(c)}
                className={
                  "px-2.5 py-1.5 text-xs " +
                  (tab === c
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground")
                }
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nothing matches"
              hint="Try a different name, SKU, or scan a barcode. Stock just received appears after a refresh."
              action={
                <button onClick={() => void refetchCatalog()} className="border border-border px-3 py-1.5 text-xs hover:bg-surface">
                  Refresh catalog
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((item) => {
                const out = item.requiresUnit ? item.sellableAvailable <= 0 : item.available <= 0;
                const stock = item.requiresUnit ? item.sellableAvailable : item.available;
                return (
                  <button
                    key={item.variantId}
                    onClick={() => onTileClick(item)}
                    disabled={out}
                    className={
                      "flex min-h-[92px] flex-col justify-between border p-3 text-left transition-colors " +
                      (out
                        ? "cursor-not-allowed border-border bg-surface opacity-50"
                        : "border-border bg-background hover:border-primary hover:bg-surface active:bg-surface")
                    }
                  >
                    <div>
                      <div className="line-clamp-2 text-sm font-medium leading-tight">{item.productName}</div>
                      {item.variantName !== item.productName && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{item.variantName}</div>
                      )}
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="text-sm font-semibold">{bdt(item.sellingPrice)}</span>
                      <span
                        className={
                          "text-[11px] " + (out ? "text-destructive" : stock <= 3 ? "text-amber-600" : "text-muted-foreground")
                        }
                      >
                        {out ? t("noStock", lang) : `${stock}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: cart */}
      <aside className="flex max-h-[80dvh] min-h-[380px] flex-col overflow-hidden border border-border bg-background lg:max-h-none lg:min-h-0 lg:h-[calc(100dvh-145px)]">
        {/* held tickets strip */}
        {held.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
            <Pause size={12} className="text-muted-foreground" />
            {held.map((h) => (
              <button
                key={h.id}
                onClick={() => recallSale(h)}
                className="flex items-center gap-1 border border-border px-2 py-1 text-xs hover:border-primary"
                title={new Date(h.at).toLocaleTimeString()}
              >
                <Play size={10} /> {h.label} · {h.lines.length}
              </button>
            ))}
          </div>
        )}

        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="flex items-center gap-4">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={`${t("customer", lang)} (${t("walkIn", lang)})`}
              className="h-9 w-full border-b border-transparent bg-transparent text-sm outline-none focus:border-border"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="01…"
              inputMode="tel"
              className="h-9 w-28 border-b border-transparent bg-transparent text-sm outline-none focus:border-border"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <EmptyState icon={ScanLine} title={t("emptyCart", lang)} />
          ) : (
            <ul className="divide-y divide-border">
              {cart.map((l) => (
                <li key={l.key} className="flex items-start gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    {l.imei && (
                      <div className="font-mono text-[11px] text-muted-foreground">{l.imei}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      {l.unitId ? (
                        <span className="text-xs text-muted-foreground">×1</span>
                      ) : (
                        <div className="flex items-center border border-border">
                          <button
                            onClick={() =>
                              setCart((c) =>
                                c
                                  .map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x))
                                  .filter((x) => x.qty > 0),
                              )
                            }
                            className="h-7 w-7 text-sm hover:bg-surface"
                            aria-label="Decrease"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm">{l.qty}</span>
                          <button
                            onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}
                            className="h-7 w-7 text-sm hover:bg-surface"
                            aria-label="Increase"
                          >
                            <Plus size={12} className="mx-auto" />
                          </button>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">× {bdt(l.unitPrice)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{bdt(l.unitPrice * l.qty)}</span>
                    <button
                      onClick={() => setCart((c) => c.filter((x) => x !== l))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* payment */}
        <div className="shrink-0 border-t border-border px-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("subtotal", lang)}</span>
            <span>{bdt(subtotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t("discount", lang)}</span>
            <input
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9]/, ""))}
              placeholder="0"
              inputMode="numeric"
              className="h-7 w-24 border border-border px-2 text-right text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>{t("total", lang)}</span>
            <span>{bdt(total)}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() =>
                  setPayments((prev) => {
                    if (prev.some((p) => p.method === m.id)) return prev;
                    const amount = remaining > 0 ? String(remaining) : "";
                    return [...prev, { method: m.id, amount, reference: "" }];
                  })
                }
                className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs hover:border-primary"
              >
                <m.icon size={12} /> {m.label[lang]}
              </button>
            ))}
            {cart.length > 0 && (
              <button
                onClick={holdSale}
                className="ml-auto flex items-center gap-1 border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pause size={12} /> {t("hold", lang)}
              </button>
            )}
          </div>

          {payments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {payments.map((p, idx) => {
                const m = METHODS.find((x) => x.id === p.method);
                return (
                  <div key={p.method} className="flex items-center gap-1.5">
                    <span className="w-14 text-xs font-medium">{m?.label[lang] ?? p.method}</span>
                    <input
                      value={p.amount}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value.replace(/[^0-9]/, "") } : x)),
                        )
                      }
                      inputMode="numeric"
                      placeholder="0"
                      className="h-8 w-24 border border-border px-2 text-right text-sm outline-none focus:border-primary"
                    />
                    {p.method !== "cash" && (
                      <input
                        value={p.reference}
                        onChange={(e) =>
                          setPayments((prev) => prev.map((x, i) => (i === idx ? { ...x, reference: e.target.value } : x)))
                        }
                        placeholder="TrxID"
                        className="h-8 min-w-0 flex-1 border border-border px-2 text-xs outline-none focus:border-primary"
                      />
                    )}
                    <button
                      onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove payment"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{paid > total ? t("change", lang) : t("remaining", lang)}</span>
            <span className={"font-semibold " + (paid >= total ? "text-primary" : "")}>
              {bdt(paid > total ? change : remaining)}
            </span>
          </div>

          <button
            onClick={() => void charge()}
            disabled={!canCharge}
            className="mt-2 h-12 w-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : `${t("charge", lang)} ${bdt(total)}`}
          </button>
          {cart.length > 0 && paid === 0 && (
            <button
              onClick={() => setConfirmClear(true)}
              className="mt-1 w-full py-1 text-[11px] text-muted-foreground hover:text-destructive"
            >
              Clear cart
            </button>
          )}
        </div>
      </aside>

      {/* unit picker sheet */}
      {unitSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setUnitSheet(null)}>
          <div
            className="max-h-[75dvh] w-full max-w-md overflow-hidden border border-border bg-background sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">{unitSheet.productName}</div>
              <div className="text-xs text-muted-foreground">{t("chooseUnitHint", lang)}</div>
            </div>
            <div className="max-h-[55dvh] overflow-y-auto">
              {unitSheet.units.filter((u) => u.sellable).length === 0 ? (
                <EmptyState icon={Smartphone} title={t("noStock", lang)} hint="All units are sold or FIFO-locked behind an older batch." />
              ) : (
                <ul className="divide-y divide-border">
                  {unitSheet.units
                    .filter((u) => u.sellable)
                    .map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => {
                            addUnitLine(unitSheet, u);
                            setUnitSheet(null);
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface"
                        >
                          <div>
                            <div className="font-mono text-sm">{u.imei1 ?? u.imei2 ?? u.serialNumber}</div>
                            {u.batchNumber && <div className="text-[11px] text-muted-foreground">Batch {u.batchNumber}</div>}
                          </div>
                          <span className="text-sm font-semibold">{bdt(u.currentPrice ?? unitSheet.sellingPrice)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear cart"
        description="Remove all items from the current sale?"
        confirmLabel="Clear"
        onConfirm={() => {
          setCart([]);
          setPayments([]);
          setDiscountInput("");
        }}
      />
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={(mono ? "font-mono text-xs " : "") + (bold ? "font-semibold" : "")}>{value}</span>
    </div>
  );
}
