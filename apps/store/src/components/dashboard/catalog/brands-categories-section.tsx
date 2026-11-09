"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Table } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useProducts, useCategories } from "@/lib/hooks";
import * as api from "@/lib/api";
import { ChevronRight, Plus, Pencil, Trash2, X, Check } from "lucide-react";

function InlineEdit({
  value,
  otherNames,
  onSave,
  onCancel,
}: {
  value: string;
  otherNames: string[];
  onSave: (v: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(value);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  // Live duplicate warning: same name ignoring case/whitespace.
  const duplicateName = trimmed
    ? otherNames.find((n) => n.trim().toLowerCase() === trimmed.toLowerCase())
    : undefined;
  return (
    <div>
      <div className="flex items-center gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-28 border border-border bg-background px-2 py-0.5 text-sm outline-none focus:border-foreground"
        />
        <button
          onClick={async () => {
            if (!trimmed || name === value || duplicateName) return;
            setBusy(true);
            try {
              await onSave(trimmed);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !trimmed || name === value || !!duplicateName}
          className="p-0.5 text-primary hover:text-foreground"
        >
          <Check size={14} />
        </button>
        <button onClick={onCancel} className="p-0.5 text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      {duplicateName && (
        <p className="mt-0.5 text-xs text-sale">"{duplicateName}" already exists.</p>
      )}
    </div>
  );
}

function AddForm({
  label,
  names,
  onSave,
  onCancel,
  parentOptions,
}: {
  label: string;
  names: string[];
  onSave: (name: string, parentId?: number | null) => Promise<void>;
  onCancel: () => void;
  parentOptions?: { id: number; name: string }[];
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  // Live duplicate warning: same name ignoring case/whitespace.
  const duplicateName = trimmed
    ? names.find((n) => n.trim().toLowerCase() === trimmed.toLowerCase())
    : undefined;
  return (
    <div className="mb-3">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!trimmed) return;
          setBusy(true);
          try {
            await onSave(trimmed, parentId ? Number(parentId) : null);
            setName("");
            setParentId("");
            toast.success(`${label} added`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : `Failed to add ${label}`);
          } finally {
            setBusy(false);
          }
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${label} name`}
          className="min-w-0 flex-1 border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground"
        />
        {parentOptions && (
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="border border-border bg-background px-2 py-1.5 text-sm"
            aria-label="Parent category"
          >
            <option value="">Top-level</option>
            {parentOptions.map((parent) => (
              <option key={parent.id} value={parent.id}>
                Under {parent.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="default" disabled={busy || !trimmed || !!duplicateName}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="surface" onClick={onCancel}>
          Cancel
        </Button>
      </form>
      {duplicateName && (
        <p className="mt-1 text-xs text-sale">
          {label} "{duplicateName}" already exists — duplicates are not allowed.
        </p>
      )}
    </div>
  );
}

export function BrandsCategoriesSection() {
  const queryClient = useQueryClient();
  const { data: allProducts = [] } = useProducts();
  const { data: categoryList = [] } = useCategories();
  const { data: brandList = [] } = useQuery({
    queryKey: ["brands", "full"],
    queryFn: () => api.getBrands(),
  });
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<number | null>(null);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    type: "brand" | "category";
    name: string;
  } | null>(null);

  const displayBrands =
    brandList.length > 0
      ? brandList.map((b) => ({
          id: b.id,
          name: b.name,
          skus: allProducts.filter((p) => p.brand.toLowerCase() === b.name.toLowerCase()).length,
        }))
      : [...new Set(allProducts.map((p) => p.brand))].map((name) => ({
          id: 0,
          name,
          skus: allProducts.filter((p) => p.brand === name).length,
        }));

  const addBrand = async (name: string) => {
    await api.createBrand({ name });
    await queryClient.invalidateQueries({ queryKey: ["brands"] });
    setShowBrandForm(false);
  };

  const addCategory = async (name: string, parentId?: number | null) => {
    await api.createCategory({ name, parentId });
    await queryClient.invalidateQueries({ queryKey: ["categories"] });
    setShowCatForm(false);
  };

  const updateBrandName = async (id: number, name: string) => {
    try {
      await api.updateBrand(id, { name });
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
      setEditingBrandId(null);
      toast.success("Brand updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update brand");
    }
  };

  const removeBrand = async () => {
    if (!deleteTarget || deleteTarget.type !== "brand") return;
    try {
      await api.deleteBrand(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
      setDeleteTarget(null);
      toast.success("Brand deleted");
    } catch {
      toast.error("Failed to delete brand");
    }
  };

  const updateCategoryName = async (id: number, name: string, parentId: number | null) => {
    try {
      await api.updateCategory(id, { name, parentId });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingCatId(null);
      toast.success("Category updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update category");
    }
  };

  const removeCategory = async () => {
    if (!deleteTarget || deleteTarget.type !== "category") return;
    try {
      await api.deleteCategory(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setDeleteTarget(null);
      toast.success("Category deleted");
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const orderedCategories = [
    ...categoryList
      .filter((category) => category.parentId === null)
      .flatMap((parent) => [
        parent,
        ...categoryList.filter((child) => child.parentId === parent.id),
      ]),
    ...categoryList.filter(
      (category) =>
        category.parentId !== null &&
        !categoryList.some((parent) => parent.id === category.parentId),
    ),
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Brands</div>
            <Button variant="default" onClick={() => setShowBrandForm(!showBrandForm)}>
              <Plus size={13} /> Add brand
            </Button>
          </div>
          <div className="mt-3">
            {showBrandForm && (
              <AddForm
                label="Brand"
                names={brandList.map((b) => b.name)}
                onSave={addBrand}
                onCancel={() => setShowBrandForm(false)}
              />
            )}
            <Table
              columns={["Brand", "SKUs", ""]}
              rows={displayBrands.map((b) => [
                editingBrandId === b.id ? (
                  <InlineEdit
                    key="edit"
                    value={b.name}
                    otherNames={displayBrands.filter((x) => x.name !== b.name).map((x) => x.name)}
                    onSave={(v) => updateBrandName(b.id, v)}
                    onCancel={() => setEditingBrandId(null)}
                  />
                ) : (
                  b.name
                ),
                b.skus,
                <div key="actions" className="flex gap-1">
                  {b.id > 0 && (
                    <>
                      <button
                        onClick={() => setEditingBrandId(b.id)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: b.id, type: "brand", name: b.name })}
                        className="p-1 text-muted-foreground hover:text-sale"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>,
              ])}
            />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Categories</div>
            <Button variant="default" onClick={() => setShowCatForm(!showCatForm)}>
              <Plus size={13} /> Add category
            </Button>
          </div>
          {showCatForm && (
            <div className="mt-3">
              <AddForm
                label="Category"
                names={categoryList.map((c) => c.name)}
                onSave={addCategory}
                onCancel={() => setShowCatForm(false)}
                parentOptions={categoryList.filter((category) => category.parentId === null)}
              />
            </div>
          )}
          {categoryList.length === 0 ? (
            <div className="mt-3 py-4 text-center text-xs text-muted-foreground">
              No categories yet. Add one above.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {orderedCategories.map((c) => {
                const catId = c.id;
                const catName = c.name;
                const hasChildren = categoryList.some((child) => child.parentId === catId);
                const parentName = c.parentId
                  ? categoryList.find((parent) => parent.id === c.parentId)?.name
                  : null;
                return (
                  <li
                    key={catId}
                    className={`flex items-center justify-between py-2.5 text-sm ${
                      c.parentId
                        ? "ml-5 border-l border-border pl-3"
                        : "mt-2 rounded-md bg-surface/70 px-2 first:mt-0"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {c.parentId && (
                        <ChevronRight
                          size={14}
                          className="mt-0.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        {editingCatId === catId ? (
                          <InlineEdit
                            value={catName}
                            otherNames={categoryList
                              .filter((c) => c.id !== catId)
                              .map((c) => c.name)}
                            onSave={(v) => updateCategoryName(catId, v, c.parentId)}
                            onCancel={() => setEditingCatId(null)}
                          />
                        ) : (
                          <div className={hasChildren ? "font-semibold" : "font-medium"}>
                            {catName}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {parentName && <span>{parentName} · </span>}
                          {allProducts.filter((p) => p.category === catName).length} products ·
                          visible on storefront
                        </div>
                      </div>
                    </div>
                    <div className="ml-2 flex gap-1">
                      <button
                        onClick={() => setEditingCatId(catId)}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ id: catId, type: "category", name: catName })
                        }
                        className="p-1 text-muted-foreground hover:text-sale"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.type ?? ""}`}
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={deleteTarget?.type === "brand" ? removeBrand : removeCategory}
      />
    </>
  );
}
