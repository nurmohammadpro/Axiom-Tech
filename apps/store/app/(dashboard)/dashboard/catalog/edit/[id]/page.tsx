"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, X, Upload } from "lucide-react";
import { SearchSelect } from "@/components/ui/search-select";
import { useSessionScope } from "@/lib/hooks";
import {
  VariantCombosEditor,
  buildComboRows,
  comboKey,
  EMPTY_COMBO_VALUES,
  parseAxis,
  type ComboValues,
  type LegacyVariantRow,
} from "@/components/dashboard/catalog/variant-combos-editor";

interface BrandData {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
}

interface CategoryData {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
}

interface SpecItem {
  label: string;
  value: string;
}

interface VariantAttr {
  name: string;
  value: string;
}

interface VariantItem {
  id: number;
  name: string;
  attribute: VariantAttr[];
  sku: string;
  sellingPrice: number;
  costPrice: number | null;
  quantity: number;
}

export default function EditProduct() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSessionScope();

  const userRole = session?.staffRole || session?.role || "customer";
  const isOwner = userRole === "owner";

  const [loading, setLoading] = useState(true);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);

  const [name, setName] = useState("");
  const [trackUnits, setTrackUnits] = useState(false);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [specs, setSpecs] = useState<SpecItem[]>([]);
  const [specTemplates, setSpecTemplates] = useState<{ id: number; label: string }[]>([]);
  const [pickedSpec, setPickedSpec] = useState("");
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Existing catalog rows for the live duplicate check (name + category).
  const [existingProducts, setExistingProducts] = useState<
    { id: string; name: string; category: string | null }[]
  >([]);

  // Variant editor state — fixed Storage/Color axes plus legacy variants that
  // don't fit either axis (kept verbatim so a save never drops them).
  const [hasVariants, setHasVariants] = useState(false);
  const [storageInput, setStorageInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [comboValues, setComboValues] = useState<Record<string, ComboValues>>({});
  const [legacyRows, setLegacyRows] = useState<LegacyVariantRow[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch(`/api/dashboard/products/${id}`).then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
    ])
      .then(([brandsData, categoriesData, product]) => {
        setBrands(brandsData);
        setCategories(categoriesData);
        setName(product.name || "");
        setTrackUnits(product.trackUnits === true);
        setCategory(product.category || "");
        setBrand(product.brand || "");
        setCostPrice(product.costPrice?.toString() ?? "");
        setSellingPrice(product.price?.toString() ?? "");
        setImages(product.images || []);
        setSpecs(product.specs || []);
        setVariants(product.variants || []);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Failed to load product");
      })
      .finally(() => setLoading(false));
    fetch("/api/spec-templates")
      .then((r) => r.json())
      .then(setSpecTemplates);
    fetch("/api/dashboard/products")
      .then((r) => r.json())
      .then(setExistingProducts)
      .catch(() => {});
  }, [id]);

  // Reconstruct variant editor state from loaded variants. Pure Storage/Color
  // combos feed the two axis inputs + saved prices map (rows regenerate 1:1);
  // anything else becomes a legacy row saved verbatim.
  useEffect(() => {
    const attrs = variants.filter((v) => v.attribute.length > 0);
    if (attrs.length === 0) return;

    setHasVariants(true);

    const storages = new Set<string>();
    const colors = new Set<string>();
    const saved: Record<string, ComboValues> = {};
    const legacy: LegacyVariantRow[] = [];
    const legacyKeys = new Map<string, number>();

    for (const v of attrs) {
      const st = v.attribute.find((a) => a.name === "Storage");
      const co = v.attribute.find((a) => a.name === "Color");
      const pureAxisCount = (st ? 1 : 0) + (co ? 1 : 0);
      if (pureAxisCount > 0 && v.attribute.length === pureAxisCount) {
        if (st) storages.add(st.value);
        if (co) colors.add(co.value);
        saved[comboKey(st?.value ?? null, co?.value ?? null)] = {
          cost: v.costPrice?.toString() ?? "",
          sell: v.sellingPrice?.toString() ?? "",
          qty: String(v.quantity ?? 0),
        };
      } else {
        // Legacy variant: non-Storage/Color attribute names (or mixed) — keep
        // as its own row so a save never silently drops it.
        const base = v.attribute.map((a) => `${a.name}:${a.value}`).join("|");
        const n = legacyKeys.get(base) ?? 0;
        legacyKeys.set(base, n + 1);
        legacy.push({
          key: n === 0 ? base : `${base}#${n}`,
          label: v.attribute.map((a) => a.value).join(" / "),
          attrs: v.attribute,
          values: {
            cost: v.costPrice?.toString() ?? "",
            sell: v.sellingPrice?.toString() ?? "",
            qty: String(v.quantity ?? 0),
          },
        });
      }
    }

    setStorageInput([...storages].join(", "));
    setColorInput([...colors].join(", "));
    setComboValues(saved);
    setLegacyRows(legacy);
  }, [variants]);

  const comboRows = useMemo(
    () => buildComboRows(parseAxis(storageInput), parseAxis(colorInput), comboValues),
    [storageInput, colorInput, comboValues],
  );

  const addImage = () => {
    if (imageUrl.trim()) {
      setImages((prev) => [...prev, imageUrl.trim()]);
      setImageUrl("");
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const addSpec = () => setSpecs((prev) => [...prev, { label: "", value: "" }]);
  const updateSpec = (index: number, field: "label" | "value", val: string) =>
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: val } : s)));
  const removeSpec = (index: number) => setSpecs((prev) => prev.filter((_, i) => i !== index));

  const addFromTemplate = () => {
    const label = pickedSpec.trim();
    if (!label) return;
    const exists = specs.some((s) => s.label.trim().toLowerCase() === label.toLowerCase());
    if (exists) {
      toast.info("Spec label already added");
    } else {
      setSpecs((prev) => [...prev, { label, value: "" }]);
      toast.success(`Added "${label}"`);
    }
    setPickedSpec("");
  };

  // Variant editor field handlers
  const updateComboField = (key: string, field: keyof ComboValues, value: string) => {
    setComboValues((prev) => ({
      ...prev,
      [key]: { ...EMPTY_COMBO_VALUES, ...(prev[key] ?? {}), [field]: value },
    }));
  };

  const updateLegacyField = (key: string, field: "cost" | "sell", value: string) => {
    setLegacyRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, values: { ...r.values, [field]: value } } : r)),
    );
  };

  const removeLegacyRow = (key: string) => {
    setLegacyRows((prev) => prev.filter((r) => r.key !== key));
  };

  // Live duplicate check: same product name (case/whitespace-insensitive),
  // excluding this product itself. A match in a different category is allowed.
  const trimmedName = name.trim();
  const nameMatches = trimmedName
    ? existingProducts.filter(
        (p) => p.id !== id && p.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      )
    : [];
  const categoryMatch = nameMatches.find(
    (p) =>
      category.trim() !== "" &&
      (p.category ?? "").trim().toLowerCase() === category.trim().toLowerCase(),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      toast.error("Product name is required");
      return;
    }
    if (categoryMatch) {
      const where = categoryMatch.category ?? "no category";
      toast.error(
        'A product named "' + categoryMatch.name + '" already exists in category "' + where + '"',
      );
      return;
    }

    const pricedComboRows = comboRows.filter((r) => r.values.sell !== "");
    const pricedLegacyRows = legacyRows.filter((r) => r.values.sell !== "");
    const hasVariantPrices =
      hasVariants && (pricedComboRows.length > 0 || pricedLegacyRows.length > 0);
    if (!hasVariantPrices && !sellingPrice) {
      toast.error("Selling price is required");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        name,
        brand,
        category,
        trackUnits,
        price: Math.round(parseFloat(sellingPrice || "0")),
        costPrice: costPrice ? Math.round(parseFloat(costPrice)) : null,
        short: name,
        description: name,
        images,
        specs: specs.filter((s) => s.label && s.value),
      };

      if (hasVariants && (pricedComboRows.length > 0 || pricedLegacyRows.length > 0)) {
        body.variants = [
          ...pricedComboRows.map((r) => ({
            name: r.label,
            attribute: [
              ...(r.storage ? [{ name: "Storage", value: r.storage }] : []),
              ...(r.color ? [{ name: "Color", value: r.color }] : []),
            ],
            sku: `SKU-${id}-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            costPrice: r.values.cost ? Math.round(parseFloat(r.values.cost)) : null,
            sellingPrice: Math.round(parseFloat(r.values.sell)),
          })),
          ...pricedLegacyRows.map((r) => ({
            name: r.label,
            attribute: r.attrs, // original attribute names preserved
            sku: `SKU-${id}-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            costPrice: r.values.cost ? Math.round(parseFloat(r.values.cost)) : null,
            sellingPrice: Math.round(parseFloat(r.values.sell)),
          })),
        ];
      }

      const res = await fetch(`/api/dashboard/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success("Product updated");
      router.push("/dashboard/catalog");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setSubmitting(false);
    }
  };

  function field(
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; placeholder?: string },
  ) {
    return (
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </label>
        <input
          type={opts?.type || "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts?.placeholder}
          className="w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Loading product…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium">Edit Product</div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => router.back()} variant="surface">
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={submitting}>
            {submitting ? "Saving…" : "Update Product"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Product Details</div>
          <div className="grid gap-3">
            {field("Product Name", name, setName, { placeholder: "e.g. iPhone 16 Pro Max" })}
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={trackUnits} onCheckedChange={(v) => setTrackUnits(v === true)} />
              <span className="text-xs text-muted-foreground">
                Track individual units (unique barcode per box) — applies to accessories
              </span>
            </label>
            {categoryMatch ? (
              <p className="text-xs text-sale">
                A product named "{categoryMatch.name}" already exists in category "
                {categoryMatch.category ?? "no category"}" — duplicates are not allowed.
              </p>
            ) : nameMatches.length > 0 ? (
              <p className="text-xs text-sale">
                "{nameMatches[0].name}" already exists in{" "}
                {[...new Set(nameMatches.map((m) => m.category ?? "no category"))].join(", ")} —
                pick a different category or rename to avoid a duplicate.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c) => !categories.some((child) => child.parentId === c.id))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Brand
                </label>
                <SearchSelect
                  options={brands.map((b) => ({ value: b.name, label: b.name }))}
                  value={brand}
                  onChange={setBrand}
                  placeholder="Select brand"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isOwner &&
                field("Cost Price (৳)", costPrice, setCostPrice, {
                  type: "number",
                  placeholder: "0.00",
                })}
              {field("Selling Price (৳)", sellingPrice, setSellingPrice, {
                type: "number",
                placeholder: "0.00",
              })}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Images</div>
          <div className="flex gap-2">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste image URL…"
              className="flex-1 border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
            />
            <Button type="button" onClick={addImage} disabled={!imageUrl.trim()} variant="surface">
              Add
            </Button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-foreground">
            <Upload size={14} /> Upload from device
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" className="h-20 w-full border border-border object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute right-0.5 top-0.5 hidden rounded-sm bg-background/80 p-0.5 text-foreground group-hover:block"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Variants */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Variants</div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hasVariants}
              onChange={(e) => {
                setHasVariants(e.target.checked);
                if (!e.target.checked) {
                  setStorageInput("");
                  setColorInput("");
                  setComboValues({});
                  setLegacyRows([]);
                }
              }}
              className="h-3.5 w-3.5"
            />
            This product has variants
          </label>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Stock levels are managed on the Inventory page.
        </p>

        {hasVariants && (
          <div className="mt-3">
            <VariantCombosEditor
              storageInput={storageInput}
              colorInput={colorInput}
              onStorageInputChange={setStorageInput}
              onColorInputChange={setColorInput}
              rows={comboRows}
              legacyRows={legacyRows}
              onFieldChange={updateComboField}
              onLegacyFieldChange={updateLegacyField}
              onLegacyRemove={removeLegacyRow}
              isOwner={isOwner}
              showQty={false}
            />
          </div>
        )}
      </Card>

      {/* Specifications */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Specifications</div>
          <Button type="button" onClick={addSpec} variant="surface">
            <Plus size={13} /> Add specification
          </Button>
        </div>

        {specTemplates.length > 0 && (
          <div className="mt-3 flex items-center gap-2 border border-border bg-surface p-2">
            <Select value={pickedSpec} onValueChange={setPickedSpec}>
              <SelectTrigger className="min-w-0 flex-1">
                <SelectValue placeholder="Pick a spec…" />
              </SelectTrigger>
              <SelectContent>
                {specTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.label}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="default"
              onClick={addFromTemplate}
              disabled={!pickedSpec}
            >
              Add
            </Button>
          </div>
        )}

        {specs.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No specifications yet. Add product specs like "Processor", "Display", etc.
          </p>
        )}

        <div className="mt-3 space-y-3">
          {specs.map((spec, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Spec {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeSpec(i)}
                  className="text-muted-foreground hover:text-sale"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                    Label
                  </label>
                  <input
                    value={spec.label}
                    onChange={(e) => updateSpec(i, "label", e.target.value)}
                    placeholder="e.g. Processor"
                    className="w-full border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                  />
                </div>
                <div className="sm:col-span-2">
                  <SpecValueEditor
                    value={spec.value}
                    onChange={(val) => updateSpec(i, "value", val)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </form>
  );
}

function SpecValueEditor({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  const applyBold = () => {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      const before = value.slice(0, start);
      const after = value.slice(start);
      onChange(`${before}**text**${after}`);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + 2, start + 6);
      });
    } else {
      const before = value.slice(0, start);
      const sel = value.slice(start, end);
      const after = value.slice(end);
      onChange(`${before}**${sel}**${after}`);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + 2, end + 2);
      });
    }
  };

  const applyBullet = () => {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const before = value.slice(0, lineStart);
    const after = value.slice(lineStart);
    onChange(`${before}- ${after}`);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + 2, lineStart + 2);
    });
  };

  return (
    <div>
      <div className="mb-1 flex gap-1">
        <button
          type="button"
          onClick={applyBold}
          className="border border-border px-2 py-0.5 text-xs font-bold hover:bg-surface"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={applyBullet}
          className="border border-border px-2 py-0.5 text-xs hover:bg-surface"
          title="Bullet list"
        >
          • List
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground">**bold** · - bullet</span>
      </div>
      <textarea
        ref={textRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="e.g. A18 Pro chip** with 6-core GPU&#10;&#10;- Up to 20% faster CPU&#10;- 16-core Neural Engine"
        className="w-full resize-y border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
      />
    </div>
  );
}
