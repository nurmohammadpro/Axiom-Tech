"use client";

import { useEffect, useRef, useState, useMemo, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { AdvanceSelect } from "@/components/ui/advance-select";
import { handleEnterAdvance } from "@/lib/focus-navigation";
import { toast } from "sonner";
import { bdt, cn } from "@/lib/utils";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { isUnitTracked } from "@/lib/product-tracking";
import {
  ArrowLeft,
  Plus,
  X,
  Package,
  Grid3X3,
  Trash2,
  Check,
  AlertCircle,
  Printer,
  Radio,
} from "lucide-react";
import {
  renderPrintLabels,
  silentPrint,
  type LabelPrintOptions,
  type LabelPrintProduct,
} from "@/lib/label-print";
import { UsbThermalPrinter, type PrinterInfo } from "@/lib/usb-printer";
import { SearchInput } from "@/components/ui/search-input";
import {
  NewProductDialog,
  type PickerProduct as ProductVariant,
} from "@/components/dashboard/new-product-dialog";
import { NewSupplierDialog } from "@/components/dashboard/new-supplier-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface POLineItem {
  id: number;
  productId: string;
  variantId: number;
  productName: string;
  variantName: string;
  sku: string;
  productType: string;
  trackUnits: boolean;
  category: string;
  brandId: number | null;
  qtyOrdered: number;
  costPrice: number;
  sellPrice: number;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  color: string | null;
}

interface IntakeUnit {
  id: number;
  lineId: number | null;
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
  // Per-unit pricing (overrides line-level pricing)
  costPrice?: number;
  sellPrice?: number;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  color?: string;
}

const UNIT_SPEC_LABELS = ["RAM", "Storage", "Color"] as const;

const CONDITION_OPTIONS = [
  "New",
  "Aslike New (95-100)",
  "Good (90-95)",
  "Average (85-90)",
  "Below Average (80-85)",
  "Bad (Issues)",
];

// The unit row renders as three stacked lines so every field stays readable:
//   line 1 — IMEI 1 (IMEI 2) · Serial · Battery % · Condition
//   line 2 — Cost Price · Sell Price · Cost Code · D Code · Sell Code
//   line 3 — RAM · Storage · Color · delete
const SHOW_IMEI2 = false;
const INTAKE_LINE1_COLS = SHOW_IMEI2
  ? "grid-cols-[1fr_1fr_1fr_80px_150px]"
  : "grid-cols-[1.4fr_1.4fr_80px_170px]";
const INTAKE_LINE2_COLS = "grid-cols-[1fr_1fr_1fr_1fr_1fr]";
const INTAKE_LINE3_COLS = "grid-cols-[1fr_1fr_1fr_32px]";

const CATEGORY_OPTIONS_FALLBACK = [
  { value: "pre-owned", label: "Pre-Owned" },
  { value: "official", label: "Official" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

let nextLineId = 1;
let nextIntakeId = 1;

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POLineItem[]>([]);

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [focusQtyItem, setFocusQtyItem] = useState<number | null>(null);

  // Intake / receive section
  const [intakeUnits, setIntakeUnits] = useState<IntakeUnit[]>([]);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);

  // ── USB label printer (same stack as the barcodes page) ──────
  const printerRef = useRef<UsbThermalPrinter | null>(null);
  const [printerInfo, setPrinterInfo] = useState<PrinterInfo>({ connected: false });
  const [printerBusy, setPrinterBusy] = useState(false);

  // Saved label settings — intake labels render exactly like barcode-page
  // labels by honoring the same toggles.
  const [labelSettings, setLabelSettings] = useState<Partial<LabelPrintOptions> | null>(null);

  useEffect(() => {
    const p = new UsbThermalPrinter();
    printerRef.current = p;
    const unsub = p.onChange(setPrinterInfo);
    p.reconnect().catch(() => {});
    return () => {
      unsub();
      p.disconnect().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.label_settings && typeof json.label_settings === "object")
          setLabelSettings(json.label_settings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // After a successful receive: confirmation-panel data — the received unit
  // codes (generated identities) plus a labels-page shortcut.
  const [receivedResult, setReceivedResult] = useState<{
    productName: string;
    codes: string[];
  } | null>(null);

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => fetch("/api/dashboard/suppliers").then((r) => r.json()),
  });

  // Fetch locations
  const { data: locations = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["locations"],
    queryFn: () => fetch("/api/dashboard/locations").then((r) => r.json()),
  });

  // Fetch brands
  const { data: brands = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["brands"],
    queryFn: () => fetch("/api/dashboard/brands").then((r) => r.json()),
  });

  // Fetch categories dynamically from the database
  const { data: dbCategories = [] } = useQuery<
    { id: number; name: string; slug: string; parentId: number | null }[]
  >({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/categories").then((r) => r.json()),
  });

  const categoryOptions = useMemo(() => {
    if (dbCategories.length > 0) {
      return dbCategories
        .filter((c) => !dbCategories.some((child) => child.parentId === c.id))
        .map((c) => ({ value: c.slug, label: c.name }));
    }
    return CATEGORY_OPTIONS_FALLBACK;
  }, [dbCategories]);

  // Search products
  const { data: searchResults = [] } = useQuery<ProductVariant[]>({
    queryKey: ["product-picker", searchQuery],
    queryFn: () =>
      fetch(`/api/dashboard/products/picker?q=${encodeURIComponent(searchQuery)}`).then((r) =>
        r.json(),
      ),
    enabled: searchQuery.length >= 2,
  });

  // Add item from picker
  const addItem = (pv: ProductVariant) => {
    const id = nextLineId++;
    setItems((prev) => [
      ...prev,
      {
        id,
        productId: pv.productId,
        variantId: pv.variantId,
        productName: pv.productName,
        variantName: pv.variantName,
        sku: pv.sku,
        productType: pv.productType,
        trackUnits: pv.trackUnits ?? false,
        category: pv.categorySlug ?? "pre-owned",
        brandId: pv.brandId ?? null,
        qtyOrdered: 1,
        costPrice: 0,
        sellPrice: 0,
        costCode: null,
        dCode: null,
        sellCode: null,
        color: null,
      },
    ]);
    setSearchQuery("");
    setShowPicker(false);
    setFocusQtyItem(id);
  };

  // Inline-created product: refresh the picker cache, then add it like a pick
  const handleProductCreated = (pv: ProductVariant) => {
    queryClient.invalidateQueries({ queryKey: ["product-picker"] });
    addItem(pv);
  };

  // Inline-created supplier: refresh the list cache and select it for this order
  const handleSupplierCreated = (s: { id: string; name: string }) => {
    queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    setSupplier(s.name);
    setSupplierId(s.id);
  };

  // Update item
  const updateItem = (id: number, patch: Partial<POLineItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  // Remove item
  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Keyboard navigation for the product picker results
  const handlePickerKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pv = searchResults[activeIndex];
      if (pv) addItem(pv);
    } else if (e.key === "Escape") {
      setShowPicker(false);
      setSearchQuery("");
    }
  };

  // Keep the active row visible while arrowing through the results
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    container.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex]);

  // Focus the qty input of a freshly added line item
  useEffect(() => {
    if (focusQtyItem === null) return;
    const el = qtyRefs.current[focusQtyItem];
    el?.focus();
    el?.select();
    setFocusQtyItem(null);
  }, [focusQtyItem]);

  // ---- Intake / receive stock ----

  // Unit intake applies to devices AND tracked accessories (each box gets its
  // own identity); plain accessories stay quantity-only.
  const deviceItems = items.filter((i) => isUnitTracked(i));
  const accessories = items.filter((i) => !isUnitTracked(i));
  const accessoryQty = accessories.reduce((s, a) => s + a.qtyOrdered, 0);
  const intakeItem = deviceItems[0];
  const totalIntakeUnits = intakeUnits.length;

  // Unit rows belong to a specific line item instance: re-adding the same
  // catalog product creates a new line (new id) and therefore a fresh grid —
  // a second intake can never inherit the previous unit's IMEI/specs.
  const intakeLineId = intakeItem?.id ?? null;
  const [intakeResetKey, setIntakeResetKey] = useState(0);

  // Total is based on cost price (what the store pays). This form prices per
  // unit, so a line's effective cost falls back to the average of its intake
  // units' prices when the line-level price is untouched.
  const effectiveLineCost = (i: (typeof items)[number]) => {
    const unitsOfLine = i.id === intakeLineId ? intakeUnits : [];
    const priced = unitsOfLine.filter((u) => (u.costPrice ?? 0) > 0);
    if (priced.length)
      return Math.round(priced.reduce((s, u) => s + (u.costPrice ?? 0), 0) / priced.length);
    return i.costPrice;
  };
  const total = items.reduce((sum, i) => sum + i.qtyOrdered * effectiveLineCost(i), 0);

  useEffect(() => {
    if (!intakeLineId) {
      setIntakeUnits((prev) => (prev.length ? [] : prev));
      return;
    }
    const qty = intakeItem?.qtyOrdered ?? 0;
    setIntakeUnits((prev) => {
      if (prev.length === 0 || prev[0].lineId !== intakeLineId) {
        return freshIntakeRows(qty);
      }
      if (prev.length < qty) {
        return [...prev, ...freshIntakeRows(qty - prev.length)];
      }
      return prev;
      function freshIntakeRows(n: number): IntakeUnit[] {
        return Array.from({ length: n }, () => ({
          id: nextIntakeId++,
          lineId: intakeLineId,
          imei1: "",
          imei2: "",
          serial: "",
          batteryHealth: "",
          conditionGrade: "",
          specs: { RAM: "", Storage: "", Color: "" },
          costPrice: 0,
          sellPrice: 0,
          costCode: "",
          dCode: "",
          sellCode: "",
          color: "",
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeLineId, intakeItem?.qtyOrdered, intakeResetKey]);

  const resetIntakeGrid = () => {
    setIntakeUnits([]);
    setIntakeResetKey((k) => k + 1);
  };

  const addIntakeUnit = () => {
    if (!intakeItem) return;
    setIntakeUnits((prev) => [
      ...prev,
      {
        id: nextIntakeId++,
        lineId: intakeLineId,
        imei1: "",
        imei2: "",
        serial: "",
        batteryHealth: "",
        conditionGrade: "",
        specs: { RAM: "", Storage: "", Color: "" },
        costPrice: 0,
        sellPrice: 0,
        costCode: "",
        dCode: "",
        sellCode: "",
        color: "",
      },
    ]);
  };

  const removeIntakeUnit = (id: number) => {
    setIntakeUnits((prev) => prev.filter((u) => u.id !== id));
  };

  const updateIntakeUnit = (id: number, patch: Partial<IntakeUnit>) => {
    setIntakeUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  // The unit's barcode value — normalized the same way the scanner lookup
  // matches real serials/IMEIs (strip spaces/dashes, uppercase). Blank for
  // auto-generated accessories: those codes only exist after receive.
  const unitIdentity = (u: IntakeUnit): string => {
    const real = u.serial || u.imei1 || u.imei2;
    return real ? real.replace(/[\s-]/g, "").toUpperCase() : "";
  };

  // Print one intake unit's label straight from the grid, before receiving —
  // same shared layout as the barcode page, honoring the saved label
  // settings. Value = IMEI/serial, forced to CODE128 because a 15-digit IMEI
  // doesn't fit EAN13/UPCA.
  const printIntakeUnit = async (u: IntakeUnit) => {
    const item = intakeItem;
    const value = unitIdentity(u);
    if (!item || !value) return;
    const s = labelSettings;
    const doc: LabelPrintProduct = {
      name: item.productName,
      costCode: u.costCode || item.costCode || undefined,
      dCode: u.dCode || item.dCode || undefined,
      sellCode: u.sellCode || item.sellCode || undefined,
      batteryHealth: u.batteryHealth ? Number(u.batteryHealth) : null,
      sellingPrice: u.sellPrice ?? item.sellPrice,
      category: item.category,
      specs: [
        u.specs.RAM && { label: "RAM", value: u.specs.RAM },
        u.specs.Storage && { label: "Storage", value: u.specs.Storage },
        (u.color || u.specs.Color) && { label: "Color", value: u.color || u.specs.Color },
      ].filter((x): x is { label: string; value: string } => !!x),
    };
    const flags = {
      showName: s?.showName ?? true,
      showSku: s?.showSku ?? true,
      showSellCode: s?.showSellCode ?? true,
      showDCode: s?.showDCode ?? true,
      showCostCode: s?.showCostCode ?? true,
      showBatteryHealth: s?.showBatteryHealth ?? true,
      showSellingPrice: s?.showSellingPrice ?? true,
      showBarcode: s?.showBarcode ?? true,
      showBarcodeNumber: s?.showBarcodeNumber ?? true,
      showStore: s?.showStore ?? true,
      showBorder: s?.showBorder ?? true,
      showSpecs: s?.showSpecs ?? true,
      specVisibility: s?.specVisibility ?? {},
    };
    if (printerInfo.connected && printerRef.current) {
      setPrinterBusy(true);
      try {
        await silentPrint(
          printerRef.current,
          [doc],
          [value],
          "CODE128",
          1,
          40,
          25,
          flags.showBorder,
          flags.showStore,
          flags.showName,
          flags.showSellCode,
          flags.showDCode,
          flags.showCostCode,
          flags.showBatteryHealth,
          flags.showSellingPrice,
          flags.showBarcode,
          flags.showBarcodeNumber,
          flags.showSku,
          flags.showSpecs,
          flags.specVisibility,
        );
      } catch (err) {
        console.error("Silent print failed:", err);
      } finally {
        setPrinterBusy(false);
      }
    } else {
      renderPrintLabels([doc], [value], {
        symbology: "CODE128",
        size: "40x25",
        copies: 1,
        ...flags,
      });
    }
  };

  const validateIntakeUnits = (): string[] => {
    const errors: string[] = [];
    const imeis: string[] = [];

    // Devices must carry a real IMEI/serial; tracked accessories may leave the
    // identity blank — the server then generates a unique PSU- code per unit.
    const identityRequired = intakeItem ? intakeItem.productType !== "accessory" : true;

    intakeUnits.forEach((u, idx) => {
      if (!u.imei1 && !u.serial) {
        if (identityRequired) {
          errors.push(`Unit ${idx + 1}: needs IMEI or serial number`);
        }
        return;
      }
      if (u.imei1) {
        const normalized = normalizeImei(u.imei1);
        if (normalized.length !== 15 || !luhnValid(normalized)) {
          errors.push(`Unit ${idx + 1}: IMEI ${u.imei1} is invalid`);
        }
        if (imeis.includes(normalized)) {
          errors.push(`Unit ${idx + 1}: duplicate IMEI ${normalized}`);
        }
        imeis.push(normalized);
      }
    });

    return errors;
  };

  const handleIntakeReceive = async () => {
    if (!supplier) {
      toast.error("Supplier is required");
      return;
    }
    const hasDeviceUnits = !!intakeItem && intakeUnits.length > 0;
    if (!hasDeviceUnits && accessoryQty === 0) {
      toast.error("Add at least one unit to receive");
      return;
    }

    const errors = validateIntakeUnits();
    if (errors.length > 0) {
      errors.forEach((e) => toast.error(e));
      return;
    }

    if (hasDeviceUnits && intakeUnits.length < intakeItem.qtyOrdered) {
      toast.warning(
        `Only ${intakeUnits.length} of ${intakeItem.qtyOrdered} units entered — the remaining units will not be received`,
      );
    }

    setIntakeSubmitting(true);
    try {
      // 1. Create the purchase order
      const poRes = await fetch("/api/dashboard/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          supplierId,
          locationId: locationId || undefined,
          notes: notes || undefined,
          items: items.map((i) => {
            // PO lines are priced at the line level, but this form prices per
            // unit — derive the line price from the intake units (average of
            // the positive per-unit prices) so a fully-priced intake doesn't
            // bounce off the API's ৳0-line validation.
            const unitsOfLine = i.id === intakeLineId ? intakeUnits : [];
            const costFromUnits = unitsOfLine.filter((u) => (u.costPrice ?? 0) > 0);
            const sellFromUnits = unitsOfLine.filter((u) => (u.sellPrice ?? 0) > 0);
            const lineCost = costFromUnits.length
              ? Math.round(
                  costFromUnits.reduce((s, u) => s + (u.costPrice ?? 0), 0) / costFromUnits.length,
                )
              : i.costPrice;
            const lineSell = sellFromUnits.length
              ? Math.round(
                  sellFromUnits.reduce((s, u) => s + (u.sellPrice ?? 0), 0) / sellFromUnits.length,
                )
              : i.sellPrice;
            // Line codes too — the receive step syncs these onto the product
            // variant, so inventory and labels can show them without the unit
            // rows being open.
            const firstCode = (pick: (u: (typeof unitsOfLine)[number]) => string | undefined) =>
              unitsOfLine.map(pick).find((c): c is string => !!c);
            return {
              productId: i.productId,
              variantId: i.variantId,
              qtyOrdered: i.qtyOrdered,
              color: i.color || undefined,
              category: i.category,
              brandId: i.brandId,
              costPrice: lineCost > 0 ? lineCost : undefined,
              sellPrice: lineSell > 0 ? lineSell : undefined,
              costCode: firstCode((u) => u.costCode) || i.costCode || undefined,
              dCode: firstCode((u) => u.dCode) || i.dCode || undefined,
              sellCode: firstCode((u) => u.sellCode) || i.sellCode || undefined,
              // Get average battery health and condition from intake units if available
              batteryHealth:
                intakeUnits.length > 0
                  ? Math.round(
                      intakeUnits.reduce(
                        (sum, u) => sum + (u.batteryHealth ? Number(u.batteryHealth) : 85),
                        0,
                      ) / intakeUnits.length,
                    )
                  : undefined,
              conditionGrade: intakeUnits.length > 0 ? intakeUnits[0].conditionGrade : undefined,
            };
          }),
        }),
      });
      if (!poRes.ok) {
        const err = await poRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create PO");
      }
      const po = await poRes.json();

      // 2. Receive against the new PO: serialized units for the device item plus
      //    accessories (non-serialized) auto-received at full ordered qty
      const recItems = [
        ...(hasDeviceUnits
          ? [
              {
                variantId: intakeItem.variantId,
                units: intakeUnits.map((u) => ({
                  imei1: u.imei1 || undefined,
                  imei2: u.imei2 || undefined,
                  serialNumber: u.serial || undefined,
                  batteryHealth: u.batteryHealth ? Number(u.batteryHealth) : undefined,
                  conditionGrade: u.conditionGrade || undefined,
                  specs: Object.fromEntries(
                    Object.entries(u.specs).filter(([, v]) => v && v.trim()),
                  ),
                  // Per-unit pricing
                  acquisitionCost: u.costPrice && u.costPrice > 0 ? u.costPrice : undefined,
                  currentPrice: u.sellPrice && u.sellPrice > 0 ? u.sellPrice : undefined,
                  costCode: u.costCode || undefined,
                  dCode: u.dCode || undefined,
                  sellCode: u.sellCode || undefined,
                  color: u.color || undefined,
                })),
              },
            ]
          : []),
        ...accessories.map((a) => ({
          variantId: a.variantId,
          quantity: a.qtyOrdered,
        })),
      ];

      const recRes = await fetch("/api/dashboard/stock/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: recItems,
          locationId: locationId || undefined,
          purchaseOrderId: po.id,
        }),
      });
      if (!recRes.ok) {
        const err = await recRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to receive stock");
      }

      const recJson = await recRes.json();
      const receivedUnits = (recJson.received ?? [])
        .flatMap((r: { units?: { unitCode: string | null }[] }) => r.units ?? [])
        .map((u: { unitCode: string | null }) => u.unitCode)
        .filter((c: string | null): c is string => Boolean(c));
      setReceivedResult({
        productName: intakeItem ? `${intakeItem.productName} — ${intakeItem.variantName}` : "",
        codes: receivedUnits,
      });
      toast.success(
        `Purchase order created and ${totalIntakeUnits + accessoryQty} units received!`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to receive stock");
    } finally {
      setIntakeSubmitting(false);
    }
  };

  const cancelIntake = () => {
    resetIntakeGrid();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/dashboard/purchases">
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h2 className="text-lg font-semibold">New Purchase Order</h2>
          <p className="text-sm text-muted-foreground">
            Create a new purchase order to receive stock
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: PO details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Supplier & Details */}
          <Card>
            <div className="p-4">
              <h3 className="text-sm font-semibold">Order Details</h3>
            </div>
            <div className="px-4 pb-4 grid gap-3 sm:grid-cols-2">
              {/* Supplier */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
                <div className="mt-1">
                  <SearchSelect
                    value={supplier}
                    onChange={(val) => {
                      setSupplier(val);
                      const found = suppliers.find((s) => s.name === val);
                      setSupplierId(found?.id ?? null);
                    }}
                    options={suppliers.map((s) => ({
                      label: s.name,
                      value: s.name,
                      keywords: [s.phone, s.email].filter(Boolean) as string[],
                    }))}
                    placeholder="Search suppliers..."
                    autoAdvance
                    onAddNew={() => setShowNewSupplier(true)}
                    addNewLabel="New supplier…"
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Receive Location
                </label>
                <AdvanceSelect
                  value={locationId}
                  onValueChange={setLocationId}
                  placeholder="Select location"
                  triggerClassName="mt-1"
                >
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.name}>
                      {l.name}
                    </SelectItem>
                  ))}
                </AdvanceSelect>
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Order notes..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          </Card>

          {/* Line Items */}
          <Card>
            <div className="p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Line Items</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {items.length} item{items.length !== 1 ? "s" : ""} • Total: {bdt(total)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
                <Plus size={14} /> Add Item
              </Button>
            </div>
            <div className="px-4 pb-4">
              {/* Product Picker Search */}
              {showPicker && (
                <div className="mb-4 p-3 rounded-lg border border-border bg-muted/50">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchInput
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setActiveIndex(0);
                        }}
                        onKeyDown={handlePickerKeyDown}
                        placeholder="Search products by name or SKU..."
                        className="w-full"
                        autoFocus
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowPicker(false);
                        setSearchQuery("");
                      }}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  {searchResults.length > 0 && (
                    <div ref={resultsRef} className="mt-2 max-h-64 overflow-y-auto space-y-1">
                      {searchResults.map((pv, idx) => (
                        <button
                          key={pv.variantId}
                          data-index={idx}
                          onClick={() => addItem(pv)}
                          className={cn(
                            "w-full p-2.5 rounded-md hover:bg-background text-left text-sm",
                            idx === activeIndex && "bg-background ring-1 ring-ring",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{pv.productName}</div>
                            <div className="text-xs text-muted-foreground">
                              {pv.variantName}
                              {pv.brandName ? ` · ${pv.brandName}` : ""}
                            </div>
                            {pv.categorySlug && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                {pv.categorySlug}
                              </span>
                            )}
                            <div className="text-xs text-muted-foreground font-mono">{pv.sku}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchQuery.length >= 2 && searchResults.length === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground text-center">
                      No products found
                    </p>
                  )}
                  {searchQuery.trim().length >= 2 && (
                    <button
                      type="button"
                      onClick={() => setShowNewProduct(true)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 p-2.5 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Plus size={14} />
                      Add &quot;{searchQuery.trim()}&quot; as new product
                    </button>
                  )}
                </div>
              )}

              {/* Post-receive confirmation — replaces the intake grid until
                  dismissed; "Receive more" starts a clean new order. */}
              {receivedResult && (
                <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Check size={16} className="text-green-600" />
                    {receivedResult.codes.length > 0
                      ? `${receivedResult.codes.length} unit${receivedResult.codes.length !== 1 ? "s" : ""} received${receivedResult.productName ? ` for ${receivedResult.productName}` : ""}`
                      : `Stock received${receivedResult.productName ? ` for ${receivedResult.productName}` : ""}`}
                  </div>
                  {receivedResult.codes.length > 0 && (
                    <div className="rounded border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        Unit codes for this receipt — print labels and stick one on each box:
                      </p>
                      <div className="font-mono text-xs space-y-0.5">
                        {receivedResult.codes.map((c) => (
                          <div key={c}>{c}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/barcodes">Print labels</Link>
                    </Button>
                    <Button size="sm" onClick={() => router.push("/dashboard/purchases")}>
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReceivedResult(null);
                        setItems([]);
                        setNotes("");
                        resetIntakeGrid();
                      }}
                    >
                      Receive more
                    </Button>
                  </div>
                </div>
              )}

              {/* Items table */}
              {items.length === 0 && !showPicker && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Package size={24} className="mx-auto mb-2 opacity-50" />
                  <p>No items added yet. Click &quot;Add Item&quot; to search for products.</p>
                </div>
              )}

              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="p-3 rounded-lg border border-border">
                      {/* Header: product name + total + remove */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.productName}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.variantName} &bull; {item.sku}
                          </div>
                        </div>
                        <div className="text-xs font-medium whitespace-nowrap">
                          {bdt(item.qtyOrdered * effectiveLineCost(item))}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeItem(item.id)}>
                          <X size={12} />
                        </Button>
                      </div>

                      {/* Row 1: Category, Brand, Qty — per-unit Color lives in
                          the Units grid below */}
                      <div className="grid grid-cols-[1fr_1fr_80px] gap-2 items-end">
                        <div>
                          <label className="text-[10px] text-muted-foreground">Category</label>
                          <AdvanceSelect
                            value={item.category}
                            onValueChange={(value) => updateItem(item.id, { category: value })}
                          >
                            {categoryOptions.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </AdvanceSelect>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Brand</label>
                          <AdvanceSelect
                            value={item.brandId?.toString() || ""}
                            onValueChange={(value) =>
                              updateItem(item.id, { brandId: value ? Number(value) : null })
                            }
                            placeholder="Select"
                          >
                            {brands.map((brand) => (
                              <SelectItem key={brand.id} value={brand.id.toString()}>
                                {brand.name}
                              </SelectItem>
                            ))}
                          </AdvanceSelect>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Qty</label>
                          <input
                            ref={(el) => {
                              qtyRefs.current[item.id] = el;
                            }}
                            type="number"
                            value={item.qtyOrdered}
                            onChange={(e) =>
                              updateItem(item.id, { qtyOrdered: Number(e.target.value) || 1 })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                // Focus next field in the intake grid
                                const firstUnitInput = document.querySelector(
                                  '[placeholder="IMEI 1"]',
                                ) as HTMLInputElement;
                                firstUnitInput?.focus();
                                firstUnitInput?.select();
                              }
                            }}
                            min={1}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-right"
                          />
                        </div>
                      </div>

                      {/* Units — merged intake for the device item. Kept out of
                          view while the confirmation panel is showing. */}
                      {item.id === intakeItem?.id && !receivedResult && (
                        <div
                          key={`intake-grid-${intakeLineId}-${intakeResetKey}`}
                          className="mt-3 border-t border-border pt-3 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold">Units</span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {intakeItem.productType === "accessory"
                                  ? "Serial optional — auto-generated per box if blank"
                                  : "IMEI/serial + specs per unit"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" onClick={addIntakeUnit}>
                                <Plus size={12} /> Add Row
                              </Button>
                            </div>
                          </div>

                          {/* Manual grid */}
                          {intakeUnits.length > 0 && (
                            <div className="space-y-1" onKeyDown={handleEnterAdvance}>
                              {intakeUnits.map((u) => (
                                <div key={u.id} className="flex items-start gap-2 w-full">
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className={cn("grid gap-2 w-full", INTAKE_LINE1_COLS)}>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          IMEI 1
                                        </span>
                                        <input
                                          type="text"
                                          value={u.imei1}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, { imei1: e.target.value })
                                          }
                                          placeholder={
                                            intakeItem.productType === "accessory"
                                              ? "auto if blank"
                                              : "IMEI 1"
                                          }
                                          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Serial
                                        </span>
                                        <input
                                          type="text"
                                          value={u.serial}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, { serial: e.target.value })
                                          }
                                          placeholder={
                                            intakeItem.productType === "accessory"
                                              ? "auto if blank"
                                              : "Serial"
                                          }
                                          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Battery %
                                        </span>
                                        <input
                                          type="number"
                                          value={u.batteryHealth}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              batteryHealth: e.target.value,
                                            })
                                          }
                                          placeholder="%"
                                          min={0}
                                          max={100}
                                          className="rounded border border-border bg-background px-2 py-1 text-xs text-right"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Condition
                                        </span>
                                        <Select
                                          value={u.conditionGrade}
                                          onValueChange={(v) =>
                                            updateIntakeUnit(u.id, { conditionGrade: v })
                                          }
                                        >
                                          <SelectTrigger className="h-7 px-2 text-xs">
                                            <SelectValue placeholder="Condition" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {CONDITION_OPTIONS.map((c) => (
                                              <SelectItem key={c} value={c}>
                                                {c}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </label>
                                    </div>
                                    <div className={cn("grid gap-2 w-full", INTAKE_LINE2_COLS)}>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Cost Code
                                        </span>
                                        <input
                                          type="text"
                                          value={u.costCode ?? ""}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, { costCode: e.target.value })
                                          }
                                          placeholder="Cost Code"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Cost Price
                                        </span>
                                        <input
                                          type="number"
                                          value={u.costPrice ?? 0}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              costPrice: Number(e.target.value) || 0,
                                            })
                                          }
                                          placeholder="Cost"
                                          min={0}
                                          className="rounded border border-border bg-background px-2 py-1 text-xs text-right"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          D Code
                                        </span>
                                        <input
                                          type="text"
                                          value={u.dCode ?? ""}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, { dCode: e.target.value })
                                          }
                                          placeholder="D Code"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Sell Code
                                        </span>
                                        <input
                                          type="text"
                                          value={u.sellCode ?? ""}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, { sellCode: e.target.value })
                                          }
                                          placeholder="Sell Code"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Sell Price
                                        </span>
                                        <input
                                          type="number"
                                          value={u.sellPrice ?? 0}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              sellPrice: Number(e.target.value) || 0,
                                            })
                                          }
                                          placeholder="Sell"
                                          min={0}
                                          className="rounded border border-border bg-background px-2 py-1 text-xs text-right"
                                        />
                                      </label>
                                    </div>
                                    <div className={cn("grid gap-2 w-full", INTAKE_LINE3_COLS)}>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          RAM
                                        </span>
                                        <input
                                          type="text"
                                          value={u.specs.RAM}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              specs: { ...u.specs, RAM: e.target.value },
                                            })
                                          }
                                          placeholder="RAM"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Storage
                                        </span>
                                        <input
                                          type="text"
                                          value={u.specs.Storage}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              specs: { ...u.specs, Storage: e.target.value },
                                            })
                                          }
                                          placeholder="Storage"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <label className="grid gap-0.5">
                                        <span className="text-[10px] text-muted-foreground">
                                          Color
                                        </span>
                                        <input
                                          type="text"
                                          value={u.color ?? u.specs.Color}
                                          onChange={(e) =>
                                            updateIntakeUnit(u.id, {
                                              specs: { ...u.specs, Color: e.target.value },
                                              color: e.target.value,
                                            })
                                          }
                                          placeholder="Color"
                                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                                        />
                                      </label>
                                      <div className="flex items-end pb-0.5">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => removeIntakeUnit(u.id)}
                                          className="w-7 h-7 p-0"
                                          title="Remove unit"
                                        >
                                          <Trash2 size={12} />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="w-17 shrink-0 self-end pb-0.5">
                                    <button
                                      type="button"
                                      onClick={() => void printIntakeUnit(u)}
                                      disabled={printerBusy || !unitIdentity(u)}
                                      className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                                      title={
                                        unitIdentity(u)
                                          ? printerInfo.connected
                                            ? "Silent print label via USB printer"
                                            : "Print label via browser dialog"
                                          : "Enter IMEI or serial first"
                                      }
                                    >
                                      {printerInfo.connected ? (
                                        <Radio size={10} />
                                      ) : (
                                        <Printer size={10} />
                                      )}
                                      Print
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {intakeUnits.length === 0 && (
                            <div className="text-center py-6 text-sm text-muted-foreground">
                              Click &quot;Add Row&quot; to start entering IMEI/serial numbers
                            </div>
                          )}

                          {/* Status + receive actions */}
                          <div className="flex items-center justify-between border-t border-border pt-2">
                            <div className="text-xs text-muted-foreground">
                              {totalIntakeUnits > 0 &&
                                intakeUnits.length < intakeItem.qtyOrdered && (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <AlertCircle size={14} className="inline" />
                                    Only {intakeUnits.length} of {intakeItem.qtyOrdered} unit
                                    {intakeItem.qtyOrdered !== 1 ? "s" : ""} entered — the rest will
                                    stay unreceived
                                  </span>
                                )}
                              {totalIntakeUnits > 0 &&
                                intakeUnits.length >= intakeItem.qtyOrdered && (
                                  <>
                                    <Check size={14} className="inline mr-1" />
                                    {intakeUnits.length} unit{intakeUnits.length !== 1 ? "s" : ""}{" "}
                                    ready to receive
                                  </>
                                )}
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={cancelIntake}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleIntakeReceive}
                                disabled={intakeSubmitting || totalIntakeUnits === 0}
                              >
                                {intakeSubmitting
                                  ? "Receiving..."
                                  : `Receive ${totalIntakeUnits} Unit${totalIntakeUnits !== 1 ? "s" : ""}`}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Accessories-only: receive at full quantity, no units needed */}
              {deviceItems.length === 0 && accessories.length > 0 && !receivedResult && (
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    Accessories are received at full quantity — no serial numbers needed
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelIntake}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleIntakeReceive}
                      disabled={intakeSubmitting || accessoryQty === 0}
                    >
                      {intakeSubmitting
                        ? "Receiving..."
                        : `Receive ${accessoryQty} Unit${accessoryQty !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right: Summary */}
        <div className="space-y-4">
          <Card>
            <div className="p-4">
              <h3 className="text-sm font-semibold">Order Summary</h3>
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Items</span>
                <span>{items.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Units</span>
                <span>{items.reduce((sum, i) => sum + i.qtyOrdered, 0)}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold">{bdt(total)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
      <NewProductDialog
        open={showNewProduct}
        onOpenChange={setShowNewProduct}
        initialName={searchQuery.trim()}
        categories={categoryOptions}
        brands={brands}
        onCreated={handleProductCreated}
      />
      <NewSupplierDialog
        open={showNewSupplier}
        onOpenChange={setShowNewSupplier}
        onCreated={handleSupplierCreated}
      />
    </>
  );
}
