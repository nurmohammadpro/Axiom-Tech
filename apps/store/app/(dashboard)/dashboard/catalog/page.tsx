"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/lib/hooks";
import { BrandsCategoriesSection } from "@/components/dashboard/catalog/brands-categories-section";
import { SpecLibrarySection } from "@/components/dashboard/catalog/spec-library-section";
import { deleteProduct, deleteProducts } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { toast } from "sonner";
import Select from "react-select";

interface BrandOpt {
  value: string;
  label: string;
}
interface CatOpt {
  value: string;
  label: string;
}

type CatalogTab = "products" | "brands" | "specs";

export default function Catalog() {
  const { data: products = [] } = useProducts({ withStock: "1" });

  const [brandOpts, setBrandOpts] = useState<BrandOpt[]>([]);
  const [categoryOpts, setCatOpts] = useState<CatOpt[]>([]);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((list: { name: string }[]) =>
        setBrandOpts(list.map((b) => ({ value: b.name, label: b.name }))),
      );
    fetch("/api/categories")
      .then((r) => r.json())
      .then((list: { name: string }[]) =>
        setCatOpts(list.map((c) => ({ value: c.name, label: c.name }))),
      );
  }, []);

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<CatalogTab>("products");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<string[] | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = products;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)),
      );
    }
    if (brandFilter) list = list.filter((p) => p.brand === brandFilter);
    if (categoryFilter) list = list.filter((p) => p.category === categoryFilter);
    return list;
  }, [products, search, brandFilter, categoryFilter]);

  const filteredIds = filtered.map((p) => p.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id)) && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.checked = allSelected;
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [allSelected, someSelected]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const rows = filtered.map((p, i) => [
    <input
      key="c"
      type="checkbox"
      className="h-3.5 w-3.5 border-border"
      checked={selectedIds.has(p.id)}
      onChange={() => toggleSelected(p.id)}
    />,
    <div key="n" className="flex items-center gap-2">
      <div className="h-8 w-8 shrink-0 border border-border" style={{ background: p.bg }} />
      <div className="min-w-0">
        <div className="truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground">
          SKU · {p.sku ?? `CH-${p.id.toUpperCase()}`}
        </div>
      </div>
    </div>,
    p.brand,
    p.category,
    <span key="p" className="font-medium">
      ৳{p.price}
    </span>,
    <span key="o" className="text-muted-foreground">
      {p.originalPrice ? `৳${p.originalPrice}` : "—"}
    </span>,
    <div key="a" className="flex items-center gap-1">
      <Link
        href={`/dashboard/catalog/edit/${p.id}`}
        className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
        title="Edit"
      >
        <Pencil size={12} />
      </Link>
      <button
        onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
        className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
        title="Delete"
      >
        <Trash2 size={12} />
      </button>
    </div>,
  ]);

  const selectStyles = {
    control: (base: any) => ({
      ...base,
      minHeight: 30,
      height: 30,
      fontSize: 13,
      background: "var(--background)",
      borderColor: "var(--border)",
      borderRadius: 0,
      boxShadow: "none",
      "&:hover": { borderColor: "var(--foreground)" },
    }),
    valueContainer: (base: any) => ({ ...base, padding: "0 6px" }),
    input: (base: any) => ({ ...base, margin: 0, padding: 0 }),
    dropdownIndicator: (base: any) => ({ ...base, padding: "0 4px" }),
    menu: (base: any) => ({
      ...base,
      background: "var(--background)",
      border: "1px solid var(--border)",
      borderRadius: 0,
      fontSize: 13,
      zIndex: 50,
    }),
    option: (base: any, state: any) => ({
      ...base,
      background: state.isSelected
        ? "var(--foreground)"
        : state.isFocused
          ? "var(--surface)"
          : "var(--background)",
      color: state.isSelected ? "var(--background)" : "var(--foreground)",
      padding: "6px 10px",
    }),
    singleValue: (base: any) => ({ ...base, color: "var(--foreground)" }),
    placeholder: (base: any) => ({ ...base, color: "var(--muted-foreground)", fontSize: 12 }),
    clearIndicator: (base: any) => ({ ...base, padding: "0 4px" }),
  };

  const tabs: { key: CatalogTab; label: string }[] = [
    { key: "products", label: "Products" },
    { key: "brands", label: "Brands & Categories" },
    { key: "specs", label: "Spec Library" },
  ];

  return (
    <>
      <div>
        <div className="mb-4 flex items-center gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors " +
                (tab === t.key
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "products" && (
          <>
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, or ID"
              label="Search Products"
              description="search by name, SKU, or product ID"
              actions={
                <>
                  <div className="w-36 self-center">
                    <Select
                      options={brandOpts}
                      placeholder="Brand"
                      isClearable
                      instanceId="filter-brand"
                      onChange={(opt) => setBrandFilter(opt?.value || null)}
                      styles={selectStyles}
                    />
                  </div>
                  <div className="w-36 self-center">
                    <Select
                      options={categoryOpts}
                      placeholder="Category"
                      isClearable
                      instanceId="filter-category"
                      onChange={(opt) => setCategoryFilter(opt?.value || null)}
                      styles={selectStyles}
                    />
                  </div>
                  <div className="self-center">
                    <Link href="/dashboard/catalog/add">
                      <Button variant="default">
                        <Plus size={13} /> Add Product
                      </Button>
                    </Link>
                  </div>
                  {selectedIds.size > 0 && (
                    <div className="self-center">
                      <Button variant="destructive" onClick={() => setBulkTarget([...selectedIds])}>
                        <Trash2 size={13} /> Delete selected ({selectedIds.size})
                      </Button>
                    </div>
                  )}
                  <span className="ml-auto self-center text-xs text-muted-foreground">
                    Showing {filtered.length} of {products.length}
                  </span>
                </>
              }
            />

            <Table
              columns={[
                <input
                  key="all"
                  ref={headerCheckboxRef}
                  type="checkbox"
                  className="h-3.5 w-3.5 border-border"
                  checked={allSelected}
                  onChange={toggleAll}
                />,
                "Product",
                "Brand",
                "Category",
                "Price",
                "Compare at",
                "",
              ]}
              rows={rows}
            />
          </>
        )}

        {tab === "brands" && <BrandsCategoriesSection />}
        {tab === "specs" && <SpecLibrarySection />}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete product"
          description={`Delete "${deleteTarget.name}"? This removes the product and all its variants. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={async () => {
            try {
              await deleteProduct(deleteTarget.id);
              toast.success("Product deleted");
              setDeleteTarget(null);
              window.location.reload();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Delete failed");
            }
          }}
        />
      )}

      {bulkTarget && (
        <ConfirmDialog
          open={!!bulkTarget}
          onOpenChange={(open) => !open && setBulkTarget(null)}
          title={`Delete ${bulkTarget.length} product${bulkTarget.length === 1 ? "" : "s"}`}
          description={`Delete ${bulkTarget.length} selected product${
            bulkTarget.length === 1 ? "" : "s"
          }? This removes the products and all their variants. This cannot be undone.`}
          confirmLabel={`Delete ${bulkTarget.length}`}
          onConfirm={async () => {
            try {
              const res = await deleteProducts(bulkTarget);
              if (res.failed.length > 0) {
                toast.error(
                  `${res.deleted.length} deleted, ${res.failed.length} skipped (received units)`,
                );
              } else {
                toast.success(
                  `${res.deleted.length} product${res.deleted.length === 1 ? "" : "s"} deleted`,
                );
              }
              setBulkTarget(null);
              setSelectedIds(new Set());
              window.location.reload();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Delete failed");
            }
          }}
        />
      )}
    </>
  );
}
