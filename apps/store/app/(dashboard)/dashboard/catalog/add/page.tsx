"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
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
import { AdvanceSelect } from "@/components/ui/advance-select";
import { Checkbox } from "@/components/ui/checkbox";
import { handleEnterAdvance } from "@/lib/focus-navigation";
import { useSessionScope } from "@/lib/hooks";
import {
  VariantCombosEditor,
  buildComboRows,
  EMPTY_COMBO_VALUES,
  parseAxis,
  type ComboValues,
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

interface WarrantyData {
  id: number;
  name: string;
  durationValue: number;
  durationUnit: string;
}

export default function AddProduct() {
  const router = useRouter();
  const { data: session } = useSessionScope();
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [warrantyPolicies, setWarrantyPolicies] = useState<WarrantyData[]>([]);

  const userRole = session?.staffRole || session?.role || "customer";
  const isOwner = userRole === "owner";

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then(setBrands);
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
    fetch("/api/dashboard/warranty-policies")
      .then((r) => r.json())
      .then(setWarrantyPolicies);
    fetch("/api/spec-templates")
      .then((r) => r.json())
      .then(setSpecTemplates);
    fetch("/api/dashboard/products")
      .then((r) => r.json())
      .then(setExistingProducts)
      .catch(() => {});
  }, []);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState<"new" | "accessory">("new");
  const [trackUnits, setTrackUnits] = useState(false);
  const [warrantyPolicyId, setWarrantyPolicyId] = useState("");
  const [published, setPublished] = useState(true);
  const [quantity, setQuantity] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  // Fixed Storage/Color axes — combos are generated from these inputs
  const [storageInput, setStorageInput] = useState("");
  const [colorInput, setColorInput] = useState("");
  const [comboValues, setComboValues] = useState<Record<string, ComboValues>>({});
  const [submitting, setSubmitting] = useState(false);
  const [specs, setSpecs] = useState<{ label: string; value: string }[]>([]);
  const [specTemplates, setSpecTemplates] = useState<{ id: number; label: string }[]>([]);
  const [pickedSpec, setPickedSpec] = useState("");
  // Existing catalog rows for the live duplicate check (name + category).
  const [existingProducts, setExistingProducts] = useState<
    { id: string; name: string; category: string | null }[]
  >([]);

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

  const updateComboField = (key: string, field: keyof ComboValues, value: string) => {
    setComboValues((prev) => ({
      ...prev,
      [key]: { ...EMPTY_COMBO_VALUES, ...(prev[key] ?? {}), [field]: value },
    }));
  };

  const comboRows = useMemo(
    () => buildComboRows(parseAxis(storageInput), parseAxis(colorInput), comboValues),
    [storageInput, colorInput, comboValues],
  );

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

  // Live duplicate check: same product name (case/whitespace-insensitive).
  // A match in a DIFFERENT category is allowed (e.g. a phone sold as Official
  // New and as Pre-Owned Phones are two products) — only a match in the
  // selected category blocks saving.
  const trimmedName = name.trim();
  const nameMatches = trimmedName
    ? existingProducts.filter((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase())
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

    setSubmitting(true);

    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const productId = `${baseId}-${Date.now().toString(36)}`;
    const isDevice = productType !== "accessory";

    try {
      const body: Record<string, any> = {
        id: productId,
        name,
        brand,
        category,
        productType,
        trackUnits: productType === "accessory" && trackUnits ? true : undefined,
        publishStatus: published ? "published" : "draft",
        warrantyPolicyId: warrantyPolicyId ? Number(warrantyPolicyId) : null,
        // Price/cost are set later via the purchase-order pipeline.
        price: 0,
        costPrice: null,
        originalPrice: null,
        short: name,
        description: name,
        bgColor: "#f2f2f4",
        textColor: "#1d1d1f",
        inStock: true,
        images,
        specs: specs.filter((s) => s.label && s.value),
      };

      if (hasVariants && comboRows.length > 0) {
        body.variants = comboRows.map((r) => {
          const attrs = [
            ...(r.storage ? [{ name: "Storage", value: r.storage }] : []),
            ...(r.color ? [{ name: "Color", value: r.color }] : []),
          ];
          const sku = `SKU-${productId}-${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return {
            name: r.label,
            attribute: attrs,
            sku,
            barcode: `BC${sku.replace(/[^A-Z0-9]/gi, "")}`,
            costPrice: r.values.cost ? Math.round(parseFloat(r.values.cost)) : null,
            sellingPrice: r.values.sell ? Math.round(parseFloat(r.values.sell)) : null,
            quantity: isDevice ? 0 : parseInt(r.values.qty) || 0,
          };
        });
      } else {
        body.quantity = isDevice ? 0 : parseInt(quantity) || 0;
      }

      const res = await fetch("/api/dashboard/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      toast.success("Product created");
      router.push("/dashboard/catalog");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create product");
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

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleEnterAdvance}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium">Add Product</div>
        <div className="flex gap-2">
          <Button type="button" onClick={() => router.back()} variant="surface">
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={submitting}>
            {submitting ? "Saving…" : "Save Product"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Product Details</div>
          <div className="grid gap-3">
            {field("Product Name", name, setName, { placeholder: "e.g. iPhone 16 Pro Max" })}
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
                <AdvanceSelect
                  value={category}
                  onValueChange={setCategory}
                  placeholder="Select category"
                  triggerClassName="w-full"
                >
                  {categories
                    .filter((c) => !categories.some((child) => child.parentId === c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                </AdvanceSelect>
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
                  autoAdvance
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Product type
                </label>
                <AdvanceSelect
                  value={productType}
                  onValueChange={(v) => setProductType(v as "new" | "accessory")}
                  triggerClassName="w-full"
                >
                  <SelectItem value="new">Device (serialized, IMEI)</SelectItem>
                  <SelectItem value="accessory">Accessory</SelectItem>
                </AdvanceSelect>
                {productType === "accessory" && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={trackUnits}
                      onCheckedChange={(v) => setTrackUnits(v === true)}
                    />
                    <span className="text-xs text-muted-foreground">
                      Track individual units — unique barcode per box (stickers printed after
                      receiving)
                    </span>
                  </label>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Warranty
                </label>
                <AdvanceSelect
                  value={warrantyPolicyId}
                  onValueChange={setWarrantyPolicyId}
                  placeholder="No warranty"
                  triggerClassName="w-full"
                >
                  {warrantyPolicies.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </AdvanceSelect>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <label className="text-sm text-muted-foreground">
                Published — visible in storefront & POS
              </label>
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

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                }
              }}
              className="h-3.5 w-3.5"
            />
            This product has variants
          </label>
        </div>

        {!hasVariants && productType === "accessory" && (
          <div className="mt-3">
            {field("Quantity", quantity, setQuantity, { type: "number", placeholder: "0" })}
          </div>
        )}

        {hasVariants && (
          <div className="mt-3">
            <VariantCombosEditor
              storageInput={storageInput}
              colorInput={colorInput}
              onStorageInputChange={setStorageInput}
              onColorInputChange={setColorInput}
              rows={comboRows}
              onFieldChange={updateComboField}
              isOwner={isOwner}
              showQty={productType === "accessory"}
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
            Add product specifications like "Processor", "Display", "Battery" with formatted values.
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
      // No selection — insert placeholder
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
