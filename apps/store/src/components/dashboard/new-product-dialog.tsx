"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdvanceSelect } from "@/components/ui/advance-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { SelectItem } from "@/components/ui/select";
import { handleEnterAdvance } from "@/lib/focus-navigation";

/**
 * Shape returned by /api/dashboard/products/picker — shared between the
 * purchase intake page and this dialog so an inline-created product can be
 * fed straight into addItem().
 */
export interface PickerProduct {
  productId: string;
  productName: string;
  productType: string;
  trackUnits?: boolean;
  brandId: number | null;
  brandName: string | null;
  categoryId: number | null;
  categorySlug: string | null;
  variantId: number;
  variantName: string;
  sku: string;
  sellingPrice: number;
  costPrice: number | null;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  quantity: number;
}

interface NewProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  /** Top-level catalog categories as {value: slug, label: name}. */
  categories: { value: string; label: string }[];
  brands: { id: number; name: string }[];
  onCreated: (pv: PickerProduct) => void;
}

/**
 * Inline product creation for purchase intake: creates the product in the
 * catalog (published) via POST /api/dashboard/products — the same endpoint the
 * catalog Add Product page uses — then hands the new variant back to the caller.
 * Missing brands/categories can be quick-created on the spot. Cost/sell codes
 * and prices are left to the line item, where the purchase pipeline fills them.
 */
export function NewProductDialog({
  open,
  onOpenChange,
  initialName,
  categories,
  brands,
  onCreated,
}: NewProductDialogProps) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [serialized, setSerialized] = useState(true);
  const [trackUnits, setTrackUnits] = useState(false);
  const [warrantyPolicyId, setWarrantyPolicyId] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [brandId, setBrandId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Quick-create state for brand/category that don't exist yet
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);

  const { data: warranties = [] } = useQuery<
    { id: number; name: string; durationValue: number; durationUnit: string }[]
  >({
    queryKey: ["warranty-policies"],
    queryFn: () => fetch("/api/dashboard/warranty-policies").then((r) => r.json()),
    enabled: open,
  });

  // Fresh form every time the dialog opens, pre-filled from the picker query
  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setSerialized(true);
    setWarrantyPolicyId("");
    setCategorySlug("");
    setBrandId("");
    setShowNewCategory(false);
    setNewCategoryName("");
    setShowNewBrand(false);
    setNewBrandName("");
  }, [open, initialName]);

  const createCategory = async () => {
    const value = newCategoryName.trim();
    if (!value || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/dashboard/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategorySlug(data.slug);
      setShowNewCategory(false);
      setNewCategoryName("");
      toast.success(`Category "${data.name}" created`);
    } finally {
      setCreatingCategory(false);
    }
  };

  const createBrand = async () => {
    const value = newBrandName.trim();
    if (!value || creatingBrand) return;
    setCreatingBrand(true);
    try {
      const res = await fetch("/api/dashboard/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
      setBrandId(String(data.id));
      setShowNewBrand(false);
      setNewBrandName("");
      toast.success(`Brand "${data.name}" created`);
    } finally {
      setCreatingBrand(false);
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Product name is required");
      return;
    }
    if (!categorySlug) {
      toast.error("Select or create a category");
      return;
    }
    if (submitting) return;

    // resolveBrandId/resolveCategoryId on the server match by NAME, not slug
    const selectedCategory = categories.find((c) => c.value === categorySlug);
    const selectedBrand = brands.find((b) => String(b.id) === brandId);

    setSubmitting(true);
    try {
      const baseId =
        trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "product";

      // Same payload shape the catalog Add Product page sends; SKU/barcode are
      // generated server-side and the default variant is created automatically.
      // Price/codes stay 0/empty — they are set on the line item and flow into
      // the variant when the stock is received.
      const res = await fetch("/api/dashboard/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `${baseId}-${Date.now().toString(36)}`,
          name: trimmedName,
          brand: selectedBrand?.name ?? null,
          category: selectedCategory?.label ?? null,
          // Serialized devices get IMEI/serial tracking; non-serialized items
          // are received as plain accessory quantities — unless "track units"
          // is on, which keeps accessory semantics but stock-keeps per box
          // with a generated unique barcode per unit.
          productType: serialized ? "new" : "accessory",
          trackUnits: !serialized && trackUnits ? true : undefined,
          publishStatus: "published",
          warrantyPolicyId: warrantyPolicyId ? Number(warrantyPolicyId) : null,
          price: 0,
          short: trimmedName,
          description: trimmedName,
          inStock: true,
          images: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `HTTP ${res.status}`);
        return;
      }
      const variant = data.variants?.[0];
      if (!variant) {
        toast.error("Product created but no variant was returned");
        return;
      }

      onCreated({
        productId: data.id,
        productName: data.name,
        productType: data.productType ?? (serialized ? "new" : "accessory"),
        trackUnits: !serialized && trackUnits ? true : undefined,
        brandId: selectedBrand?.id ?? null,
        brandName: selectedBrand?.name ?? null,
        categoryId: typeof data.categoryId === "number" ? data.categoryId : null,
        categorySlug,
        variantId: variant.id,
        variantName: "Default",
        sku: variant.sku,
        sellingPrice: 0,
        costPrice: null,
        costCode: null,
        dCode: null,
        sellCode: null,
        quantity: 0,
      });
      queryClient.invalidateQueries({ queryKey: ["product-picker"] });
      toast.success(`Product "${data.name}" added to catalog`);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const inputKeyDown = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
          <DialogDescription>
            Creates the product in the catalog and adds it to this purchase order. Cost and sell
            codes are filled on the line item after adding.
          </DialogDescription>
        </DialogHeader>

        {/* The form scopes handleEnterAdvance/SearchSelect/AdvanceSelect
            Enter-advance to the modal fields, so Enter walks
            Name → Category → Brand → Warranty. */}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label className="text-[10px] text-muted-foreground">Product name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleEnterAdvance}
              placeholder="e.g. iPhone 15 Pro"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Category</label>
              {/* Searchable select with the quick-create action pinned below the
                  results, so it stays reachable in long lists (many brands). */}
              <SearchSelect
                value={categorySlug}
                onChange={(v) => {
                  setCategorySlug(v);
                  setShowNewCategory(false);
                }}
                options={categories}
                placeholder="Category"
                autoAdvance
                onAddNew={() => setShowNewCategory(true)}
                addNewLabel="New category…"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Brand</label>
              <SearchSelect
                value={brandId}
                onChange={(v) => {
                  setBrandId(v);
                  setShowNewBrand(false);
                }}
                options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
                placeholder="Brand"
                autoAdvance
                onAddNew={() => setShowNewBrand(true)}
                addNewLabel="New brand…"
              />
            </div>
          </div>

          {showNewCategory && (
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={inputKeyDown(createCategory)}
                placeholder="New category name"
                autoFocus
              />
              <Button
                variant="outline"
                onClick={createCategory}
                disabled={creatingCategory || !newCategoryName.trim()}
              >
                Create
              </Button>
            </div>
          )}

          {showNewBrand && (
            <div className="flex gap-2">
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={inputKeyDown(createBrand)}
                placeholder="New brand name"
                autoFocus
              />
              <Button
                variant="outline"
                onClick={createBrand}
                disabled={creatingBrand || !newBrandName.trim()}
              >
                Create
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Stock type</label>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded border border-border bg-background px-2">
                <Checkbox checked={serialized} onCheckedChange={(v) => setSerialized(v === true)} />
                <span className="text-xs">Serialized device (IMEI/serial)</span>
              </label>
              {!serialized && (
                <label className="mt-1 flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={trackUnits}
                    onCheckedChange={(v) => setTrackUnits(v === true)}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Track individual units (unique barcode per box)
                  </span>
                </label>
              )}
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Warranty</label>
              <AdvanceSelect
                value={warrantyPolicyId}
                onValueChange={setWarrantyPolicyId}
                placeholder="No warranty"
              >
                {warranties.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name}
                  </SelectItem>
                ))}
              </AdvanceSelect>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim() || !categorySlug}>
              Create &amp; Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
