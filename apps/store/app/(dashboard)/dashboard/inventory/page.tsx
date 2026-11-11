"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pill, SortableTable } from "@/components/dashboard/dashboard-shell";
import {
  deleteVariant,
  getInventory,
  toggleVariantActive,
  updateInventoryVariant,
  type InventoryItem,
} from "@/lib/api";
import { useLocations, useSessionScope, useSettings } from "@/lib/hooks";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { LocationsManager } from "@/components/dashboard/locations-manager";
import { TransfersTab } from "@/components/dashboard/transfers-tab";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { bdt } from "@/lib/utils";
import { Eye, Pencil, Trash2, Download, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { toast } from "sonner";
import { ImeiUnitsTable } from "@/components/inventory/imei-units-table";
import { TabStrip } from "@/components/dashboard/tab-strip";

type View = "stock" | "warehouses" | "transfers";

function availableAt(item: InventoryItem, location: string | null) {
  if (!location) return item.byLocation.reduce((sum, loc) => sum + loc.available, 0);
  return item.byLocation.find((b) => b.location === location)?.available ?? 0;
}

const activeCls = "border-primary bg-primary text-primary-foreground";
const idleCls = "border-border text-muted-foreground hover:text-foreground";

export default function Inventory() {
  const qc = useQueryClient();
  const { data: inventory = [] } = useQuery({
    queryKey: ["dashboard", "inventory"],
    queryFn: getInventory,
  });
  const { data: managedLocations = [] } = useLocations();
  const { data: me } = useSessionScope();
  const scopedLocation = me?.isScoped ? (me.storeLocation ?? null) : null;
  const userRole = me?.staffRole || me?.role || "customer";
  const isOwner = userRole === "owner";
  const canAddProduct = isOwner;
  const canEditDelete = isOwner;
  const showCostPrice = isOwner;
  const [view, setView] = useState<View>("stock");
  const [q, setQ] = useState("");
  const [locFilter, setLocFilter] = useState<string>("All");
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [editingCell, setEditingCell] = useState<{ variantId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [expandedImeis, setExpandedImeis] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data: settings } = useSettings();

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "Your Shop",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "",
      email: settings?.storeEmail || "",
    }),
    [settings],
  );

  useEffect(() => {
    if (scopedLocation) setLocFilter(scopedLocation);
  }, [scopedLocation]);
  useEffect(() => {
    if (view === "stock") {
      void qc.invalidateQueries({ queryKey: ["dashboard", "locations"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
    }
  }, [view, qc]);

  const locations = useMemo(() => {
    const fromData = inventory.flatMap((i) => i.byLocation.map((b) => b.location)).filter(Boolean);
    const names = [...new Set([...managedLocations.map((l) => l.name), ...fromData])];
    const sorted = names.sort((a, b) => a.localeCompare(b));
    const visible = sorted.filter(
      (name) => managedLocations.some((l) => l.name === name) || fromData.includes(name),
    );
    if (scopedLocation) return visible.filter((name) => name === scopedLocation);
    return visible;
  }, [inventory, managedLocations, scopedLocation]);

  const activeLoc = locFilter === "All" ? null : locFilter;

  const { data: dbCategories = [] } = useQuery<
    { id: number; name: string; slug: string; parentId: number | null }[]
  >({
    queryKey: ["categories"],
    queryFn: () => fetch("/api/categories").then((r) => r.json()),
  });

  const categoryCards = useMemo(() => {
    // Main categories with exact matching using category names
    const mainCategories = [
      {
        key: "pre-owned-phones",
        label: "Pre-Owned Phones",
        exactMatch: "Pre-Owned Phones",
      },
      {
        key: "unofficial-new",
        label: "Unofficial New",
        exactMatch: "Unofficial New",
      },
      { key: "official-new", label: "Official New", exactMatch: "Official New" },
      { key: "accessories", label: "Accessories", exactMatch: "Accessories" },
    ];

    // Add dynamic categories from database, excluding the main ones and similar slugs
    const excludedSlugs = new Set([
      ...mainCategories.map((c) => c.key),
      "phones",
      "preowned-phones",
      "official-phones",
      "unofficial-new-phones",
      "official-new-phones",
    ]);

    const dbCards = dbCategories
      .filter((c) => !excludedSlugs.has(c.slug) && c.parentId !== null)
      .map((c) => ({ key: c.slug, label: c.name, exactMatch: c.name }));

    return [...mainCategories, ...dbCards];
  }, [dbCategories]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return inventory.filter((i) => {
      if (locFilter !== "All" && availableAt(i, locFilter) <= 0) return false;
      if (catFilter) {
        // Find the category card and use its exactMatch for consistent filtering
        const categoryCard = categoryCards.find((c) => c.key === catFilter);
        if (categoryCard) {
          const exactMatch = categoryCard.exactMatch || categoryCard.label;
          if ((i.category || "") !== exactMatch) return false;
        } else {
          // Fallback to direct matching if category card not found
          const itemCategory = (i.category || "").toLowerCase();
          const filterCategory = catFilter.toLowerCase();
          if (!itemCategory.includes(filterCategory) && !filterCategory.includes(itemCategory))
            return false;
        }
      }
      if (!query) return true;
      return (
        i.productName.toLowerCase().includes(query) ||
        i.variantName.toLowerCase().includes(query) ||
        i.sku.toLowerCase().includes(query) ||
        i.attribute.some((a) => a.value.toLowerCase().includes(query)) ||
        (i.barcode && i.barcode.toLowerCase().includes(query)) ||
        (i.imei1 && i.imei1.toLowerCase().includes(query)) ||
        (i.imei2 && i.imei2.toLowerCase().includes(query)) ||
        (i.serialNumber && i.serialNumber.toLowerCase().includes(query)) ||
        (i.unitIdentities && i.unitIdentities.toLowerCase().includes(query)) ||
        (i.costCode && i.costCode.toLowerCase().includes(query)) ||
        (i.dCode && i.dCode.toLowerCase().includes(query)) ||
        (i.sellCode && i.sellCode.toLowerCase().includes(query))
      );
    });
  }, [inventory, q, locFilter, catFilter, categoryCards]);

  const threshold = (i: InventoryItem) => i.lowStockThreshold ?? 5;
  const avail = (i: InventoryItem) => availableAt(i, locFilter === "All" ? null : locFilter);
  const matchesCategory = (item: InventoryItem, keyword: string) =>
    (item.category || "").toLowerCase().includes(keyword.toLowerCase());
  const stockValue = (items: InventoryItem[]) =>
    items.reduce(
      (s, i) =>
        s +
        (activeLoc
          ? (i.costPrice || 0) * availableAt(i, activeLoc)
          : i.costValue),
      0,
    );
  const totalCount = inventory.length;
  const totalValue = stockValue(inventory);
  const lowCount = inventory.filter((i) => availableAt(i, activeLoc) < threshold(i)).length;
  const inactiveCount = inventory.filter((i) => !i.active).length;

  async function onToggle(item: InventoryItem, next: boolean) {
    try {
      await toggleVariantActive(item.variantId, next);
      qc.setQueryData<InventoryItem[]>(["dashboard", "inventory"], (old) =>
        old?.map((x) => (x.variantId === item.variantId ? { ...x, active: next } : x)),
      );
      toast.success(next ? "Variant activated" : "Variant deactivated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      const res = await deleteVariant(deleteTarget.variantId);
      toast.success(res.productDeleted ? "Product deleted" : "Variant deleted");
      void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function startEdit(variantId: number, field: string, currentValue: string) {
    setEditingCell({ variantId, field });
    setEditValue(currentValue);
  }

  async function saveEdit(item: InventoryItem) {
    if (!editingCell) return;
    const { field } = editingCell;
    const raw = editValue.trim();
    try {
      if (field === "costPrice" || field === "sellingPrice") {
        const num = raw === "" ? null : Number(raw.replace(/[^0-9.]/g, ""));
        if (raw !== "" && (num === null || isNaN(num))) {
          toast.error("Enter a valid number");
          return;
        }
        if (field === "sellingPrice" && num !== null && num <= 0) {
          toast.error("Price must be greater than 0");
          return;
        }
        await updateInventoryVariant(item.variantId, { [field]: num });
      } else if (field === "quantity") {
        const num = Number(raw.replace(/[^0-9]/g, ""));
        if (isNaN(num) || num < 0) {
          toast.error("Enter a valid quantity (0 or more)");
          return;
        }
        await updateInventoryVariant(item.variantId, { quantity: num });
      } else {
        await updateInventoryVariant(item.variantId, { [field]: raw || null });
      }
      void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
      toast.success("Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
    setEditingCell(null);
  }

  function isEditing(variantId: number, field: string) {
    return editingCell?.variantId === variantId && editingCell?.field === field;
  }

  const editInput = (
    item: InventoryItem,
    field: string,
    opts?: { type?: string; inputMode?: string; w?: string },
  ) => (
    <input
      autoFocus
      type={opts?.type ?? "text"}
      inputMode={opts?.inputMode as "numeric" | "decimal" | undefined}
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void saveEdit(item);
        if (e.key === "Escape") setEditingCell(null);
      }}
      onBlur={() => void saveEdit(item)}
      className={`${opts?.w ?? "w-24"} border border-primary bg-background px-1 py-0.5 text-xs`}
    />
  );

  const columns = useMemo(() => {
    const cols: any[] = [
      {
        key: "select",
        header: "",
        sortable: false,
        render: (_: unknown, item: InventoryItem) => (
          <input
            type="checkbox"
            checked={selected.has(item.variantId)}
            onChange={(e) => {
              setSelected((prev) => {
                const n = new Set(prev);
                if (e.target.checked) n.add(item.variantId);
                else n.delete(item.variantId);
                return n;
              });
            }}
            className="h-3.5 w-3.5"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      {
        key: "productName",
        header: "Product",
        sortable: true,
        className: "max-w-[200px]",
        render: (_: unknown, item: InventoryItem) => (
          <>
            <div className="truncate font-medium">{item.productName}</div>
            <div className="truncate text-xs text-muted-foreground">{item.brand ?? ""}</div>
          </>
        ),
      },
      {
        key: "variantName",
        header: "Variant",
        sortable: true,
        render: (_: unknown, item: InventoryItem) =>
          item.variantName !== item.productName && item.variantName ? item.variantName : "—",
      },
      {
        key: "sku",
        header: "SKU",
        sortable: true,
        render: (v: string) => <span className="font-mono text-xs text-muted-foreground">{v}</span>,
      },
      {
        key: "imei",
        header: "IMEI",
        sortable: false,
        render: (_: unknown, item: InventoryItem) => (
          <span className="text-xs text-muted-foreground">
            {item.imei1 || item.imei2 || item.serialNumber || "—"}
          </span>
        ),
      },
      {
        key: "attribute",
        header: "Attribute",
        className: "max-w-[180px]",
        render: (_: unknown, item: InventoryItem) => (
          <span className="text-xs text-muted-foreground">
            {item.attribute?.length ? item.attribute.map((a) => a.value).join(" · ") : "—"}
          </span>
        ),
      },
      {
        key: "warranty",
        header: "Warranty",
        render: (v: string | null) => <span className="text-xs">{v ?? "—"}</span>,
      },
      {
        key: "stock",
        header: "Stock",
        sortable: true,
        render: (_: unknown, item: InventoryItem) => {
          const low = avail(item) < threshold(item);
          const isExpanded = expandedImeis === item.variantId;
          const units = item.units ?? [];
          const hasUnits = item.requiresUnit && units.length > 0;
          return (
            <div className="min-w-[200px]">
              {isEditing(item.variantId, "quantity") ? (
                editInput(item, "quantity", { type: "text", inputMode: "numeric", w: "w-16" })
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (hasUnits) {
                      setExpandedImeis(isExpanded ? null : item.variantId);
                    } else if (!item.requiresUnit) {
                      startEdit(item.variantId, "quantity", String(item.quantity ?? 0));
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs transition-colors ${
                    hasUnits || !item.requiresUnit
                      ? "cursor-pointer hover:border-foreground/20 hover:bg-surface"
                      : "border-transparent"
                  } ${low ? "border-red-200 bg-red-50 text-sale hover:bg-red-50" : "border-border bg-background"}`}
                  title={
                    hasUnits
                      ? isExpanded
                        ? "Hide IMEIs"
                        : `View ${units.length} IMEI${units.length > 1 ? "s" : ""}`
                      : !item.requiresUnit
                        ? "Click to edit"
                        : "Quantity is managed by serialized units"
                  }
                >
                  <span className="font-medium">
                    {avail(item)}
                    {item.requiresUnit ? " in stock" : ""}
                  </span>
                  {hasUnits && (
                    <ChevronDown
                      size={12}
                      className={`shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>
              )}
              {locFilter === "All" && item.byLocation.length > 1 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {item.byLocation.map((b) => `${b.location}:${b.available}`).join(" · ")}
                </span>
              )}
              {isExpanded && hasUnits && (
                <div className="mt-2 w-full max-w-[640px] min-w-0 overflow-x-auto">
                  <ImeiUnitsTable units={units} highlight={q} />
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "health",
        header: "Health",
        sortable: true,
        render: (_: unknown, item: InventoryItem) => {
          const a = avail(item);
          const t = threshold(item);
          let tone: "success" | "warn" | "danger" | "muted" = "success";
          let label = "Healthy";
          if (!item.active) {
            tone = "muted";
            label = "Inactive";
          } else if (a === 0) {
            tone = "danger";
            label = "Out";
          } else if (a < t) {
            tone = "danger";
            label = "Critical";
          } else if (a < t * 2) {
            tone = "warn";
            label = "Low";
          }
          return <Pill tone={tone}>{label}</Pill>;
        },
      },
    ];

    if (showCostPrice) {
      cols.push(
        {
          key: "costPrice",
          header: "Cost",
          sortable: true,
          render: (_: unknown, item: InventoryItem) =>
            isEditing(item.variantId, "costPrice") ? (
              editInput(item, "costPrice", { inputMode: "decimal" })
            ) : (
              <span
                onClick={() => startEdit(item.variantId, "costPrice", String(item.costPrice ?? ""))}
                className="cursor-pointer rounded px-1 hover:bg-surface text-muted-foreground"
                title="Click to edit"
              >
                {bdt(item.costPrice || 0)}
              </span>
            ),
        },
        {
          key: "costCode",
          header: "Cost Code",
          render: (_: unknown, item: InventoryItem) =>
            isEditing(item.variantId, "costCode") ? (
              editInput(item, "costCode", { w: "w-20" })
            ) : (
              <span
                onClick={() => startEdit(item.variantId, "costCode", item.costCode ?? "")}
                className="cursor-pointer rounded px-1 hover:bg-surface font-mono text-xs text-muted-foreground"
                title="Click to edit"
              >
                {item.costCode || "—"}
              </span>
            ),
        },
        {
          key: "dCode",
          header: "D-Code",
          render: (_: unknown, item: InventoryItem) =>
            isEditing(item.variantId, "dCode") ? (
              editInput(item, "dCode", { w: "w-20" })
            ) : (
              <span
                onClick={() => startEdit(item.variantId, "dCode", item.dCode ?? "")}
                className="cursor-pointer rounded px-1 hover:bg-surface font-mono text-xs text-muted-foreground"
                title="Click to edit"
              >
                {item.dCode || "—"}
              </span>
            ),
        },
      );
    }

    cols.push(
      {
        key: "sellingPrice",
        header: "Price",
        sortable: true,
        render: (_: unknown, item: InventoryItem) =>
          isEditing(item.variantId, "sellingPrice") ? (
            editInput(item, "sellingPrice", { inputMode: "decimal" })
          ) : (
            <span
              onClick={() => startEdit(item.variantId, "sellingPrice", String(item.sellingPrice))}
              className="cursor-pointer rounded px-1 hover:bg-surface font-semibold"
              title="Click to edit"
            >
              {bdt(item.sellingPrice)}
            </span>
          ),
      },
      {
        key: "sellCode",
        header: "Sell Code",
        render: (_: unknown, item: InventoryItem) =>
          isEditing(item.variantId, "sellCode") ? (
            editInput(item, "sellCode", { w: "w-20" })
          ) : (
            <span
              onClick={() => startEdit(item.variantId, "sellCode", item.sellCode ?? "")}
              className="cursor-pointer rounded px-1 hover:bg-surface font-mono text-xs text-muted-foreground"
              title="Click to edit"
            >
              {item.sellCode || "—"}
            </span>
          ),
      },
      {
        key: "active",
        header: "Status",
        sortable: true,
        render: (_: unknown, item: InventoryItem) => (
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={item.active}
              onChange={(e) => void onToggle(item, e.target.checked)}
              className="h-3.5 w-3.5 border-border"
              title={item.active ? "Deactivate" : "Activate"}
            />
            <Pill tone={item.active ? "success" : "muted"}>
              {item.active ? "Active" : "Inactive"}
            </Pill>
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        render: (_: unknown, item: InventoryItem) => (
          <div className="flex items-center justify-end gap-1">
            <Link
              href={`/product/${item.productId}`}
              className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
              title="View on storefront"
            >
              <Eye size={12} />
            </Link>
            {canEditDelete && (
              <>
                <Link
                  href={`/dashboard/catalog/edit/${item.productId}`}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  title="Edit"
                >
                  <Pencil size={12} />
                </Link>
                <button
                  onClick={() => setDeleteTarget(item)}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ),
      },
    );

    return cols;
  }, [showCostPrice, canEditDelete, locFilter, editValue, editingCell, expandedImeis, q, selected]);

  const tabs: { id: View; label: string }[] = [
    { id: "stock", label: "Stock" },
    ...(scopedLocation ? [] : [{ id: "warehouses" as View, label: "Warehouses" }]),
    { id: "transfers", label: "Transfers" },
  ];

  return (
    <>
      <TabStrip
        tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
        active={view}
        onChange={(k) => setView(k as View)}
      />

      {view === "warehouses" ? (
        <div className="mt-4">
          <LocationsManager />
        </div>
      ) : view === "transfers" ? (
        <div className="mt-4">
          <TransfersTab scopedFrom={scopedLocation} />
        </div>
      ) : (
        <>
          {/* Category filters — compact metric-strip, horizontally scrollable */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {(
              [
                ...categoryCards.map((c) => ({
                  key: c.key,
                  label: c.label,
                  count: inventory.filter((i) => {
                    const exactMatch = c.exactMatch || c.label;
                    return (i.category || "") === exactMatch;
                  }).length,
                  value: stockValue(
                    inventory.filter((i) => {
                      const exactMatch = c.exactMatch || c.label;
                      return (i.category || "") === exactMatch;
                    }),
                  ),
                })),
                { key: null, label: "All Products", count: totalCount, value: totalValue },
              ] as const
            ).map((card) => {
              const active = catFilter === card.key;
              return (
                <button
                  key={card.key ?? "all"}
                  type="button"
                  onClick={() => setCatFilter(active ? null : card.key)}
                  className={
                    "flex min-w-[168px] shrink-0 items-center gap-2.5 border p-2.5 text-left transition-colors " +
                    (active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/50 hover:bg-surface")
                  }
                >
                  <span
                    className={
                      "flex h-9 w-9 flex-none items-center justify-center text-xs font-bold " +
                      (active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")
                    }
                  >
                    {card.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{card.label}</span>
                    <span className="block text-[15px] font-extrabold leading-tight">{card.count.toLocaleString()}</span>
                    <span className="block text-[10.5px] text-muted-foreground">{bdt(card.value)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span>Below reorder: {lowCount}</span>
            <span>Inactive: {inactiveCount}</span>
          </div>

          <div className="mt-3">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, SKU, attribute…"
              label="Search Inventory"
              description="search by name, SKU, or attribute"
              className="w-full"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Location
              </span>
              <Select value={locFilter} onValueChange={setLocFilter}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">
                    All Warehouses <span className="ml-2 opacity-60">({inventory.length})</span>
                  </SelectItem>
                  {locations.map((loc) => {
                    const skuCount = inventory.filter((i) => availableAt(i, loc) > 0).length;
                    return (
                      <SelectItem key={loc} value={loc}>
                        {loc} <span className="ml-2 opacity-60">({skuCount})</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {canAddProduct && filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const costValue = stockValue(filtered);
                    generatePDF({
                      title: "Inventory Report",
                      storeInfo,
                      kpis: [
                        { label: "Total Products", value: String(filtered.length) },
                        {
                          label: "Total Stock",
                          value: filtered
                            .reduce((s, i) => s + availableAt(i, activeLoc), 0)
                            .toLocaleString(),
                        },
                        { label: "Total Value", value: bdtPDF(costValue) },
                      ],
                      columns: [
                        { header: "Product", key: "product" },
                        { header: "Variant", key: "variant" },
                        { header: "SKU", key: "sku", width: 22 },
                        { header: "Attribute", key: "attribute" },
                        { header: "Stock", key: "stock", width: 14, align: "right" },
                        { header: "Cost", key: "cost", width: 22, align: "right" },
                        { header: "Cost Code", key: "costCode", width: 16 },
                        { header: "D-Code", key: "dCode", width: 16 },
                        { header: "Price", key: "price", width: 22, align: "right" },
                        { header: "Sell Code", key: "sellCode", width: 16 },
                        { header: "Status", key: "status", width: 16 },
                      ],
                      rows: filtered.map((i) => ({
                        product: i.productName,
                        variant: i.variantName,
                        sku: i.sku,
                        attribute: i.attribute.map((a) => a.value).join(", ") || "—",
                        stock: String(availableAt(i, activeLoc)),
                        cost: bdtPDF(i.costPrice || 0),
                        costCode: i.costCode || "—",
                        dCode: i.dCode || "—",
                        price: bdtPDF(i.sellingPrice),
                        sellCode: i.sellCode || "—",
                        status: i.active ? "Active" : "Inactive",
                      })),
                      grandTotal: { label: "Total Inventory Value", value: bdtPDF(costValue) },
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
                        "Variant",
                        "SKU",
                        "Attribute",
                        "Warranty",
                        "Stock",
                        "Cost",
                        "Cost Code",
                        "D-Code",
                        "Price",
                        "Sell Code",
                        "Status",
                      ],
                      filtered.map((i) => [
                        i.productName,
                        i.variantName,
                        i.sku,
                        i.attribute.map((a) => a.value).join("; ") || "",
                        i.warranty || "",
                        availableAt(i, activeLoc),
                        i.costPrice || 0,
                        i.costCode || "",
                        i.dCode || "",
                        i.sellingPrice,
                        i.sellCode || "",
                        i.active ? "Active" : "Inactive",
                      ]),
                      `inventory-report-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </div>
            )}
          </div>

          {selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border border-border bg-surface px-3 py-2 text-xs">
              <span className="font-medium">{selected.size} selected</span>
              <span className="text-muted-foreground">—</span>
              <button
                onClick={async () => {
                  const ids = Array.from(selected);
                  for (const id of ids) {
                    try {
                      await toggleVariantActive(id, true);
                    } catch {}
                  }
                  setSelected(new Set());
                  void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
                  toast.success(`Activated ${ids.length} variant(s)`);
                }}
                className="border border-border bg-background px-2 py-1 hover:bg-background"
              >
                Activate
              </button>
              <button
                onClick={async () => {
                  const ids = Array.from(selected);
                  for (const id of ids) {
                    try {
                      await toggleVariantActive(id, false);
                    } catch {}
                  }
                  setSelected(new Set());
                  void qc.invalidateQueries({ queryKey: ["dashboard", "inventory"] });
                  toast.success(`Deactivated ${ids.length} variant(s)`);
                }}
                className="border border-border bg-background px-2 py-1 hover:bg-background"
              >
                Deactivate
              </button>
              <button
                onClick={() => {
                  const rows = filtered.filter((r) => selected.has(r.variantId));
                  downloadCSV(
                    ["Product", "Variant", "SKU", "Stock", "Price", "Status"],
                    rows.map((i) => [
                      i.productName,
                      i.variantName,
                      i.sku,
                      availableAt(i, activeLoc),
                      i.sellingPrice,
                      i.active ? "Active" : "Inactive",
                    ]),
                    `inventory-selected-${new Date().toISOString().split("T")[0]}.csv`,
                  );
                  toast.success("CSV exported");
                }}
                className="border border-border bg-background px-2 py-1 hover:bg-background"
              >
                Export CSV
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

          <div className="mt-3">
            <SortableTable
              rowKey={(item) => item.variantId}
              selectable
              pageSize={25}
              columns={columns}
              data={filtered}
              defaultSortColumn="productName"
              emptyMessage={
                locFilter !== "All"
                  ? `No stock at ${locFilter}. Receive units into this location to see them here.`
                  : "No inventory yet. Add a product to get started."
              }
            />
          </div>
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete variant"
          description={`Delete "${deleteTarget.variantName && deleteTarget.variantName !== deleteTarget.productName ? `${deleteTarget.productName} · ${deleteTarget.variantName}` : deleteTarget.productName}"? This removes the variant and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
