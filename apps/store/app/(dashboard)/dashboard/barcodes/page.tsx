"use client";

/**
 * Barcode printing interface configured for:
 * - Printer: Gprinter USB 3210TU
 * - Label size: 40mm × 25mm
 * - Symbology: CODE128, EAN13, UPCA, QR Code
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, Pill, SortableTable } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { cn, bdt } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  Download,
  Usb,
  ScanLine,
  CheckCircle2,
  XCircle,
  Radio,
  ShoppingCart,
  Tag,
  Settings,
  Layers,
  ChevronDown,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import JsBarcode from "jsbarcode";
import { UsbThermalPrinter, type PrinterInfo } from "@/lib/usb-printer";
import { renderLabelToCanvas, type LabelSymbology } from "@/lib/label-render";
import {
  renderPrintLabels,
  silentPrint,
  STORE_NAME,
  type LabelPrintSymbology,
} from "@/lib/label-print";
import { useBarcodeScanner } from "@/lib/scanner";
import { specKey } from "@/lib/label-specs";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { TabStrip } from "@/components/dashboard/tab-strip";

type Symbology = "CODE128" | "EAN13" | "UPCA" | "QR";
type LabelSize = "40x25";
type Tab = "list" | "settings";

const BRAND_PREFIX: Record<string, string> = {
  iPhone: "IPH",
  Samsung: "SAM",
  "Google Pixel": "PXL",
  Oppo: "OPP",
  Redmi: "RED",
  Poco: "POC",
  MacBook: "MCB",
  Headphones: "HDP",
  Watch: "WAT",
  VR: "VR",
  Charger: "CHG",
};

function shortSku(product: { brand: string }, idx: number) {
  const prefix = BRAND_PREFIX[product.brand] || product.brand.slice(0, 3).toUpperCase();
  return `${prefix}-${String(idx + 1).padStart(3, "0")}`;
}

function LabelSizeDescription({ size }: { size: LabelSize }) {
  const map: Record<LabelSize, string> = {
    "40x25": "40×25mm · Small shelf label",
  };
  return <span className="text-xs text-muted-foreground">{map[size]}</span>;
}

function getLabelDimensions(size: LabelSize): { width: number; height: number } {
  const map: Record<LabelSize, { width: number; height: number }> = {
    "40x25": { width: 40, height: 25 },
  };
  return map[size];
}

// ─── Barcode label component ─────────────────────────────────────

// Renders the label at native 40×25mm/203dpi resolution and scales it up on
// screen with CSS — this is the exact same renderLabelToCanvas() call used
// to build the printed bitmap, so the preview always matches the printout.
function BarcodeCanvas({
  value,
  format,
  productName,
  costCode,
  dCode,
  sellCode,
  batteryHealth,
  sellingPrice,
  category,
  specs,
  showName = true,
  showSku = true,
  showSellCode = true,
  showDCode = true,
  showCostCode = true,
  showBatteryHealth = true,
  showSellingPrice = true,
  showBarcode = true,
  showBarcodeNumber = true,
  showStore = true,
  showBorder = true,
  showSpecs = true,
  specVisibility,
  labelWidth = 40,
  labelHeight = 25,
}: {
  value: string;
  format: Symbology;
  productName?: string;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  batteryHealth?: number | null;
  sellingPrice?: number | null;
  category?: string;
  brand?: string;
  variantName?: string;
  specs?: { label: string; value: string }[];
  showName?: boolean;
  showSku?: boolean;
  showSellCode?: boolean;
  showDCode?: boolean;
  showCostCode?: boolean;
  showBatteryHealth?: boolean;
  showSellingPrice?: boolean;
  showBarcode?: boolean;
  showBarcodeNumber?: boolean;
  showStore?: boolean;
  showBorder?: boolean;
  showSpecs?: boolean;
  specVisibility?: Record<string, boolean>;
  labelWidth?: number;
  labelHeight?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Auto-disable battery health for Official New / Unofficial New categories
  const isNewCategory = category === "Official New" || category === "Unofficial New";
  const effectiveShowBH = showBatteryHealth && !isNewCategory;

  useEffect(() => {
    if (!ref.current) return;
    renderLabelToCanvas(
      ref.current,
      {
        sku: value,
        productName: productName || "",
        costCode,
        dCode,
        sellCode,
        storeName: STORE_NAME,
        batteryHealth: effectiveShowBH ? batteryHealth : null,
        sellingPrice,
        specs,
      },
      {
        widthMm: labelWidth,
        heightMm: labelHeight,
        symbology: format as LabelSymbology,
        showStore,
        showName,
        showCodes: showSellCode || showDCode || showCostCode,
        showSellCode,
        showDCode,
        showCostCode,
        showBatteryHealth: effectiveShowBH,
        showSellingPrice,
        showBarcode,
        showBarcodeNumber,
        showSku,
        showBorder,
        showSpecs,
        specVisibility,
      },
    );
  }, [
    value,
    format,
    productName,
    costCode,
    dCode,
    sellCode,
    batteryHealth,
    sellingPrice,
    specs,
    effectiveShowBH,
    showSellingPrice,
    showSellCode,
    showDCode,
    showCostCode,
    showName,
    showSku,
    showBarcode,
    showBarcodeNumber,
    showStore,
    showBorder,
    showSpecs,
    specVisibility,
    labelWidth,
    labelHeight,
  ]);

  // Canvas pixel size == physical printer dots (203dpi); scale up on screen
  // with CSS only, so what's drawn is never resampled/blurred.
  const dpi = 203;
  const wDots = Math.round((labelWidth * dpi) / 25.4);
  const hDots = Math.round((labelHeight * dpi) / 25.4);
  const onScreenScale = 0.75; // tuned so a 40x25mm label reads clearly in the grid

  return (
    <canvas
      ref={ref}
      style={{
        width: wDots * onScreenScale,
        height: hDots * onScreenScale,
        imageRendering: "crisp-edges",
      }}
    />
  );
}

// ─── Main page ──────────────────────────────────────────────────────

export default function Barcodes() {
  // Load variants with stock and pricing from our custom API
  const { data: barcodeProducts = [] } = useQuery<
    Array<{
      variantId: number;
      productId: string;
      name: string;
      variantName: string;
      sku: string;
      barcode?: string;
      sellingPrice: number;
      costPrice: number | null;
      costCode?: string;
      dCode?: string;
      sellCode?: string;
      brand: string;
      category?: string;
      active: boolean;
      stock: number;
      imei1?: string | null;
      imei2?: string | null;
      serialNumber?: string | null;
      batteryHealth?: number | null;
      specs?: { label: string; value: string }[];
    }>
  >({
    queryKey: ["barcode-products"],
    queryFn: () => fetch("/api/dashboard/barcodes").then((res) => res.json()),
  });

  const [tab, setTab] = useState<Tab>("list");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [symbology, setSymbology] = useState<Symbology>("CODE128");
  const [labelSize, setLabelSize] = useState<LabelSize>("40x25");
  const [copies, setCopies] = useState(1);
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showSellCode, setShowSellCode] = useState(true);
  const [showDCode, setShowDCode] = useState(true);
  const [showCostCode, setShowCostCode] = useState(true);
  const [showBatteryHealth, setShowBatteryHealth] = useState(true);
  const [showSellingPrice, setShowSellingPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showBarcodeNumber, setShowBarcodeNumber] = useState(true);
  const [showStore, setShowStore] = useState(true);
  const [showBorder, setShowBorder] = useState(true);
  // Device-specs feature: master toggle + per-label show/hide, both persisted.
  const [showSpecs, setShowSpecs] = useState(true);
  const [specVisibility, setSpecVisibility] = useState<Record<string, boolean>>({});

  // Track which products have been printed
  const [printed, setPrinted] = useState<Set<number>>(new Set());

  // ── Cart ──────────────────────────────────────────────
  const cart = useCart();

  // ── Printer state ──────────────────────────────────────────
  const printerRef = useRef<UsbThermalPrinter | null>(null);
  const [printerInfo, setPrinterInfo] = useState<PrinterInfo>({ connected: false });
  const [printerBusy, setPrinterBusy] = useState(false);
  const [printerSupported, setPrinterSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Init printer singleton
  useEffect(() => {
    setMounted(true);
    setPrinterSupported(UsbThermalPrinter.isSupported);

    const p = new UsbThermalPrinter();
    printerRef.current = p;
    const unsub = p.onChange(setPrinterInfo);
    p.reconnect().catch(() => {});
    return () => {
      unsub();
      p.disconnect().catch(() => {});
    };
  }, []);

  const handleConnect = useCallback(async () => {
    if (!printerRef.current) return;
    try {
      await printerRef.current.connect();
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        console.error("Printer connection failed:", err);
      }
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    await printerRef.current?.disconnect();
  }, []);

  // ── Label settings persistence (store_settings.label_settings) ──
  // One-shot hydration restores every toggle from the last saved settings;
  // any later change is debounced back with a PUT to the generic settings API.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const lastSavedRef = useRef<string | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const s = json?.label_settings;
        if (s && typeof s === "object") {
          if (
            typeof s.symbology === "string" &&
            ["CODE128", "EAN13", "UPCA", "QR"].includes(s.symbology)
          )
            setSymbology(s.symbology as Symbology);
          if (Number.isFinite(s.copies)) setCopies(Math.max(1, Math.floor(s.copies)));
          if (typeof s.showName === "boolean") setShowName(s.showName);
          if (typeof s.showSku === "boolean") setShowSku(s.showSku);
          if (typeof s.showSellCode === "boolean") setShowSellCode(s.showSellCode);
          if (typeof s.showDCode === "boolean") setShowDCode(s.showDCode);
          if (typeof s.showCostCode === "boolean") setShowCostCode(s.showCostCode);
          if (typeof s.showBatteryHealth === "boolean") setShowBatteryHealth(s.showBatteryHealth);
          if (typeof s.showSellingPrice === "boolean") setShowSellingPrice(s.showSellingPrice);
          if (typeof s.showBarcode === "boolean") setShowBarcode(s.showBarcode);
          if (typeof s.showBarcodeNumber === "boolean") setShowBarcodeNumber(s.showBarcodeNumber);
          if (typeof s.showStore === "boolean") setShowStore(s.showStore);
          if (typeof s.showBorder === "boolean") setShowBorder(s.showBorder);
          if (typeof s.showSpecs === "boolean") setShowSpecs(s.showSpecs);
          if (s.specVisibility && typeof s.specVisibility === "object")
            setSpecVisibility(s.specVisibility);
          lastSavedRef.current = JSON.stringify(s);
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    const snapshot = JSON.stringify({
      symbology,
      copies,
      showName,
      showSku,
      showSellCode,
      showDCode,
      showCostCode,
      showBatteryHealth,
      showSellingPrice,
      showBarcode,
      showBarcodeNumber,
      showStore,
      showBorder,
      showSpecs,
      specVisibility,
    });
    if (snapshot === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = snapshot;
      fetch("/api/dashboard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label_settings: JSON.parse(snapshot) }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [
    settingsLoaded,
    symbology,
    copies,
    showName,
    showSku,
    showSellCode,
    showDCode,
    showCostCode,
    showBatteryHealth,
    showSellingPrice,
    showBarcode,
    showBarcodeNumber,
    showStore,
    showBorder,
    showSpecs,
    specVisibility,
  ]);

  const handleSilentPrint = useCallback(
    async (
      items: {
        name: string;
        costCode?: string;
        dCode?: string;
        sellCode?: string;
        batteryHealth?: number | null;
        sellingPrice?: number | null;
        category?: string;
        specs?: { label: string; value: string }[];
      }[],
      skus: string[],
      copiesOverride?: number,
      symbologyOverride?: Symbology,
    ) => {
      const p = printerRef.current;
      // No USB printer available — fall back to the browser print dialog with
      // the same labels and settings instead of silently doing nothing.
      if (!p || !printerInfo.connected) {
        renderPrintLabels(items, skus, {
          symbology: (symbologyOverride ?? symbology) as LabelPrintSymbology,
          size: labelSize,
          showName,
          showSku,
          showSellCode,
          showDCode,
          showCostCode,
          showBatteryHealth,
          showSellingPrice,
          showBarcode,
          showBarcodeNumber,
          showSpecs,
          specVisibility,
          showStore,
          showBorder,
          copies: copiesOverride ?? copies,
        });
        return;
      }
      setPrinterBusy(true);
      try {
        const { width: w, height: h } = getLabelDimensions(labelSize);
        await silentPrint(
          p,
          items,
          skus,
          symbologyOverride ?? symbology,
          copiesOverride ?? copies,
          w,
          h,
          showBorder,
          showStore,
          showName,
          showSellCode,
          showDCode,
          showCostCode,
          showBatteryHealth,
          showSellingPrice,
          showBarcode,
          showBarcodeNumber,
          showSku,
          showSpecs,
          specVisibility,
        );
      } catch (err) {
        console.error("Silent print failed:", err);
      } finally {
        setPrinterBusy(false);
      }
    },
    [
      printerInfo,
      labelSize,
      symbology,
      copies,
      showBorder,
      showStore,
      showName,
      showSellCode,
      showDCode,
      showCostCode,
      showBatteryHealth,
      showSellingPrice,
      showBarcode,
      showBarcodeNumber,
      showSku,
      showSpecs,
      specVisibility,
    ],
  );

  // ── Scanner state ──────────────────────────────────────────
  const [scanHighlight, setScanHighlight] = useState<number | null>(null);
  const scanner = useBarcodeScanner({ autoFocus: false });

  useEffect(() => {
    if (!scanner.lastScan) return;
    const code = scanner.lastScan.code.toUpperCase();
    let foundVariantId: number | null = null;

    for (const [vid, sku] of barcodeMap) {
      if (sku.toUpperCase() === code) {
        foundVariantId = vid;
        break;
      }
    }
    if (!foundVariantId) {
      const match = filtered.find(
        (p) => p.sku.toUpperCase() === code || (p.barcode && p.barcode.toUpperCase() === code),
      );
      if (match) foundVariantId = match.variantId;
    }

    if (foundVariantId) {
      setScanHighlight(foundVariantId);
      const product = filtered.find((p) => p.variantId === foundVariantId);
      cart.add(String(foundVariantId), 1);
      toast.success(`Scanned: ${product?.name || foundVariantId}`, { duration: 2000 });
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(foundVariantId!);
        return next;
      });
      setTimeout(() => {
        document
          .getElementById(`variant-${foundVariantId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }

    requestAnimationFrame(() => scanner.clear());
  }, [scanner.lastScan]);

  // ── Derived data ───────────────────────────────────────────
  const filtered: Array<{
    variantId: number;
    productId: string;
    name: string;
    variantName: string;
    sku: string;
    barcode?: string;
    sellingPrice: number;
    costPrice: number | null;
    costCode?: string;
    dCode?: string;
    sellCode?: string;
    brand: string;
    category?: string;
    active: boolean;
    stock: number;
    imei1?: string | null;
    imei2?: string | null;
    serialNumber?: string | null;
    batteryHealth?: number | null;
    specs?: { label: string; value: string }[];
    units?: {
      id: string;
      imei1: string | null;
      imei2: string | null;
      serialNumber: string | null;
      unitCode: string | null;
      barcode: string | null;
      identityType: string | null;
      batteryHealth: number | null;
      conditionGrade: string | null;
      currentPrice: number | null;
      costCode: string | null;
      dCode: string | null;
      sellCode: string | null;
      color: string | null;
      specs?: { label: string; value: string }[];
    }[];
  }> = useMemo(() => {
    if (!search) return barcodeProducts;
    const q = search.toLowerCase();
    return barcodeProducts.filter((p) =>
      [
        p.name,
        p.variantName,
        p.brand,
        p.barcode,
        p.sku,
        p.category,
        p.imei1,
        p.imei2,
        p.serialNumber,
        p.costCode,
        p.dCode,
        p.sellCode,
      ].some((f) => f && String(f).toLowerCase().includes(q)),
    );
  }, [barcodeProducts, search]);

  const barcodeMap = useMemo(() => {
    const map = new Map<number, string>();
    barcodeProducts.forEach((p) => {
      const barcode = p.barcode || p.sku || `SKU-${p.variantId}`;
      map.set(p.variantId, barcode);
    });
    return map;
  }, [barcodeProducts]);

  // Spec labels present anywhere in the catalog, first-seen order — the
  // Device-specs toggle list follows the data automatically (add a "RAM" spec
  // to a product and a "RAM" checkbox shows up here; no hardcoding).
  const specLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of barcodeProducts) {
      for (const s of p.specs ?? []) {
        const k = specKey(s.label);
        if (k && !map.has(k)) map.set(k, s.label.trim());
      }
    }
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [barcodeProducts]);

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.variantId)));
    }
  };

  const toggleOne = (variantId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  // ── Print actions ──────────────────────────────────────────
  const getSelected = () => {
    const docs = filtered.filter((p) => selected.has(p.variantId));
    const skus = docs.map((p) => barcodeMap.get(p.variantId) || p.sku);
    return { docs, skus };
  };

  const printBrowser = () => {
    const { docs, skus } = getSelected();
    if (docs.length === 0) return;
    renderPrintLabels(docs, skus, {
      symbology,
      size: labelSize,
      showName,
      showSku,
      showSellCode,
      showDCode,
      showCostCode,
      showBarcode,
      showBarcodeNumber,
      showBatteryHealth,
      showSellingPrice,
      showStore,
      showBorder,
      showSpecs,
      specVisibility,
      copies,
    });
  };

  const printSilent = () => {
    const { docs, skus } = getSelected();
    if (docs.length === 0) return;
    handleSilentPrint(docs, skus);
  };

  const printOneBrowser = (variantId: number) => {
    const p = filtered.find((x) => x.variantId === variantId);
    if (!p) return;
    // Serialized stock: one correct label per unit — each carrying its own
    // battery/price — not a single product label with a random unit's data.
    if (p.units && p.units.length > 0) {
      renderPrintLabels(
        p.units.map((u) => buildUnitDoc(p, u)),
        p.units.map((u) => unitLabelValue(u) || barcodeMap.get(variantId) || p.sku),
        {
          symbology: "CODE128",
          size: labelSize,
          showName,
          showSku,
          showSellCode,
          showDCode,
          showCostCode,
          showBatteryHealth,
          showSellingPrice,
          showBarcode,
          showBarcodeNumber,
          showStore,
          showBorder,
          showSpecs,
          specVisibility,
          copies: 1,
        },
      );
      return;
    }
    renderPrintLabels([p], [barcodeMap.get(variantId) || p.sku], {
      symbology,
      size: labelSize,
      showName,
      showSku,
      showSellCode,
      showDCode,
      showCostCode,
      showBarcode,
      showBarcodeNumber,
      showBatteryHealth,
      showSellingPrice,
      showStore,
      showBorder,
      showSpecs,
      specVisibility,
      copies: 1,
    });
  };

  const printOneSilent = async (variantId: number) => {
    const p = filtered.find((x) => x.variantId === variantId);
    if (!p) return;
    // Same per-unit rule as the browser path: one label per unit, each with
    // its own battery/price, instead of a random unit's data.
    if (p.units && p.units.length > 0) {
      await handleSilentPrint(
        p.units.map((u) => buildUnitDoc(p, u)),
        p.units.map((u) => unitLabelValue(u) || barcodeMap.get(variantId) || p.sku),
        1,
        "CODE128",
      );
      setPrinted((prev) => new Set(prev).add(variantId));
      return;
    }
    await handleSilentPrint([p], [barcodeMap.get(variantId) || p.sku]);
    setPrinted((prev) => new Set(prev).add(variantId));
  };

  // ── Per-unit print (Action column in expanded rows) ────────
  type BarcodeUnit = NonNullable<(typeof filtered)[0]["units"]>[number];

  // The label value for one physical unit. Real serials/IMEIs are normalized
  // (the lookup strips spaces/dashes before matching them); generated PSU-
  // codes have no normalized fallback, so they are encoded exactly as stored.
  const unitLabelValue = (u: BarcodeUnit): string => {
    const real = u.serialNumber || u.imei1 || u.imei2;
    if (real) return real.replace(/[\s-]/g, "").toUpperCase();
    return (u.unitCode || u.barcode || "").trim();
  };

  // Build a label doc for one physical unit — the unit's own intake data is
  // authoritative: pricing/codes override the variant-level defaults, and the
  // specs line draws the unit's RAM/Storage/Color captured at intake (falling
  // back to catalog specs when the unit has none), with the unit's own battery
  // reading appended. A catalog Battery spec is always dropped so a stale
  // product-level value can never mask the unit's.
  const buildUnitDoc = (p: (typeof filtered)[0], u: BarcodeUnit) => {
    const isBatterySpec = (s: { label: string }) =>
      specKey(s.label)
        .replace(/[^a-z]/g, "")
        .startsWith("battery");
    const base = u.specs?.length ? u.specs : (p.specs ?? []);
    const noBattery = base.filter((s) => !isBatterySpec(s));
    const specs =
      u.batteryHealth != null
        ? [...noBattery, { label: "Battery Health", value: `${u.batteryHealth}%` }]
        : noBattery;
    return {
      ...p,
      batteryHealth: u.batteryHealth,
      sellingPrice: u.currentPrice ?? p.sellingPrice,
      costCode: u.costCode ?? p.costCode,
      dCode: u.dCode ?? p.dCode,
      sellCode: u.sellCode ?? p.sellCode,
      color: u.color ?? "",
      specs,
    };
  };

  // Print one physical unit's label — value = the unit identity, forced to
  // CODE128 because a 15-digit IMEI doesn't fit EAN13/UPCA.
  const printUnit = async (p: (typeof filtered)[0], u: BarcodeUnit) => {
    const doc = buildUnitDoc(p, u);
    const value = unitLabelValue(u) || barcodeMap.get(p.variantId) || p.sku;
    if (printerInfo.connected) {
      await handleSilentPrint([doc], [value], 1, "CODE128");
      setPrinted((prev) => new Set(prev).add(p.variantId));
    } else {
      renderPrintLabels([doc], [value], {
        symbology: "CODE128",
        size: labelSize,
        showName,
        showSku,
        showSellCode,
        showDCode,
        showCostCode,
        showBarcode,
        showBarcodeNumber,
        showBatteryHealth,
        showSellingPrice,
        showStore,
        showBorder,
        showSpecs,
        specVisibility,
        copies: 1,
      });
    }
  };

  // Bulk print: one label per unit in stock. For serialized rows the API now
  // returns the available `units`, so each printed label carries that physical
  // unit's identity — value = serialNumber ?? imei1 ?? imei2, forced to CODE128
  // because a 15-digit IMEI doesn't fit EAN13/UPCA. Accessories fall back to N
  // identical product labels.
  const printStock = async (p: (typeof filtered)[0]) => {
    const sku = barcodeMap.get(p.variantId) || p.sku;
    const units = p.units ?? [];
    const labelOptions = {
      size: labelSize,
      showName,
      showSku,
      showSellCode,
      showDCode,
      showCostCode,
      showBarcode,
      showBarcodeNumber,
      showBatteryHealth,
      showSellingPrice,
      showStore,
      showBorder,
      showSpecs,
      specVisibility,
    };
    if (units.length > 0) {
      // One label per physical unit — the label value IS the unit identity.
      const unitDocs = units.map((u) => buildUnitDoc(p, u));
      const unitSkus = units.map((u) => unitLabelValue(u) || sku);
      if (printerInfo.connected) {
        await handleSilentPrint(unitDocs, unitSkus, 1, "CODE128");
        setPrinted((prev) => new Set(prev).add(p.variantId));
      } else {
        renderPrintLabels(unitDocs, unitSkus, {
          ...labelOptions,
          symbology: "CODE128",
          copies: 1,
        });
      }
      return;
    }
    const qty = Math.max(1, Math.floor(p.stock));
    if (printerInfo.connected) {
      await handleSilentPrint([p], [sku], qty);
      setPrinted((prev) => new Set(prev).add(p.variantId));
    } else {
      renderPrintLabels([p], [sku], {
        ...labelOptions,
        symbology,
        copies: qty,
      });
    }
  };

  const downloadBarcode = (variantId: number) => {
    const p = filtered.find((x) => x.variantId === variantId);
    const sku = barcodeMap.get(variantId) || p?.sku || String(variantId);
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, sku, {
        format:
          symbology === "EAN13"
            ? "EAN13"
            : symbology === "UPCA"
              ? "UPCA"
              : symbology === "QR"
                ? "QR"
                : "CODE128",
        width: symbology === "QR" ? 3 : 2,
        height: 50,
        displayValue: true,
        margin: 10,
        background: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `${sku}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      /* skip */
    }
  };

  const scannedSku = scanner.lastScan?.code;
  const scanResult =
    scannedSku && scanHighlight ? filtered.find((p) => p.variantId === scanHighlight) : null;

  // ── Tab buttons ──────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "list", label: "Barcode List", icon: <Tag size={13} /> },
    { id: "settings", label: "Label Settings", icon: <Settings size={13} /> },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="mb-4 flex gap-1 border-b border-border">
        <TabStrip
            tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
            active={tab}
            onChange={(k) => setTab(k as typeof tab)}
          />
      </div>

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 1: Barcode List (datatable)                        */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "list" && (
        <Card className="p-4">
          {/* Toolbar */}
          <div className="mb-3">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              label="Search Products"
              description="scan barcode or search by name, brand, barcode, or category"
              actions={
                <div
                  className={`flex items-center gap-2 border px-3 py-2 text-sm ${
                    scanner.scanning ? "border-foreground" : "border-border"
                  } bg-background`}
                >
                  <ScanLine size={13} className="text-muted-foreground" />
                  <input
                    ref={scanner.scanInputRef}
                    value={scanner.scanInput}
                    onChange={(e) => {
                      scanner.clear();
                      setSearch(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && scanner.scanInputRef.current) {
                        setSearch(scanner.scanInput);
                      }
                    }}
                    placeholder="Scan barcode…"
                    className="w-32 bg-transparent outline-none"
                  />
                  {scanner.scanning && (
                    <span className="h-2 w-2 animate-ping rounded-full bg-green-500" />
                  )}
                </div>
              }
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
                Select all
              </label>

              {cart.count > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ShoppingCart size={12} /> {cart.count} in cart
                </span>
              )}

              <div className="ml-auto flex gap-2">
                {printerInfo.connected ? (
                  <Button
                    type="button"
                    variant="default"
                    disabled={selected.size === 0 || printerBusy}
                    onClick={printSilent}
                    className="text-xs"
                  >
                    <Radio size={12} />
                    {printerBusy ? "Printing…" : `Print (${selected.size})`}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="surface"
                    disabled={selected.size === 0}
                    onClick={printBrowser}
                    className="text-xs"
                  >
                    <Printer size={13} /> Print ({selected.size})
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Scan result */}
          {scannedSku && scanResult && (
            <div className="mb-3 flex items-center gap-2 rounded-sm border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs">
              <CheckCircle2 size={13} className="text-green-600" />
              Scanned: <span className="font-mono font-medium">{scannedSku}</span> →
              <span className="font-medium">{scanResult.name}</span>
              <button
                type="button"
                onClick={() => {
                  setScanHighlight(null);
                  scanner.clear();
                }}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mb-3 text-xs text-muted-foreground">
            <LabelSizeDescription size={labelSize} /> · {filtered.length} product
            {filtered.length !== 1 ? "s" : ""}
          </div>

          {/* Datatable */}
          <SortableTable
            rowKey={(p) => p.variantId}
            expandedKeys={expandedVariants}
            onToggleExpand={(key, expanded) => {
              setExpandedVariants((prev) => {
                const next = new Set(prev);
                const k = Number(key);
                if (expanded) next.add(k);
                else next.delete(k);
                return next;
              });
            }}
            detailRow={(p, isExpanded) => {
              if (!isExpanded || !p.units || p.units.length <= 1) return null;
              return (
                <div className="p-3 bg-background border-t border-border">
                  <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-7 text-xs">
                    <span className="font-medium text-muted-foreground">IMEI</span>
                    <span className="font-medium text-muted-foreground">Serial</span>
                    <span className="font-medium text-muted-foreground">Battery</span>
                    <span className="font-medium text-muted-foreground">Condition</span>
                    <span className="font-medium text-muted-foreground">Price</span>
                    <span className="font-medium text-muted-foreground">Codes</span>
                    <span className="text-right font-medium text-muted-foreground">Action</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {p.units.map((u) => (
                      <div
                        key={u.id}
                        className="grid gap-2 md:grid-cols-4 lg:grid-cols-7 text-xs text-muted-foreground p-1 bg-muted/30 rounded"
                      >
                        <span className="font-mono">
                          {(u.imei1 || u.imei2 || u.serialNumber || u.unitCode || "—").slice(0, 15)}
                        </span>
                        <span>{u.serialNumber || "—"}</span>
                        <span>{u.batteryHealth != null ? `${u.batteryHealth}%` : "—"}</span>
                        <span>{u.conditionGrade || "—"}</span>
                        <span className="font-medium">
                          {u.currentPrice != null ? `৳${u.currentPrice.toLocaleString()}` : "—"}
                        </span>
                        <span>
                          {u.costCode && `C:${u.costCode} `}
                          {u.dCode && `D:${u.dCode} `}
                          {u.sellCode && `S:${u.sellCode}`}
                        </span>
                        <span className="text-right">
                          {printerInfo.connected ? (
                            <button
                              type="button"
                              onClick={() => void printUnit(p, u)}
                              disabled={printerBusy}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface disabled:opacity-50"
                              title="Silent print this unit's label via USB printer"
                            >
                              <Radio size={10} /> Print
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void printUnit(p, u)}
                              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface"
                              title="Print this unit's label via browser dialog"
                            >
                              <Printer size={10} /> Print
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex gap-2 justify-end">
                    {printerInfo.connected ? (
                      <button
                        type="button"
                        onClick={() => void printOneSilent(p.variantId)}
                        disabled={printerBusy}
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface disabled:opacity-50"
                        title="Silent print via USB printer"
                      >
                        <Radio size={10} /> Print
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => printOneBrowser(p.variantId)}
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface"
                        title="Print via browser dialog"
                      >
                        <Printer size={10} /> Print
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void printStock(p)}
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface"
                      title={`Bulk print — one label per unit in stock (${p.stock})`}
                    >
                      <Layers size={10} /> ×{p.stock}
                    </button>
                  </div>
                </div>
              );
            }}
            columns={[
              {
                key: "expand",
                header: "",
                render: (_: unknown, p: (typeof filtered)[0]) => {
                  const hasUnits = (p.units?.length ?? 0) > 1;
                  const isExpanded = expandedVariants.has(p.variantId);
                  if (!hasUnits) return <span className="w-6" />;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedVariants((prev) => {
                          const next = new Set(prev);
                          if (isExpanded) next.delete(p.variantId);
                          else next.add(p.variantId);
                          return next;
                        });
                      }}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      <ChevronDown
                        size={14}
                        className={cn("transition-transform", isExpanded && "rotate-180")}
                      />
                    </button>
                  );
                },
              },
              {
                key: "checkbox",
                header: "",
                render: (_: unknown, p: (typeof filtered)[0]) => (
                  <input
                    type="checkbox"
                    checked={selected.has(p.variantId)}
                    onChange={() => toggleOne(p.variantId)}
                    className="h-3.5 w-3.5"
                  />
                ),
              },
              { key: "name", header: "Product", sortable: true },
              { key: "variantName", header: "Variant", sortable: true },
              {
                key: "sku",
                header: "SKU",
                sortable: true,
                render: (v: string) => (
                  <span className="font-mono text-xs text-muted-foreground">{v}</span>
                ),
              },
              { key: "brand", header: "Brand", sortable: true },
              { key: "category", header: "Category", sortable: true },
              {
                key: "sellingPrice",
                header: "Price",
                sortable: true,
                render: (v: number) => (
                  <span className="text-right font-medium">৳{v.toLocaleString()}</span>
                ),
              },
              {
                key: "costPrice",
                header: "Cost",
                sortable: true,
                render: (v: number | null) => (
                  <span className="text-right text-muted-foreground">
                    {v != null ? `৳${v.toLocaleString()}` : "—"}
                  </span>
                ),
              },
              {
                key: "stock",
                header: "Stock",
                sortable: true,
                render: (v: number) => (
                  <span
                    className={`text-right ${v <= 0 ? "text-muted-foreground" : v <= 5 ? "text-sale" : ""}`}
                  >
                    {v}
                  </span>
                ),
              },
              {
                key: "active",
                header: "Status",
                sortable: true,
                render: (v: boolean) => (
                  <Pill tone={v ? "success" : "muted"}>{v ? "Active" : "Inactive"}</Pill>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (_: unknown, p: (typeof filtered)[0]) => (
                  <div className="text-right">
                    {printerInfo.connected ? (
                      <button
                        type="button"
                        onClick={() => void printOneSilent(p.variantId)}
                        disabled={printerBusy}
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface disabled:opacity-50"
                        title="Silent print via USB printer"
                      >
                        <Radio size={10} /> Print
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => printOneBrowser(p.variantId)}
                        className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface"
                        title="Print via browser dialog"
                      >
                        <Printer size={10} /> Print
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void printStock(p)}
                      data-testid={`bulk-print-${p.variantId}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface"
                      title={`Bulk print — one label per unit in stock (${p.stock})`}
                    >
                      <Layers size={10} /> ×{p.stock}
                    </button>
                  </div>
                ),
              },
            ]}
            data={filtered}
            emptyMessage="No products match your search."
          />

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No products match your search.
            </p>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════ */}
      {/* TAB 2: Label Settings                                  */}
      {/* ════════════════════════════════════════════════════════ */}
      {tab === "settings" && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* ─── Left: settings ──────────────────────────────── */}
          <Card className="p-4 lg:col-span-1">
            <div className="mb-3 text-sm font-medium">Label settings</div>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Symbology</span>
                <Select value={symbology} onValueChange={(v) => setSymbology(v as Symbology)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CODE128">CODE 128</SelectItem>
                    <SelectItem value="EAN13">EAN-13</SelectItem>
                    <SelectItem value="UPCA">UPC-A</SelectItem>
                    <SelectItem value="QR">QR Code</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <div className="grid gap-1">
                <span className="text-xs text-muted-foreground">Label size</span>
                <div className="text-sm font-medium">40×25mm (Configured for Gprinter 3210TU)</div>
              </div>

              <label className="grid grid-cols-2 gap-2">
                <span className="col-span-2 text-xs text-muted-foreground">Show on label</span>
                {[
                  { key: "showName", label: "Product name", state: showName, set: setShowName },
                  { key: "showSpecs", label: "Device specs", state: showSpecs, set: setShowSpecs },
                  { key: "showSku", label: "SKU", state: showSku, set: setShowSku },
                  {
                    key: "showSellCode",
                    label: "S-code",
                    state: showSellCode,
                    set: setShowSellCode,
                  },
                  {
                    key: "showDCode",
                    label: "D-code",
                    state: showDCode,
                    set: setShowDCode,
                  },
                  {
                    key: "showCostCode",
                    label: "C-code",
                    state: showCostCode,
                    set: setShowCostCode,
                  },
                  {
                    key: "showBatteryHealth",
                    label: "Battery health",
                    state: showBatteryHealth,
                    set: setShowBatteryHealth,
                  },
                  {
                    key: "showSellingPrice",
                    label: "Selling price",
                    state: showSellingPrice,
                    set: setShowSellingPrice,
                  },
                  { key: "showBarcode", label: "Barcode", state: showBarcode, set: setShowBarcode },
                  {
                    key: "showBarcodeNumber",
                    label: "Barcode number",
                    state: showBarcodeNumber,
                    set: setShowBarcodeNumber,
                  },
                  { key: "showStore", label: "Store name", state: showStore, set: setShowStore },
                  {
                    key: "showBorder",
                    label: "Label border",
                    state: showBorder,
                    set: setShowBorder,
                  },
                ].map(({ key, label, state, set }) => (
                  <label key={key} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={state}
                      onChange={(e) => set(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    {label}
                  </label>
                ))}
              </label>

              {/* Device specs: one checkbox per label found in the catalog */}
              {showSpecs && (
                <div className="grid gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">
                    Spec labels shown on the device-specs line
                  </span>
                  {specLabels.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">
                      No specs found in catalog yet
                    </span>
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {specLabels.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={specVisibility[key] !== false}
                            onChange={(e) =>
                              setSpecVisibility((prev) => ({ ...prev, [key]: e.target.checked }))
                            }
                            className="h-3.5 w-3.5"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Copies per SKU</span>
                <input
                  type="number"
                  min={1}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="border border-border bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {/* ── Printer section ────────────────────────────── */}
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Usb size={13} /> Thermal Printer
              </div>

              {!mounted ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-gray-300" />
                  Checking printer support...
                </div>
              ) : !printerSupported ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <XCircle size={12} />
                  WebUSB not supported. Use Chrome/Edge to connect.
                </div>
              ) : printerInfo.connected ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle2 size={12} />
                    Connected
                    {printerInfo.productName && (
                      <span className="text-muted-foreground">· {printerInfo.productName}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="surface"
                      onClick={handleDisconnect}
                      disabled={printerBusy}
                      className="text-xs"
                    >
                      Disconnect
                    </Button>
                  </div>
                  {printerBusy && (
                    <div className="animate-pulse text-[10px] text-muted-foreground">
                      Sending labels to printer…
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <XCircle size={12} />
                    Not connected
                  </div>
                  <Button
                    type="button"
                    variant="surface"
                    onClick={handleConnect}
                    className="text-xs"
                  >
                    <Usb size={12} /> Connect Printer
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    Connect your GP-3120TUD via USB. Browser will show a device picker.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ─── Right: label preview grid ───────────────────── */}
          <Card className="p-4 lg:col-span-2">
            <div className="mb-3 text-xs text-muted-foreground">
              Label preview · {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filtered.map((p) => {
                const barcode = barcodeMap.get(p.variantId) || p.sku;
                return (
                  <div key={p.variantId} className="flex justify-center p-2">
                    <BarcodeCanvas
                      value={barcode}
                      format={symbology}
                      productName={p.name}
                      costCode={p.costCode}
                      dCode={p.dCode}
                      sellCode={p.sellCode}
                      batteryHealth={p.batteryHealth}
                      sellingPrice={p.sellingPrice}
                      category={p.category}
                      brand={p.brand}
                      variantName={p.variantName}
                      specs={p.specs}
                      showName={showName}
                      showSku={showSku}
                      showSellCode={showSellCode}
                      showDCode={showDCode}
                      showCostCode={showCostCode}
                      showBatteryHealth={showBatteryHealth}
                      showSellingPrice={showSellingPrice}
                      showBarcode={showBarcode}
                      showBarcodeNumber={showBarcodeNumber}
                      showStore={showStore}
                      showBorder={showBorder}
                      showSpecs={showSpecs}
                      specVisibility={specVisibility}
                    />
                  </div>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No products to preview.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
