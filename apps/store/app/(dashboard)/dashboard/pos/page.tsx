"use client";

/**
 * POS — the simplified "regular POS" (formerly POS v2, now the only till).
 *
 * One search/scan field, product tiles, guided IMEI step, ERP-style Enter
 * navigation, configurable payment methods (Settings → Payments) and
 * keyboard shortcuts (F1 for the cheat sheet). Shares the commit API and
 * receipt printer with the rest of the app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadPosCatalog } from "@/lib/pos-catalog";
import { barcodeLookup, commitSale, getLocations, getSettings, sessionToken } from "@/lib/api";
import type { Location, PosCatalogItem, PosCatalogUnit } from "@/lib/api";
import { posMethodsFromSettings, type PosMethod } from "@/lib/payment-methods";
import { bdt } from "@/lib/utils";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/dashboard/empty-state";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  ChevronDown,
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

// ── Bengali labels (Settings-independent UI language toggle) ────────────────

type Lang = "en" | "bn";
const STRINGS = {
  search: { en: "Search or scan name, SKU, barcode, IMEI…", bn: "নাম, SKU, বারকোড বা IMEI খুঁজুন…" },
  scanHint: { en: "Scan goes straight to the cart · Enter adds", bn: "স্ক্যান সরাসরি কার্টে যাবে · Enter যোগ করবে" },
  customer: { en: "Customer", bn: "ক্রেতা" },
  walkIn: { en: "Walk-in", bn: "সাধারণ" },
  mobile: { en: "Mobile", bn: "মোবাইল" },
  address: { en: "Address", bn: "ঠিকানা" },
  cart: { en: "Cart", bn: "কার্ট" },
  emptyCart: { en: "Tap a product to add it", bn: "যোগ করতে পণ্যে ট্যাপ করুন" },
  subtotal: { en: "Subtotal", bn: "সাবটোটাল" },
  discount: { en: "Discount", bn: "ছাড়" },
  total: { en: "Total", bn: "মোট" },
  paid: { en: "Paid", bn: "প্রদান" },
  change: { en: "Change", bn: "ফেরত" },
  remaining: { en: "Remaining", bn: "বাকি" },
  charge: { en: "Charge", bn: "নগদ গ্রহণ" },
  chooseUnit: { en: "Choose the device", bn: "ডিভাইসটি বাছুন" },
  chooseUnitHint: { en: "Match the IMEI/serial against the device in hand", bn: "হাতের ডিভাইসের সাথে IMEI/সিরিয়াল মিলিয়ে নিন" },
  noStock: { en: "Out of stock", bn: "স্টক নেই" },
  held: { en: "Held", bn: "আটকে রাখা" },
  hold: { en: "Hold", bn: "রাখুন" },
  newSale: { en: "New sale", bn: "নতুন বিক্রি" },
  print: { en: "Print receipt", bn: "রসিদ প্রিন্ট" },
  saleComplete: { en: "Sale complete", bn: "বিক্রয় সম্পন্ন" },
  offline: { en: "Offline — catalog is cached; charges need internet", bn: "অফলাইন — ক্যাটালগ সংরক্ষিত; বিক্রয়ে ইন্টারনেট লাগবে" },
  more: { en: "More", bn: "আরও" },
} as const;
const t = (key: keyof typeof STRINGS, lang: Lang) => STRINGS[key][lang];

const FALLBACK_METHODS: PosMethod[] = [
  { id: "cash", name: "Cash", active: true },
  { id: "bkash", name: "bKash", active: true },
  { id: "nagad", name: "Nagad", active: true },
  { id: "card", name: "Card", active: true },
  { id: "bank", name: "Bank", active: true },
];

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
  customerAddress: string;
}

const HOLDS_KEY = "axiom-pos-holds";

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

/** Payment method icon by id (fallback: bank icon for unknown/owner-added). */
function MethodIcon({ id }: { id: string }) {
  const size = 12;
  if (id === "cash") return <Banknote size={size} />;
  if (id === "bkash" || id === "nagad") return <Smartphone size={size} />;
  if (id === "card") return <Landmark size={size} />;
  return <Landmark size={size} />;
}

export default function PosPage() {
  const qc = useQueryClient();
  const [lang, setLang] = useState<Lang>("en");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [payments, setPayments] = useState<{ method: string; amount: string; reference: string }[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unitSheet, setUnitSheet] = useState<PosCatalogItem | null>(null);
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | {
    result: Awaited<ReturnType<typeof commitSale>>;
    receipt: ReceiptData;
  }>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const chargeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const { data: catalog = [], refetch: refetchCatalog } = useQuery({
    queryKey: ["pos-catalog"],
    queryFn: async () => (await loadPosCatalog()).items,
  });
  const offline = useQuery({
    queryKey: ["pos-offline"],
    queryFn: async () => (await loadPosCatalog()).offline,
    staleTime: 30_000,
  });
  const { data: locations = [] } = useQuery({ queryKey: ["dashboard", "locations"], queryFn: getLocations });
  const { data: settings } = useQuery({ queryKey: ["dashboard", "settings"], queryFn: getSettings });

  useEffect(() => {
    setHeld(loadHolds());
  }, []);

  const storeInfo = (settings?.store_info ?? {}) as Record<string, any>;
  const methods = posMethodsFromSettings(settings?.pos_methods);
  const activeMethods = methods.filter((m) => m.active);
  const cashMethod = activeMethods.find((m) => m.id === "cash") ?? null;
  const otherMethods = activeMethods.filter((m) => m.id !== "cash");

  // ── derived ───────────────────────────────────────────────────────────────

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
  const paid = payments.reduce(
    (s, p) => s + (Number.isFinite(parseFloat(p.amount)) ? Math.round(parseFloat(p.amount)) : 0),
    0,
  );
  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);
  const canCharge = cart.length > 0 && remaining === 0 && !busy;

  // ── cart actions ──────────────────────────────────────────────────────────

  const addQuantityLine = useCallback((item: PosCatalogItem) => {
    setCart((c) => {
      const existing = c.find((l) => l.variantId === item.variantId && !l.unitId);
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
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
    const out = item.requiresUnit ? item.sellableAvailable <= 0 : item.available <= 0;
    if (out) {
      toast.error(t("noStock", lang));
      return;
    }
    if (item.requiresUnit) setUnitSheet(item);
    else addQuantityLine(item);
  };

  const onSearchEnter = async () => {
    const code = q.trim();
    if (!code) return;
    try {
      const res = await barcodeLookup(code);
      if (res.match === "unit" && res.unit && res.variant) {
        const item = catalog.find((c) => c.variantId === res.variant!.id);
        const unit = item?.units.find((u) => u.id === res.unit!.id);
        if (unit && !unit.sellable) {
          toast.error("FIFO stock order — sell the older batch first");
          return;
        }
        if (item && unit) {
          addUnitLine(item, unit);
          setQ("");
          return;
        }
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
          toast.error("Found outside the loaded catalog — refresh to sell it");
        }
      } else if (res.match === "multi" && res.candidates?.length) {
        const items = res.candidates
          .map((c) => catalog.find((x) => x.variantId === c.variantId))
          .filter((x): x is PosCatalogItem => Boolean(x));
        if (items.length === 1) {
          onTileClick(items[0]);
          setQ("");
        } else if (items.length > 1) {
          toast.error(`${items.length} products share this code — pick from the tiles`);
        }
      } else {
        toast.error("Not found");
      }
    } catch {
      toast.error("Lookup failed — check your connection");
    }
  };

  // ── hold / recall ─────────────────────────────────────────────────────────

  const holdSale = useCallback(() => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: crypto.randomUUID(),
      label: `${t("held", lang)} ${held.length + 1}`,
      at: Date.now(),
      lines: cart,
      customerName,
      customerPhone,
      customerAddress,
    };
    const next = [...held, ticket];
    setHeld(next);
    saveHolds(next);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setDiscountInput("");
    setPayments([]);
  }, [cart, held, customerName, customerPhone, customerAddress, discountInput, lang]);

  const recallSale = useCallback((ticket: HeldTicket) => {
    const next = loadHolds().filter((h) => h.id !== ticket.id);
    setHeld(next);
    saveHolds(next);
    setCart(ticket.lines);
    setCustomerName(ticket.customerName);
    setCustomerPhone(ticket.customerPhone);
    setCustomerAddress(ticket.customerAddress);
  }, []);

  // ── charge ────────────────────────────────────────────────────────────────

  const charge = async () => {
    if (!canCharge) return;
    setBusy(true);
    try {
      const result = await commitSale({
        idempotencyKey: crypto.randomUUID(),
        channel: "pos",
        customer:
          customerName.trim() || customerPhone.trim() || customerAddress.trim()
            ? {
                name: customerName.trim() || t("walkIn", lang),
                phone: customerPhone.trim() || undefined,
                email: undefined,
              }
            : undefined,
        locationId: locations.find((l) => l.isDefault)?.name ?? locations[0]?.name,
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
          address: customerAddress || storeInfo.address || "",
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
      setDone({ result, receipt });
      void qc.invalidateQueries({ queryKey: ["pos-catalog"] });
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
    setCustomerAddress("");
    setPayments([]);
    setQ("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ── keyboard shortcuts (researched POS set) ───────────────────────────────
  // F2 search · F3 customer · F4 charge · F6 hold · F7 recall held ·
  // F1 / ? cheat sheet · Esc close overlays. Typing is never interrupted.

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

      if (e.key === "Escape") {
        setUnitSheet(null);
        setShortcutsOpen(false);
        setMoreOpen(false);
        (el as HTMLElement)?.blur?.();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        customerRef.current?.focus();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (canCharge) void charge();
        else chargeRef.current?.focus();
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        holdSale();
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        const latest = [...held].sort((a, b) => b.at - a.at);
        if (latest[0]) recallSale(latest[0]);
        return;
      }
      if (e.key === "F1" || (e.key === "?" && !typing)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      void typing;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── ERP Enter navigation: Enter advances to the next input ────────────────

  const erpEnterNav = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    if (target.dataset.noEnterNav) return; // search field: Enter means lookup
    const type = (target as HTMLInputElement).type;
    if (type === "button" || type === "submit") return;
    e.preventDefault();
    const scope = (e.currentTarget as HTMLElement) ?? document;
    const focusables = Array.from(
      scope.querySelectorAll<HTMLElement>("input:not([type='hidden']):not([disabled]), select:not([disabled])"),
    ).filter((el) => el.offsetParent !== null && !el.dataset.noEnterNav);
    const idx = focusables.indexOf(target);
    const next = focusables[idx + 1];
    if (next) {
      next.focus();
      if (next instanceof HTMLInputElement && ["text", "search", "tel", "number"].includes(next.type)) next.select();
    } else {
      target.blur();
      chargeRef.current?.focus();
    }
  };

  // ── completed state ───────────────────────────────────────────────────────

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
            onClick={() => printReceipt(done.receipt)}
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

  // ── main layout ───────────────────────────────────────────────────────────

  return (
    <div
      className="grid grid-cols-1 gap-3 lg:h-[calc(100dvh-145px)] lg:grid-cols-[1fr_400px]"
      onKeyDown={erpEnterNav}
    >
      {/* Left: search + tiles */}
      <div className="flex min-w-0 flex-col">
        {/* Single-border search bar: icon + input live in the one field */}
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 border border-border bg-background px-3 focus-within:border-primary">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onSearchEnter();
                }
              }}
              placeholder={t("search", lang)}
              className="h-full w-full bg-background text-sm outline-none"
              autoFocus
              data-no-enter-nav
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear" className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "bn" : "en")}
            className="h-11 shrink-0 border border-border px-3 text-xs font-medium hover:bg-surface"
            title="Switch language"
          >
            {lang === "en" ? "বাংলা" : "EN"}
          </button>
        </div>
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{t("scanHint", lang)}</span>
          <button onClick={() => setShortcutsOpen(true)} className="underline hover:text-foreground">
            Shortcuts (F1)
          </button>
        </div>
        {offline.data && (
          <div className="mb-2 flex items-center gap-1.5 border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
            <WifiOff size={12} /> {t("offline", lang)}
          </div>
        )}

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
                      <span className={"text-[11px] " + (out ? "text-destructive" : stock <= 3 ? "text-amber-600" : "text-muted-foreground")}>
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

      {/* Right: customer → cart → payment */}
      <aside className="flex max-h-[85dvh] min-h-[380px] flex-col overflow-hidden border border-border bg-background lg:max-h-none lg:min-h-0 lg:h-[calc(100dvh-145px)]">
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

        {/* Customer: labeled fields stacked vertically + address */}
        <div className="shrink-0 space-y-2 border-b border-border px-3 py-2.5">
          <div className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{t("customer", lang)}</div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground" htmlFor="pos-cust-name">
              {t("customer", lang)} — {t("walkIn", lang)}
            </label>
            <input
              id="pos-cust-name"
              ref={customerRef}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-9 w-full border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground" htmlFor="pos-cust-phone">
              {t("mobile", lang)}
            </label>
            <input
              id="pos-cust-phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              inputMode="tel"
              placeholder="01…"
              className="h-9 w-full border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-muted-foreground" htmlFor="pos-cust-address">
              {t("address", lang)}
            </label>
            <input
              id="pos-cust-address"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              className="h-9 w-full border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
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
                    {l.imei && <div className="font-mono text-[11px] text-muted-foreground">{l.imei}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      {l.unitId ? (
                        <span className="text-xs text-muted-foreground">×1</span>
                      ) : (
                        <div className="flex items-center border border-border">
                          <button
                            onClick={() =>
                              setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))
                            }
                            className="h-7 w-7 text-sm hover:bg-surface"
                            aria-label="Decrease"
                          >
                            −
                          </button>
                          <span className="w-7 text-center text-sm">{l.qty}</span>
                          <button
                            onClick={() => setCart((c) => c.map((x) => (x === l ? { ...x, qty: x.qty + 1 } : x)))}
                            className="h-7 w-7 hover:bg-surface"
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
              onChange={(e) => setDiscountInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="0"
              inputMode="numeric"
              className="h-7 w-24 border border-border px-2 text-right text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>{t("total", lang)}</span>
            <span>{bdt(total)}</span>
          </div>

          {/* Cash always visible under discount; the rest in a dropdown */}
          <div className="relative mt-2 flex items-center gap-1.5" ref={moreRef}>
            {cashMethod && (
              <button
                onClick={() =>
                  setPayments((prev) =>
                    prev.some((p) => p.method === "cash")
                      ? prev
                      : [...prev, { method: "cash", amount: remaining > 0 ? String(remaining) : "", reference: "" }],
                  )
                }
                className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs hover:border-primary"
              >
                <Banknote size={12} /> {cashMethod.name}
              </button>
            )}
            <div className="relative" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                disabled={otherMethods.length === 0}
                className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs hover:border-primary disabled:opacity-40"
              >
                {t("more", lang)} <ChevronDown size={12} />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute bottom-full left-0 z-30 mb-1 w-40 border border-border bg-background py-1 shadow-md"
                >
                  {otherMethods.map((m) => (
                    <button
                      key={m.id}
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        setPayments((prev) =>
                          prev.some((p) => p.method === m.id)
                            ? prev
                            : [...prev, { method: m.id, amount: remaining > 0 ? String(remaining) : "", reference: "" }],
                        );
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface"
                    >
                      <MethodIcon id={m.id} /> {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
              {payments.map((p, idx) => (
                <div key={p.method} className="flex items-center gap-1.5">
                  <span className="w-14 text-xs font-medium">{methods.find((m) => m.id === p.method)?.name ?? p.method}</span>
                  <input
                    value={p.amount}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value.replace(/[^0-9]/g, "") } : x)),
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
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{paid > total ? t("change", lang) : t("remaining", lang)}</span>
            <span className={"font-semibold " + (paid >= total ? "text-primary" : "")}>
              {bdt(paid > total ? change : remaining)}
            </span>
          </div>

          <button
            ref={chargeRef}
            onClick={() => void charge()}
            disabled={!canCharge}
            className="mt-2 h-12 w-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : `${t("charge", lang)} ${bdt(total)}`}
          </button>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>F2 search · F3 customer · F4 charge · F6 hold · F1 help</span>
            {cart.length > 0 && paid === 0 && (
              <button onClick={() => setConfirmClear(true)} className="hover:text-destructive">
                Clear cart
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* unit picker sheet */}
      {unitSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setUnitSheet(null)}>
          <div
            className="max-h-[75dvh] w-full max-w-md overflow-hidden border border-border bg-background sm:rounded-none"
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

      {/* shortcuts cheat sheet */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShortcutsOpen(false)}>
          <div className="w-full max-w-md border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Keyboard shortcuts</h3>
              <button onClick={() => setShortcutsOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X size={15} />
              </button>
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {[
                  ["F2", "Focus search / scan"],
                  ["Enter (in search)", "Add scanned item to cart"],
                  ["F3", "Customer name"],
                  ["Enter", "Next field"],
                  ["F4", "Charge"],
                  ["F6", "Hold current sale"],
                  ["F7", "Recall latest held sale"],
                  ["F1 or ?", "This cheat sheet"],
                  ["Esc", "Close dialogs"],
                ].map(([k, d]) => (
                  <tr key={k} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-3">
                      <kbd className="border border-border px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                    </td>
                    <td className="py-1.5 text-xs text-muted-foreground">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
