"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { useBarcodeScanner } from "@/lib/scanner";
import {
  barcodeLookup,
  commitSale,
  type CommitSaleResult,
  type PosCatalogItem,
  type PosCatalogUnit,
} from "@/lib/api";
import { loadPosCatalog } from "@/lib/pos-catalog";
import { useLocations, useSessionScope } from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import { printReceipt, type ReceiptData } from "@/lib/receipt";
import { PAYMENT_METHODS, METHOD_LABELS, type PaymentMethodId } from "@/lib/payment-methods";
import { WarrantySelector } from "@/components/warranty/warranty-selector";
import {
  Plus,
  Minus,
  Trash2,
  User,
  ScanLine,
  CheckCircle2,
  RotateCcw,
  WifiOff,
  ChevronDown,
  Calendar,
  Lock,
  Unlock,
  X,
} from "lucide-react";

interface CartLine {
  key: string;
  variantId: number;
  unitId: string | null;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number; // whole BDT
  imei: string | null;
  /** Receive batch a scanned unit came from (shown for FIFO transparency). */
  batchNumber: string | null;
  warrantyPolicyId: number | null;
  /** Taxonomy slug — drives the pre-owned net-price receipt. */
  categorySlug: string | null;
}

/** Proportional share of the sale-level discount for one cart line — the same
 * math the commit payload uses, so the receipt can fold a pre-owned line's
 * discount into its printed price without drifting from what was committed. */
function lineDiscountFor(
  line: { unitPrice: number; qty: number },
  subtotal: number,
  discount: number,
): number {
  if (subtotal <= 0 || discount <= 0) return 0;
  return Math.round(((line.unitPrice * line.qty) / subtotal) * discount);
}

interface ProductGroup {
  productId: string;
  productName: string;
  category: string;
  variants: PosCatalogItem[];
  available: number;
  priceLabel: string;
  warranty: string;
  single: PosCatalogItem | null;
}

interface VariantPicker {
  productId: string;
  productName: string;
  variants: PosCatalogItem[];
  cursor: number;
}

/** Today's local date as `YYYY-MM-DD` for the optional backdate field. */
function todayInput() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function POS() {
  const [offline, setOffline] = useState(false);
  const { data: locations = [] } = useLocations();
  const { data: me } = useSessionScope();
  const { data: settings } = useSettings();
  const scopedLocation = me?.isScoped ? (me.storeLocation ?? null) : null;
  // "" = all locations; picking a warehouse scopes availability + stock checks.
  const [locName, setLocName] = useState("");

  // Scoped staff (managers/salesmen) always sell from their own warehouse.
  useEffect(() => {
    if (scopedLocation) setLocName(scopedLocation);
  }, [scopedLocation]);
  const { data: catalog = [], refetch: refetchCatalog } = useQuery({
    queryKey: ["pos-catalog", locName],
    queryFn: async () => {
      const res = await loadPosCatalog(locName || undefined);
      setOffline(res.offline);
      return res.items;
    },
  });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [saleDate, setSaleDate] = useState(() => todayInput());
  const [discountInput, setDiscountInput] = useState("0");
  const [paymentLines, setPaymentLines] = useState<
    { id: string; method: PaymentMethodId; amount: string; reference: string }[]
  >([]);
  const [methodOpen, setMethodOpen] = useState(false);
  const [methodCursor, setMethodCursor] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitSaleResult | null>(null);
  const [completedSale, setCompletedSale] = useState<{
    cart: CartLine[];
    customerName: string;
    customerPhone: string;
    payments: { method: string; amount: number; reference?: string }[];
    discount: number;
    change: number;
    subtotal: number;
    total: number;
  } | null>(null);

  const [picker, setPicker] = useState<VariantPicker | null>(null);
  // Always-confirm unit picker for serialized sales: a product-level add
  // (product label scan, search, tap) opens this so the seller matches the
  // on-screen IMEI/serial list against the physical device before the sale
  // pins a unit. Unit-label scans bypass it — they already identify the unit.
  const [unitPicker, setUnitPicker] = useState<{
    productName: string;
    variant: PosCatalogItem;
    cursor: number;
  } | null>(null);
  const [expandedImeis, setExpandedImeis] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const addPaymentBtnRef = useRef<HTMLButtonElement>(null);
  const methodWrapRef = useRef<HTMLDivElement>(null);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const refRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const cats = useMemo(
    () => ["All", ...new Set(catalog.map((c) => c.category).filter(Boolean) as string[])],
    [catalog],
  );

  const filtered = useMemo(
    () =>
      catalog.filter(
        (c) =>
          (tab === "All" || c.category === tab) &&
          c.available > 0 &&
          (q === "" ||
            c.productName.toLowerCase().includes(q.toLowerCase()) ||
            c.variantName.toLowerCase().includes(q.toLowerCase()) ||
            c.sku.toLowerCase().includes(q.toLowerCase()) ||
            (c.barcode && c.barcode.toLowerCase().includes(q.toLowerCase())) ||
            c.units.some(
              (u) =>
                (u.imei1 && u.imei1.toLowerCase().includes(q.toLowerCase())) ||
                (u.imei2 && u.imei2.toLowerCase().includes(q.toLowerCase())) ||
                (u.serialNumber && u.serialNumber.toLowerCase().includes(q.toLowerCase())),
            )),
      ),
    [q, tab, catalog],
  );

  type SortKey = "name" | "price" | "stock";
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case "price":
          return (a.sellingPrice - b.sellingPrice) * dir;
        case "stock":
          return (a.available - b.available) * dir;
        default:
          return (
            `${a.productName} ${a.variantName}`.localeCompare(`${b.productName} ${b.variantName}`) *
            dir
          );
      }
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function SortArrow({ column }: { column: SortKey }) {
    if (sort.key !== column) return null;
    return <span className="ml-1">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  }

  // Group catalog by product: a product with a single variant adds on tap, a
  // product with multiple variants opens the picker modal.
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        variants: PosCatalogItem[];
        available: number;
      }
    >();
    for (const it of sorted) {
      let g = map.get(it.productId);
      if (!g) {
        g = {
          productId: it.productId,
          productName: it.productName,
          category: it.category ?? "",
          variants: [],
          available: 0,
        };
        map.set(it.productId, g);
      }
      g.variants.push(it);
      g.available += it.available;
    }
    return [...map.values()].map((g) => {
      const prices = g.variants.map((v) => v.sellingPrice);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return {
        ...g,
        priceLabel: min === max ? bdt(min) : `${bdt(min)} – ${bdt(max)}`,
        warranty: g.variants[0].warranty ?? "—",
        single: g.variants.length === 1 ? g.variants[0] : null,
      };
    });
  }, [sorted]);

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  // Guard against non-numeric/negative input: "abc" -> NaN, "-5" would inflate
  // the total. Treat both as no discount instead of charging ৳NaN.
  const parsedDiscount = parseFloat(discountInput || "0");
  const discountPoisha = Number.isFinite(parsedDiscount) && parsedDiscount > 0 ? Math.round(parsedDiscount) : 0;
  const total = Math.max(0, subtotal - discountPoisha);
  const paidPoisha = paymentLines.reduce(
    (s, l) => s + (Math.round(parseFloat(l.amount || "0")) || 0),
    0,
  );
  const change = Math.max(0, paidPoisha - total);
  const remaining = Math.max(0, total - paidPoisha);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }

  function addVariantLine(
    variantId: number,
    name: string,
    sku: string,
    unitPrice: number,
    warrantyPolicyId: number | null,
    categorySlug: string | null,
  ) {
    setCart((c) => {
      const existing = c.find((l) => l.variantId === variantId && !l.unitId);
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...c,
        {
          key: `v${variantId}`,
          variantId,
          unitId: null,
          name,
          sku,
          qty: 1,
          unitPrice,
          imei: null,
          batchNumber: null,
          warrantyPolicyId,
          categorySlug,
        },
      ];
    });
  }

  // Add one physical unit (keyed by unitId) to the cart.
  function addUnitLine(item: PosCatalogItem, u: PosCatalogUnit) {
    setCart((c) => {
      if (c.some((l) => l.unitId === u.id)) return c;
      return [
        ...c,
        {
          key: `u${u.id}`,
          variantId: item.variantId,
          unitId: u.id,
          name: item.productName,
          sku: item.sku,
          qty: 1,
          unitPrice: u.currentPrice ?? item.sellingPrice,
          imei: u.imei1 ?? u.imei2 ?? u.serialNumber,
          batchNumber: u.batchNumber ?? null,
          warrantyPolicyId: item.warrantyPolicyId,
          categorySlug: item.categorySlug ?? null,
        },
      ];
    });
  }

  async function handleScan(code: string) {
    try {
      const res = await barcodeLookup(code);
      if (res.match === "unit" && res.unit && res.variant) {
        // A unit scan identifies the exact physical unit — it is its own
        // confirmation, so close the always-confirm unit picker if open.
        setUnitPicker(null);
        // FIFO lock: a newer batch can't be sold until the older one is gone.
        if (res.sellable === false) {
          const blocking = res.blockedByBatch;
          showFlash(
            blocking
              ? `Batch ${blocking.batchNumber} must sell first (${blocking.available} in stock) — this unit is from a newer batch`
              : "This unit is from a newer batch — sell the older batch first",
          );
          return;
        }
        if (cart.some((l) => l.unitId === res.unit!.id)) {
          showFlash("This unit is already in the cart");
          return;
        }
        const imei = res.unit.imei1 ?? res.unit.imei2 ?? res.unit.serialNumber;
        setCart((c) => [
          ...c,
          {
            key: `u${res.unit!.id}`,
            variantId: res.variant!.id,
            unitId: res.unit!.id,
            name: res.product?.name ?? res.variant!.name,
            sku: res.variant!.sku,
            qty: 1,
            unitPrice: res.unit!.currentPrice ?? res.variant!.sellingPrice,
            imei,
            batchNumber: res.batch?.batchNumber ?? null,
            warrantyPolicyId: res.product?.warrantyPolicyId ?? null,
            categorySlug: res.product?.categorySlug ?? null,
          },
        ]);
        setQ("");
      } else if (res.match === "variant" && res.variant) {
        // Product-label scan / typed barcode for a serialized item now routes
        // through addItem: the always-confirm unit picker opens so the seller
        // pins the physical unit before the sale. If the item isn't in the
        // loaded catalog, fall back to a FIFO-picked line so the scan works.
        const item = catalog.find((x) => x.variantId === res.variant!.id);
        if (item) {
          addItem(item);
        } else {
          addVariantLine(
            res.variant.id,
            res.variant.name,
            res.variant.sku,
            res.variant.sellingPrice,
            res.product?.warrantyPolicyId ?? null,
            res.product?.categorySlug ?? null,
          );
        }
        setQ("");
      } else if (res.match === "multi" && res.candidates?.length) {
        // Legacy duplicate EANs: the scanned code lives on several products.
        // Open the product picker pre-filtered to the matches; serialized
        // picks still go through the unit picker afterwards.
        const catItems = res.candidates
          .map((c) => catalog.find((x) => x.variantId === c.variantId))
          .filter((x): x is PosCatalogItem => Boolean(x));
        if (catItems.length === 1) {
          addItem(catItems[0]);
        } else if (catItems.length > 0) {
          setPicker({
            productId: String(res.candidates[0].variantId),
            productName: "Scan matched multiple products",
            variants: catItems,
            cursor: 0,
          });
        } else {
          showFlash("Barcode not found");
        }
      } else {
        showFlash("Barcode not found");
      }
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Barcode lookup failed");
    }
  }

  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;
  const scanner = useBarcodeScanner({ autoFocus: false });
  useEffect(() => {
    scanner.onScan((ev) => {
      void handleScanRef.current(ev.code);
      scanner.clear();
    });
  }, [scanner]);

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
    // Focus the new line's amount field after it renders.
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

  // Re-validate the cart when the warehouse selection changes: items with no
  // stock at the newly selected warehouse (and scanned units, which physically
  // live at the previous warehouse) are removed so the charge never fails late.
  const prevLocRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevLocRef.current === null) {
      prevLocRef.current = locName;
      return;
    }
    const changed = prevLocRef.current !== locName;
    prevLocRef.current = locName;
    if (!changed || cart.length === 0) return;
    const removed: string[] = [];
    const kept = cart.filter((l) => {
      if (l.unitId) {
        removed.push(l.name);
        return false;
      }
      const item = catalog.find((x) => x.variantId === l.variantId);
      const ok = !!item && item.available > 0;
      if (!ok) removed.push(l.name);
      return ok;
    });
    if (removed.length) {
      setCart(kept);
      showFlash(`Warehouse changed — removed from cart: ${[...new Set(removed)].join(", ")}`);
    }
  }, [locName, catalog, cart]);

  function addItem(item: PosCatalogItem) {
    if (item.available <= 0) {
      showFlash("Out of stock");
      return;
    }
    // Serialized products: always confirm the physical unit before the sale
    // pins one — the seller matches the on-screen IMEI/serial list against
    // the device in hand (the "Always confirm" policy). Unit-label scans
    // bypass this in handleScan: they already identify the exact unit.
    if (item.requiresUnit) {
      const sellableUnits = item.units.filter((u) => u.sellable);
      if (sellableUnits.length === 0) {
        showFlash("No sellable units — an older batch must sell first");
        return;
      }
      setQ("");
      setUnitPicker({ productName: item.productName, variant: item, cursor: 0 });
      return;
    }
    // Accessories have no unit to confirm — a silent cart update reads as a
    // dead click, so say what happened.
    const qty = (cart.find((l) => l.variantId === item.variantId && !l.unitId)?.qty ?? 0) + 1;
    addVariantLine(
      item.variantId,
      item.productName,
      item.sku,
      item.sellingPrice,
      item.warrantyPolicyId,
      item.categorySlug ?? null,
    );
    setQ("");
    showFlash(`Added ${item.productName} ×${qty}`);
  }
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  function onGroupClick(g: ProductGroup) {
    if (g.single) {
      addItem(g.single);
      return;
    }
    // Typing an exact SKU means "I know which variant" — add it directly.
    const exact = q.trim().toLowerCase();
    if (exact) {
      const hit = g.variants.find((v) => v.sku.toLowerCase() === exact);
      if (hit) {
        addItem(hit);
        return;
      }
    }
    setPicker({
      productId: g.productId,
      productName: g.productName,
      variants: g.variants,
      cursor: 0,
    });
  }

  function closePicker() {
    setPicker(null);
  }

  function pickVariant(v: PosCatalogItem) {
    addItem(v);
    closePicker();
  }

  function closeUnitPicker() {
    setUnitPicker(null);
  }

  function pickUnit(u: PosCatalogUnit) {
    if (!unitPicker) return;
    addUnitLine(unitPicker.variant, u);
    closeUnitPicker();
  }

  function changeQty(line: CartLine, delta: number) {
    setCart((c) =>
      c.map((l) => (l === line ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0),
    );
  }

  async function charge() {
    if (cart.length === 0) {
      showFlash("Cart is empty");
      return;
    }
    if (paidPoisha < total) {
      showFlash("Paid amount is less than the total");
      return;
    }
    setCommitting(true);
    const payments = paymentLines.map((l) => ({
      method: l.method,
      amount: Math.round(parseFloat(l.amount || "0")) || 0,
      reference: l.reference.trim() || undefined,
    }));
    try {
      const res = await commitSale({
        idempotencyKey: crypto.randomUUID(),
        channel: "POS",
        locationId: locName || undefined,
        // Backdating is opt-in: only sent when the date differs from today.
        soldAt: saleDate && saleDate !== todayInput() ? saleDate : undefined,
        customer: { name: customerName.trim() || "Walk-in", phone: customerPhone.trim() || "" },
        lines: cart.map((l) => {
          const lineDiscount = lineDiscountFor(l, subtotal, discountPoisha);
          const baseLine = l.unitId
            ? {
                unitId: l.unitId,
                quantity: 1,
                unitPrice: l.unitPrice,
                discountAmount: lineDiscount,
              }
            : {
                variantId: l.variantId,
                quantity: l.qty,
                unitPrice: l.unitPrice,
                discountAmount: lineDiscount,
              };
          return {
            ...baseLine,
            warrantyPolicyId: l.warrantyPolicyId,
          };
        }),
        payments,
      });
      setResult(res);
      setCompletedSale({
        cart: [...cart],
        customerName: customerName.trim() || "Walk-in",
        customerPhone: customerPhone.trim() || "",
        payments,
        discount: discountPoisha,
        change,
        subtotal,
        total,
      });
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscountInput("0");
      setPaymentLines([]);
      setSaleDate(todayInput());
      setMethodOpen(false);
      void refetchCatalog();
    } catch (e) {
      showFlash(e instanceof Error ? e.message : "Charge failed");
    } finally {
      setCommitting(false);
    }
  }
  const chargeRef = useRef(charge);
  chargeRef.current = charge;

  // Keyboard navigation inside the variant picker: ↑↓ move, Enter adds, Esc closes.
  useEffect(() => {
    if (!picker) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setPicker((p) => (p ? { ...p, cursor: (p.cursor + 1) % p.variants.length } : p));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setPicker((p) =>
          p ? { ...p, cursor: (p.cursor - 1 + p.variants.length) % p.variants.length } : p,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const v = picker.variants[picker.cursor];
        if (v) addItemRef.current(v);
        closePicker();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePicker();
      }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [picker]);

  // Keyboard navigation inside the unit picker (same keys as variant picker):
  // ↑↓ move, Enter adds the highlighted unit, Esc closes.
  useEffect(() => {
    if (!unitPicker) return;
    const sellable = unitPicker.variant.units.filter((u) => u.sellable);
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setUnitPicker((p) => (p ? { ...p, cursor: (p.cursor + 1) % sellable.length } : p));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setUnitPicker((p) =>
          p ? { ...p, cursor: (p.cursor - 1 + sellable.length) % sellable.length } : p,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const u = sellable[unitPicker.cursor];
        closeUnitPicker();
        if (u) addUnitLine(unitPicker.variant, u);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeUnitPicker();
      }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [unitPicker]);

  // Dedicated shortcuts (capture phase so the barcode scanner can't swallow them):
  // Ctrl/⌘+K or "/" → search · Ctrl/⌘+P → paid amount · Ctrl/⌘+Enter or F4 → charge.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (picker || unitPicker) return; // a picker owns the keyboard while open
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopPropagation();
        searchRef.current?.focus();
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        e.stopPropagation();
        addPaymentBtnRef.current?.focus();
        setMethodCursor(0);
        setMethodOpen(true);
      } else if ((mod && e.key === "Enter") || e.key === "F4") {
        e.preventDefault();
        e.stopPropagation();
        chargeRef.current();
      } else if (e.key === "/" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        e.stopPropagation();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [picker, unitPicker]);

  function onSearchEnter() {
    if (groups.length === 1) {
      const g = groups[0];
      if (g.single) addItem(g.single);
      else
        setPicker({
          productId: g.productId,
          productName: g.productName,
          variants: g.variants,
          cursor: 0,
        });
    } else if (groups.length === 0) {
      showFlash("No matching product");
    } else {
      showFlash("Be more specific — matches multiple products");
    }
  }

  function handlePrintReceipt() {
    if (!result || !completedSale || !settings) return;

    const storeInfo = (settings?.store_info ?? {}) as Record<string, any>;
    const policies = (storeInfo.receiptPolicies || "")
      .split("\n")
      .map((line: string) => line.trim())
      .filter(Boolean);

    const receiptData: ReceiptData = {
      invoiceNumber: result.sale.invoiceNumber,
      date: new Date(result.sale.createdAt),
      barcodeNumber: result.sale.barcodeValue || result.sale.saleNumber,
      storeInfo: {
        name: storeInfo.name || "Your Shop",
        address: storeInfo.address || "Dhaka, Bangladesh",
        phone: storeInfo.phone || "",
        email: storeInfo.email || "",
        website: storeInfo.website || undefined,
        logo: storeInfo.logo || undefined,
      },
      customer: {
        name: completedSale.customerName,
        phone: completedSale.customerPhone || undefined,
      },
      items: completedSale.cart.map((item, idx) => ({
        sl: idx + 1,
        description: item.name,
        unitPrice: item.unitPrice,
        qty: item.qty,
        total: item.unitPrice * item.qty,
        imei1: item.imei || undefined,
        categorySlug: item.categorySlug ?? undefined,
        discountAmount: lineDiscountFor(item, completedSale.subtotal, completedSale.discount),
      })),
      totals: {
        subtotal: completedSale.subtotal,
        discount: completedSale.discount > 0 ? completedSale.discount : undefined,
        grandTotal: completedSale.total,
        paid: result.sale.paidAmount,
        change: result.sale.changeAmount,
      },
      payments: completedSale.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      })),
      policies,
      headerText: storeInfo.receiptHeader || undefined,
      footerText: storeInfo.receiptFooter || undefined,
      copies: Number(storeInfo.receiptCopies) || 1,
    };

    printReceipt(receiptData);
  }

  if (result) {
    return (
      <div className="mx-auto max-w-md border border-border bg-background p-6 text-center">
        <CheckCircle2 size={44} className="mx-auto text-green-600" />
        <h2 className="mt-3 text-lg font-semibold">Sale complete</h2>
        <div className="mt-1 text-sm text-muted-foreground">{result.sale.saleNumber}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Invoice {result.sale.invoiceNumber}
        </div>

        <div className="mt-4 space-y-1 rounded border border-border bg-surface/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold">{bdt(result.sale.totalAmount)}</span>
          </div>
          {result.sale.discountAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-green-600">-{bdt(result.sale.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <span>{bdt(result.sale.paidAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Change</span>
            <span>{bdt(result.sale.changeAmount)}</span>
          </div>
        </div>

        <div className="mt-4 rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
          <div>Verification code</div>
          <div className="mt-1 select-all text-base font-mono font-semibold text-foreground">
            {result.verificationCode}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-center"
            onClick={() => {
              setResult(null);
              setCompletedSale(null);
              setCustomerName("");
              setCustomerPhone("");
            }}
          >
            <RotateCcw size={13} /> New sale
          </Button>
          <Button variant="default" className="flex-1 justify-center" onClick={handlePrintReceipt}>
            Print Receipt
          </Button>
        </div>
      </div>
    );
  }

  const locationControl =
    locations.length > 0 &&
    (scopedLocation ? (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-[10px] uppercase tracking-widest">At</span>
        <span className="font-medium text-foreground">{scopedLocation}</span>
      </div>
    ) : (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">At</span>
        <Select
          value={locName === "" ? "__all__" : locName}
          onValueChange={(v) => setLocName(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All locations</SelectItem>
            {locations
              .filter((l) => l.isActive)
              .map((l) => (
                <SelectItem key={l.id} value={l.name}>
                  {l.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    ));

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:h-[calc(100dvh-145px)] lg:grid-cols-[1fr_380px] lg:grid-rows-1">
        <div className="flex min-w-0 flex-col">
          <SearchInput
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchEnter();
            }}
            placeholder="Search by name, SKU, barcode, IMEI…"
            label="Search Products"
            description="scan barcode or search by name, SKU, or IMEI"
            actions={
              <>
                <div
                  className={`flex items-center gap-1.5 border px-3 py-2 text-sm ${
                    scanner.scanning
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  } bg-background`}
                >
                  <ScanLine size={13} />
                  <input
                    ref={scanner.scanInputRef}
                    value={scanner.scanInput}
                    onChange={(e) => {
                      scanner.clear();
                      setQ(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && scanner.scanInputRef.current) {
                        setQ(scanner.scanInput);
                      }
                    }}
                    placeholder="Scan…"
                    className="w-24 bg-transparent outline-none"
                  />
                  {scanner.scanning && (
                    <span className="h-2 w-2 animate-ping rounded-full bg-green-500" />
                  )}
                </div>
                {locationControl}
              </>
            }
          />

          {flash && (
            <div className="mb-2 border border-sale/40 bg-sale/10 px-2 py-1 text-xs text-sale">
              {flash}
            </div>
          )}

          <div className="mb-2 flex flex-wrap gap-1">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setTab(c)}
                className={
                  "border px-2.5 py-1 text-xs " +
                  (tab === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {c}
              </button>
            ))}
          </div>

          {offline && (
            <div className="mb-2 flex items-center gap-1.5 border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              <WifiOff size={12} /> Offline — showing cached catalog
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">
                    <button
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center hover:text-foreground"
                    >
                      Product <SortArrow column="name" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Attribute</th>
                  <th className="px-3 py-2 font-medium">Warranty</th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      onClick={() => toggleSort("stock")}
                      className="inline-flex items-center hover:text-foreground"
                    >
                      Stock <SortArrow column="stock" />
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">
                    <button
                      onClick={() => toggleSort("price")}
                      className="inline-flex items-center hover:text-foreground"
                    >
                      Price <SortArrow column="price" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isExpanded = expandedImeis === g.productId;
                  const allUnits = g.variants.flatMap((v) =>
                    v.units.map((u) => ({ ...u, variantName: v.variantName })),
                  );
                  const hasImeiData = allUnits.length > 0;
                  const hasLockedBatch = g.variants.some((v) => v.batches.some((b) => b.locked));
                  // Group the unit list by receive batch so the panel reads in FIFO
                  // order and locked (newer) batches are obvious.
                  const batchGroups = (() => {
                    const map = new Map<
                      string,
                      {
                        batchId: string | null;
                        batchNumber: string;
                        unitCost: number | null;
                        locked: boolean;
                        units: typeof allUnits;
                      }
                    >();
                    for (const u of allUnits) {
                      const key = u.batchId ?? "__unbatched__";
                      let entry = map.get(key);
                      if (!entry) {
                        entry = {
                          batchId: u.batchId,
                          batchNumber: u.batchNumber ?? "Unbatched",
                          unitCost: u.unitCost,
                          locked: true,
                          units: [],
                        };
                        map.set(key, entry);
                      }
                      entry.units.push(u);
                      if (u.sellable) entry.locked = false;
                    }
                    return [...map.values()];
                  })();
                  return [
                    <tr
                      key={g.productId}
                      onClick={() => onGroupClick(g)}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="max-w-[200px] px-3 py-2 align-middle">
                        <div className="truncate font-medium">{g.productName}</div>
                      </td>
                      <td className="px-3 py-2 align-middle text-muted-foreground">
                        {g.single
                          ? g.single.variantName !== g.productName && g.single.variantName
                            ? g.single.variantName
                            : "—"
                          : `${g.variants.length} options`}
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-xs text-muted-foreground">
                        {g.single ? g.single.sku : "—"}
                      </td>
                      <td className="max-w-[180px] px-3 py-2 align-middle text-xs text-muted-foreground">
                        {g.single?.attribute?.length
                          ? g.single.attribute.map((a) => a.value).join(" · ")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs">{g.warranty}</td>
                      <td className="px-3 py-2 align-middle">
                        {g.single?.requiresUnit && hasImeiData ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedImeis(isExpanded ? null : g.productId);
                            }}
                            className={
                              "inline-flex items-center gap-1 text-xs hover:underline " +
                              (g.available <= 0 ? "text-sale" : "")
                            }
                          >
                            <span>{g.available} in</span>
                            {hasLockedBatch && <Lock size={10} className="text-sale" />}
                            <ChevronDown
                              size={11}
                              className={"transition-transform " + (isExpanded ? "rotate-180" : "")}
                            />
                          </button>
                        ) : (
                          <span className={"text-xs " + (g.available <= 0 ? "text-sale" : "")}>
                            {g.single?.requiresUnit
                              ? `${g.available} in`
                              : g.available <= 0
                                ? "Out"
                                : g.available}
                            {hasLockedBatch && <Lock size={10} className="ml-1 inline text-sale" />}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle font-semibold">{g.priceLabel}</td>
                    </tr>,
                    isExpanded && (
                      <tr key={g.productId + "-imeis"}>
                        <td colSpan={7} className="border-b border-border bg-surface/30 px-4 py-3">
                          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            Available Units
                          </div>
                          <div className="space-y-3">
                            {batchGroups.map((bg) => (
                              <div key={bg.batchId ?? "__unbatched__"}>
                                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
                                  {bg.locked ? (
                                    <Lock size={11} className="text-sale" />
                                  ) : (
                                    <Unlock size={11} className="text-muted-foreground" />
                                  )}
                                  <span
                                    className={
                                      "font-medium " + (bg.locked ? "text-sale" : "text-foreground")
                                    }
                                  >
                                    {bg.batchNumber}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {bg.units.length} unit{bg.units.length !== 1 ? "s" : ""}
                                  </span>
                                  {bg.unitCost != null && (
                                    <span className="text-muted-foreground">
                                      Cost {bdt(bg.unitCost)}
                                    </span>
                                  )}
                                  {bg.locked && (
                                    <span className="text-sale">
                                      · locked until the older batch sells
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="grid gap-2"
                                  style={{
                                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                                  }}
                                >
                                  {bg.units.map((u, idx) => (
                                    <div
                                      key={idx}
                                      className={
                                        "flex items-start gap-2.5 rounded-md border px-3 py-2 " +
                                        (bg.locked
                                          ? "border-border/40 bg-surface/40 opacity-60"
                                          : "border-border/60 bg-background")
                                      }
                                    >
                                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                        {idx + 1}
                                      </span>
                                      <div className="min-w-0 flex-1 space-y-1">
                                        {u.imei1 && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">
                                              IMEI 1
                                            </span>
                                            <span className="truncate font-mono text-xs text-foreground">
                                              {u.imei1}
                                            </span>
                                          </div>
                                        )}
                                        {u.imei2 && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">
                                              IMEI 2
                                            </span>
                                            <span className="truncate font-mono text-xs text-foreground">
                                              {u.imei2}
                                            </span>
                                          </div>
                                        )}
                                        {u.serialNumber && (
                                          <div className="flex items-center gap-1.5">
                                            <span className="w-12 shrink-0 text-[10px] font-medium text-muted-foreground">
                                              Serial
                                            </span>
                                            <span className="truncate font-mono text-xs text-foreground">
                                              {u.serialNumber}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
                {groups.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                      No sellable items. Publish products and receive stock to start selling.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex max-h-[80dvh] min-h-[380px] flex-col overflow-hidden border border-border bg-background lg:h-[calc(100dvh-145px)] lg:max-h-none lg:min-h-0">
          <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <User size={14} /> Customer
            </div>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  phoneRef.current?.focus();
                }
              }}
              enterKeyHint="next"
              placeholder="Name (default: Walk-in)"
              className="border border-border bg-surface/50 px-2 py-1 text-xs outline-none"
            />
            <input
              ref={phoneRef}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  discountRef.current?.focus();
                  discountRef.current?.select();
                }
              }}
              enterKeyHint="next"
              placeholder="Phone"
              inputMode="tel"
              className="border border-border bg-surface/50 px-2 py-1 text-xs outline-none"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <label
              htmlFor="pos-sale-date"
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
            >
              <Calendar size={12} /> Sale date
            </label>
            <input
              id="pos-sale-date"
              type="date"
              value={saleDate}
              max={todayInput()}
              onChange={(e) => setSaleDate(e.target.value)}
              className="min-w-0 flex-1 border border-border bg-surface/50 px-2 py-1 text-xs outline-none"
            />
          </div>

          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {cart.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Cart is empty. Tap a product, scan a barcode, or type a code and press Enter.
              </div>
            )}
            {cart.map((l) => (
              <div key={l.key} className="border-b border-border">
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {bdt(l.unitPrice)}
                      {l.imei ? ` · ${l.imei}` : ` · ${l.sku}`}
                      {l.batchNumber ? ` · ${l.batchNumber}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {l.unitId ? (
                      <>
                        <button
                          onClick={() => setCart((c) => c.filter((x) => x !== l))}
                          className="border border-border p-1"
                          title="Remove unit"
                        >
                          <Trash2 size={11} />
                        </button>
                        <span className="w-6 text-center text-sm">1</span>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => changeQty(l, -1)}
                          className="border border-border p-1"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="w-6 text-center text-sm">{l.qty}</span>
                        <button
                          onClick={() => changeQty(l, 1)}
                          className="border border-border p-1"
                        >
                          <Plus size={11} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="w-16 text-right text-sm">{bdt(l.unitPrice * l.qty)}</div>
                  {!l.unitId && (
                    <button
                      onClick={() => setCart((c) => c.filter((x) => x !== l))}
                      className="text-muted-foreground hover:text-sale"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="px-3 pb-2">
                  <WarrantySelector
                    value={l.warrantyPolicyId}
                    onChange={(policyId) =>
                      setCart((c) =>
                        c.map((item) =>
                          item === l ? { ...item, warrantyPolicyId: policyId } : item,
                        ),
                      )
                    }
                    placeholder="No warranty"
                    showSummary={false}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border p-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{bdt(subtotal)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{bdt(total)}</span>
            </div>

            {/* Split payment lines */}
            <div className="mt-3">
              <label className="mb-1.5 block text-xs text-muted-foreground">Payment</label>
              <div ref={methodWrapRef} className="relative">
                <Button
                  ref={addPaymentBtnRef}
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
                <div className="space-y-1.5">
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

            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Discount</label>
              <input
                ref={discountRef}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPaymentBtnRef.current?.focus();
                  }
                }}
                inputMode="decimal"
                className="w-full flex-1 border border-border bg-surface/50 px-2 py-1 text-right text-sm outline-none"
              />
            </div>

            <div className="mt-2 flex justify-between text-xs">
              {remaining > 0 ? (
                <>
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="text-sale">{bdt(remaining)}</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Change</span>
                  <span className="text-emerald-600">{bdt(change)}</span>
                </>
              )}
            </div>

            <Button
              variant="default"
              className="mt-2 w-full justify-center"
              disabled={committing || cart.length === 0 || paidPoisha < total}
              onClick={() => void charge()}
            >
              {committing ? "Charging…" : `Charge ${bdt(paidPoisha)}`}
            </Button>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <Pill tone="info">Serialized</Pill>
              <span>No due sales — full payment required</span>
            </div>
            <div className="mt-2 border-t border-border pt-1.5 text-[10px] text-muted-foreground">
              <span className="mr-2">⌘/Ctrl+K search</span>
              <span className="mr-2">⌘/Ctrl+P payment</span>
              <span>⌘/Ctrl+Enter · F4 charge</span>
            </div>
          </div>
        </aside>
      </div>

      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-md border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="text-sm font-semibold">{picker.productName}</div>
              <button onClick={closePicker} className="text-muted-foreground hover:text-foreground">
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
              {picker.variants.map((v, idx) => (
                <button
                  key={v.variantId}
                  onClick={() => pickVariant(v)}
                  onMouseEnter={() => setPicker((p) => (p ? { ...p, cursor: idx } : p))}
                  className={
                    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm " +
                    (idx === picker.cursor
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-surface")
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {v.variantName !== picker.productName ? v.variantName : "Default"}
                    </div>
                    <div
                      className={
                        "truncate text-xs " +
                        (idx === picker.cursor
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground")
                      }
                    >
                      {v.attribute?.length ? v.attribute.map((a) => a.value).join(" · ") : v.sku}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{bdt(v.sellingPrice)}</div>
                    <div
                      className={
                        "text-xs " +
                        (idx === picker.cursor
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground")
                      }
                    >
                      {v.requiresUnit
                        ? `${v.available} in`
                        : v.available <= 0
                          ? "Out"
                          : v.available}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              ↑↓ select · Enter add · Esc close
            </div>
          </div>
        </div>
      )}
      {unitPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeUnitPicker}
        >
          <div
            className="w-full max-w-md border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div>
                <div className="text-sm font-semibold">{unitPicker.productName}</div>
                <div className="text-xs text-muted-foreground">
                  Match the IMEI/serial against the device in hand
                </div>
              </div>
              <button
                onClick={closeUnitPicker}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
              {unitPicker.variant.units
                .filter((u) => u.sellable)
                .map((u, idx) => {
                  const identity = u.imei1 ?? u.imei2 ?? u.serialNumber ?? `unit-${u.id}`;
                  const sub = [
                    u.imei1 && u.imei2 ? `IMEI2 ${u.imei2}` : null,
                    identity !== u.serialNumber && u.serialNumber ? `SN ${u.serialNumber}` : null,
                    u.batchNumber ? `Batch ${u.batchNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      key={u.id}
                      onClick={() => pickUnit(u)}
                      onMouseEnter={() => setUnitPicker((p) => (p ? { ...p, cursor: idx } : p))}
                      className={
                        "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm " +
                        (idx === unitPicker.cursor
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-surface")
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[13px]">{identity}</div>
                        {sub && (
                          <div
                            className={
                              "truncate text-xs " +
                              (idx === unitPicker.cursor
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground")
                            }
                          >
                            {sub}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              ↑↓ select · Enter add · Esc close — scanning the unit's IMEI/serial label picks it
              directly
            </div>
          </div>
        </div>
      )}
    </>
  );
}
