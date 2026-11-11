"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stat, Pill, SortableTable } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  useSupplierTypes,
  useCreateSupplierType,
  useUpdateSupplierType,
  useDeleteSupplierType,
  type SupplierType,
} from "@/lib/hooks-supplier-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bdt } from "@/lib/utils";
import { ReceiveModal } from "@/components/inventory/receive-modal";
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Phone,
  Mail,
  Truck,
  Package,
  Banknote,
  ArrowRight,
  Upload,
  X,
  Check,
  XCircle,
  Shield,
  Settings2,
  Tag,
  PowerOff,
  Power,
  Wrench,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { toast } from "sonner";
import { TabStrip } from "@/components/dashboard/tab-strip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  type: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  openingBalance: number | null;
  nidNumber: number | null;
  dob: string | null;
  nidImages: string[];
  verificationStatus: "unverified" | "verified" | "rejected";
  isActive: boolean;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
  createdAt: string;
}

interface PurchaseOrder {
  id: string;
  supplier: string;
  supplierId: string | null;
  status: string | null;
  total: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  receivedAt: string | null;
  itemCount?: number;
}

interface POItem {
  id: number;
  productId: string;
  variantId: number | null;
  qtyOrdered: number;
  qtyReceived: number | null;
  costPrice: number;
  sellPrice: number;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  category: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  color: string | null;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

type Tab = "orders" | "suppliers" | "payables";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "orders", label: "Purchase Orders", icon: Package },
  { key: "suppliers", label: "Suppliers", icon: Truck },
  { key: "payables", label: "Payable Reports", icon: Banknote },
];

const fallbackTypeLabels: Record<string, string> = {
  company: "Company",
  importer: "Importer",
  individual: "Individual",
  customer: "Customer",
  dealer: "Dealer",
};

const fallbackTypeTones: Record<string, "info" | "success" | "warn" | "muted"> = {
  company: "info",
  importer: "success",
  individual: "warn",
  customer: "muted",
  dealer: "info",
};

// Live labels/tones are derived inside SuppliersTab via useSupplierTypes hook

const statusTone = (s: string) => {
  if (s === "received") return "success" as const;
  if (s === "overdue") return "danger" as const;
  if (s === "partial") return "warn" as const;
  if (s === "pending" || s === "in_transit") return "info" as const;
  return "muted" as const;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PurchasesPage() {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <TabStrip
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {tab === "orders" && <PurchaseOrdersTab />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "payables" && <PayablesTab />}
      </div>
    </>
  );
}

// ===========================================================================
// Tab 1 — Purchase Orders
// ===========================================================================

function PurchaseOrdersTab() {
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["dashboard", "procurement"],
    queryFn: () => fetch("/api/dashboard/procurement").then((r) => r.json()),
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [receivePO, setReceivePO] = useState<string | null>(null);
  const [receiveItems, setReceiveItems] = useState<
    {
      id: number;
      productId: string;
      variantId: number | null;
      productName: string;
      variantName: string;
      sku: string;
      qtyOrdered: number;
      qtyReceived: number;
      costPrice: number;
      sellPrice: number;
    }[]
  >([]);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
  const [viewingPOItems, setViewingPOItems] = useState<POItem[]>([]);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [deletePO, setDeletePO] = useState<PurchaseOrder | null>(null);
  const [fixingPO, setFixingPO] = useState<PurchaseOrder | null>(null);

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.id.toLowerCase().includes(q) || o.supplier.toLowerCase().includes(q);
    }
    return true;
  });

  const openPOs = orders.filter((o) => o.status !== "received").length;
  const totalCommitted = orders
    .filter((o) => o.status !== "received")
    .reduce((s, o) => s + o.total, 0);

  async function openPOView(row: PurchaseOrder) {
    setViewingPO(row);
    try {
      const res = await fetch(`/api/dashboard/procurement/items?poId=${row.id}`);
      setViewingPOItems(res.ok ? await res.json() : []);
    } catch {
      setViewingPOItems([]);
    }
  }

  async function handleDeletePO() {
    if (!deletePO) return;
    try {
      const res = await fetch(`/api/dashboard/procurement?id=${encodeURIComponent(deletePO.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Delete failed");
      }
      toast.success("Purchase order deleted");
      setDeletePO(null);
      void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function canEditPO(row: PurchaseOrder) {
    return row.status !== "received";
  }

  function canDeletePO(row: PurchaseOrder) {
    return row.status !== "received";
  }

  const totalReceived = orders
    .filter((o) => o.status === "received")
    .reduce((s, o) => s + o.total, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total POs" value={String(orders.length)} />
        <Stat
          label="Open POs"
          value={String(openPOs)}
          hint={openPOs > 0 ? `${bdt(totalCommitted)} committed` : undefined}
        />
        <Stat
          label="Received"
          value={String(orders.filter((o) => o.status === "received").length)}
          hint={bdt(totalReceived) + " value"}
        />
        <Stat label="Overdue" value={String(orders.filter((o) => o.status === "overdue").length)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search POs…"
            label="Search Purchase Orders"
            description="search by PO number or supplier"
          />
          <div className="flex gap-1">
            {["all", "pending", "in_transit", "received", "overdue"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={
                  "border px-2.5 py-1 text-xs transition-colors " +
                  (statusFilter === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {s === "all" ? "All" : s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <Link href="/dashboard/purchases/new">
          <Button variant="default">
            <Plus size={13} /> New PO
          </Button>
        </Link>
      </div>

      <SortableTable
        columns={[
          { key: "id", header: "PO #", sortable: true },
          { key: "supplier", header: "Supplier", sortable: true },
          { key: "itemCount", header: "Items", sortable: true },
          { key: "total", header: "Total", sortable: true, render: (v: number) => bdt(v) },
          {
            key: "createdAt",
            header: "Created",
            sortable: true,
            render: (v: string | null) => (v ? new Date(v).toLocaleDateString("en-BD") : "—"),
          },
          {
            key: "status",
            header: "Status",
            sortable: true,
            render: (v: string | null) => <Pill tone={statusTone(v || "")}>{v}</Pill>,
          },
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (_: any, row: PurchaseOrder) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setFixingPO(row)}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  title="Fix intake — edit, add or remove received units"
                >
                  <Wrench size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => void openPOView(row)}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  title="View details"
                >
                  <Eye size={12} />
                </button>
                {canEditPO(row) && (
                  <button
                    type="button"
                    onClick={() => setEditingPO(row)}
                    className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                )}
                {row.status !== "received" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const itemsRes = await fetch(
                        `/api/dashboard/procurement/items?poId=${row.id}`,
                      );
                      const items = await itemsRes.json().catch(() => []);
                      setReceivePO(row.id);
                      setReceiveItems(items);
                    }}
                  >
                    Receive
                  </Button>
                )}
                {canDeletePO(row) && (
                  <button
                    type="button"
                    onClick={() => setDeletePO(row)}
                    className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ),
          },
        ]}
        data={filtered}
        rowKey={(o) => o.id}
        defaultSortColumn="createdAt"
        defaultSortDirection="desc"
        emptyMessage={
          search || statusFilter !== "all"
            ? "No POs match your filters."
            : "No purchase orders yet. Create one to start receiving stock."
        }
      />

      {showCreate && (
        <CreatePOForm
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
          }}
        />
      )}

      {viewingPO && (
        <PODetailModal
          po={viewingPO}
          items={viewingPOItems}
          onClose={() => {
            setViewingPO(null);
            setViewingPOItems([]);
          }}
        />
      )}

      {fixingPO && (
        <FixIntakeModal
          po={fixingPO}
          onClose={() => setFixingPO(null)}
          onSaved={() => {
            setFixingPO(null);
            void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
          }}
        />
      )}

      {editingPO && (
        <EditPOModal
          po={editingPO}
          onClose={() => setEditingPO(null)}
          onSaved={() => {
            setEditingPO(null);
            void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
          }}
        />
      )}

      {deletePO && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeletePO(null)}
        >
          <div
            className="w-full max-w-sm border border-border bg-background p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium">Delete Purchase Order</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Delete PO &quot;{deletePO.id}&quot; from {deletePO.supplier}? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="surface" onClick={() => setDeletePO(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => void handleDeletePO()}
                className="bg-sale hover:bg-sale/90"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {receivePO && (
        <ReceiveModal
          poId={receivePO}
          items={receiveItems}
          onClose={() => {
            setReceivePO(null);
            setReceiveItems([]);
          }}
          onReceived={() => {
            setReceivePO(null);
            setReceiveItems([]);
            void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
          }}
        />
      )}
    </>
  );
}

// ===========================================================================
// PO Detail & Edit Modals
// ===========================================================================

function PODetailModal({
  po,
  items,
  onClose,
}: {
  po: PurchaseOrder;
  items: POItem[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
        <div className="mb-3 pr-8 text-sm font-medium">Purchase Order Details</div>

        <div className="mb-4 rounded bg-muted p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">{po.supplier}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{po.id}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Created{" "}
                {po.createdAt
                  ? new Date(po.createdAt).toLocaleDateString("en-BD", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </div>
              {po.receivedAt && (
                <div className="text-xs text-muted-foreground">
                  Received{" "}
                  {new Date(po.receivedAt).toLocaleDateString("en-BD", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              )}
            </div>
            <Pill tone={statusTone(po.status || "")}>{po.status}</Pill>
          </div>
          {po.notes && <div className="mt-2 text-sm text-muted-foreground">{po.notes}</div>}
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
            Line Items
          </label>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No line items.</div>
          ) : (
            <div className="divide-y divide-border rounded border border-border">
              {items.map((item) => (
                <div key={item.id} className="p-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {item.productName}
                      {item.variantName ? ` · ${item.variantName}` : ""}
                    </span>
                    <span className="font-medium">{bdt(item.costPrice * item.qtyOrdered)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.qtyReceived ?? 0}/{item.qtyOrdered} received · Cost {bdt(item.costPrice)}{" "}
                    · Sell {bdt(item.sellPrice)}
                    {item.sku ? ` · ${item.sku}` : ""}
                    {item.color ? ` · ${item.color}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
          <span>Total</span>
          <span>{bdt(po.total)}</span>
        </div>
      </div>
    </div>
  );
}

function EditPOModal({
  po,
  onClose,
  onSaved,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["dashboard", "suppliers"],
    queryFn: () => fetch("/api/dashboard/suppliers").then((r) => r.json()),
  });

  const [supplierId, setSupplierId] = useState(po.supplierId || "");
  const [status, setStatus] = useState(po.status || "pending");
  const [notes, setNotes] = useState(po.notes || "");
  const [saving, setSaving] = useState(false);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/procurement", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: po.id,
          supplierId,
          supplier: selectedSupplier?.name || po.supplier,
          status,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      toast.success("Purchase order updated");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md border border-border bg-background p-4"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
        <div className="mb-3 pr-8 text-sm font-medium">Edit Purchase Order</div>
        <div className="mb-2 font-mono text-xs text-muted-foreground">{po.id}</div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Supplier *
            </label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Status
            </label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="in_transit">in_transit</SelectItem>
                <SelectItem value="partial">partial</SelectItem>
                <SelectItem value="overdue">overdue</SelectItem>
                <SelectItem value="cancelled">cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Notes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CreatePOForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["dashboard", "suppliers"],
    queryFn: () => fetch("/api/dashboard/suppliers").then((r) => r.json()),
  });

  const [supplierId, setSupplierId] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    if (!total || Number(total) <= 0) {
      toast.error("Enter a valid total");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/procurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier: selectedSupplier?.name || "",
          supplierId,
          total: Number(total),
          notes: notes || null,
          status: "pending",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("PO created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md border border-border bg-background p-4"
      >
        <div className="mb-3 text-sm font-medium">New Purchase Order</div>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Supplier *
            </label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select supplier…" />
              </SelectTrigger>
              <SelectContent>
                {suppliers
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Total (৳) *
            </label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Notes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={saving}>
            {saving ? "Creating…" : "Create PO"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ===========================================================================
// Tab 2 — Suppliers
// ===========================================================================

function SuppliersTab() {
  const qc = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["dashboard", "suppliers"],
    queryFn: () => fetch("/api/dashboard/suppliers").then((r) => r.json()),
  });
  const { data: supplierTypesRaw } = useSupplierTypes();
  const supplierTypes: SupplierType[] = Array.isArray(supplierTypesRaw) ? supplierTypesRaw : [];
  const typeLabels: Record<string, string> = useMemo(() => {
    if (supplierTypes.length === 0) return fallbackTypeLabels;
    const m: Record<string, string> = {};
    for (const t of supplierTypes) m[t.slug] = t.name;
    return m;
  }, [supplierTypes]);
  const typeTones: Record<string, "info" | "success" | "warn" | "muted"> = useMemo(() => {
    if (supplierTypes.length === 0) return fallbackTypeTones;
    const m: Record<string, "info" | "success" | "warn" | "muted"> = {};
    for (const t of supplierTypes) m[t.slug] = (t.tone as any) || "muted";
    return m;
  }, [supplierTypes]);
  const availableTypes = useMemo(() => {
    if (supplierTypes.length === 0)
      return ["company", "importer", "individual", "customer", "dealer"];
    return supplierTypes.filter((t) => t.isActive).map((t) => t.slug);
  }, [supplierTypes]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<{
    error: string;
    counts: { purchaseOrders: number; batches: number; payments: number };
  } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Supplier | null>(null);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<Supplier | null>(null);
  const [showTypeManager, setShowTypeManager] = useState(false);

  const filtered = suppliers.filter((s) => {
    if (statusFilter === "active" && !s.isActive) return false;
    if (statusFilter === "inactive" && s.isActive) return false;
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.contactPerson?.toLowerCase().includes(q) ||
        s.phone?.includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        String(s.nidNumber ?? "").includes(q)
      );
    }
    return true;
  });

  const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const totalReceivable = suppliers.reduce((sum, s) => sum + Math.min(0, s.balance), 0);
  const activeCount = suppliers.filter((s) => s.isActive).length;

  async function handleDelete(force = false) {
    if (!deleteTarget) return;
    setSupplierBusy(true);
    try {
      const res = await fetch(
        `/api/dashboard/suppliers/${deleteTarget.id}${force ? "?force=1" : ""}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Supplier has history — surface the conflict and offer force delete.
        setDeleteConflict({
          error: data.error || "Supplier has purchase history.",
          counts: data.counts || { purchaseOrders: 0, batches: 0, payments: 0 },
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Delete failed");
      const removed = data.removed
        ? ` (removed ${[
            data.removed.purchaseOrders && `${data.removed.purchaseOrders} PO(s)`,
            data.removed.batches && `${data.removed.batches} batch(es)`,
            data.removed.units && `${data.removed.units} unit(s)`,
            data.removed.sales && `${data.removed.sales} sale(s)`,
          ]
            .filter(Boolean)
            .join(", ")})`
        : "";
      toast.success(`Supplier deleted${removed}`);
      void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers"] });
      setDeleteTarget(null);
      setDeleteConflict(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSupplierBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setSupplierBusy(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${deactivateTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Deactivate failed");
      }
      toast.success("Supplier deactivated");
      void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers"] });
      setDeactivateTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setSupplierBusy(false);
    }
  }

  async function handleActivate(s: Supplier) {
    setSupplierBusy(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Activate failed");
      }
      toast.success("Supplier activated");
      void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setSupplierBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Total Suppliers"
          value={String(suppliers.length)}
          hint={`${activeCount} active`}
        />
        <Stat label="Total Payable" value={bdt(totalPayable)} hint="Owed to suppliers" />
        <Stat label="Total Receivable" value={bdt(totalReceivable)} hint="Credit from suppliers" />
        <Stat
          label="Total Purchases"
          value={bdt(suppliers.reduce((s, sup) => s + sup.totalPurchases, 0))}
          hint="All time"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            label="Search Suppliers"
            description="search by name, contact, phone, or email"
          />
          <div className="flex flex-wrap gap-1">
            {["all", "active", "inactive"].map((t) => (
              <button
                key={t}
                onClick={() => setStatusFilter(t as "all" | "active" | "inactive")}
                className={
                  "border px-2.5 py-1 text-xs transition-colors " +
                  (statusFilter === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            {["all", ...availableTypes].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={
                  "border px-2.5 py-1 text-xs transition-colors " +
                  (typeFilter === t
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                {t === "all" ? "All" : typeLabels[t] || t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowTypeManager(true)}>
            <Settings2 size={13} /> Manage Types
          </Button>
          <Button
            variant="default"
            onClick={() => {
              setEditingSupplier(null);
              setShowForm(true);
            }}
          >
            <Plus size={13} /> Add Supplier
          </Button>
        </div>
      </div>

      <SortableTable
        columns={[
          {
            key: "name",
            header: "Supplier",
            sortable: true,
            render: (_: any, s: Supplier) => (
              <>
                <Link href={`/dashboard/suppliers/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                {s.city && <div className="text-xs text-muted-foreground">{s.city}</div>}
                {s.nidNumber && (
                  <div className="text-xs text-muted-foreground">NID: {s.nidNumber}</div>
                )}
              </>
            ),
          },
          {
            key: "type",
            header: "Type",
            sortable: true,
            render: (v: string) => <Pill tone={typeTones[v] || "muted"}>{typeLabels[v] || v}</Pill>,
          },
          {
            key: "verificationStatus",
            header: "Verification",
            sortable: true,
            render: (v: string) => (
              <Pill tone={v === "verified" ? "success" : v === "rejected" ? "danger" : "warn"}>
                {v === "verified" ? "Verified" : v === "rejected" ? "Rejected" : "Unverified"}
              </Pill>
            ),
          },
          {
            key: "contactPerson",
            header: "Contact",
            sortable: true,
            render: (_: any, s: Supplier) => (
              <div className="text-xs text-muted-foreground">
                {s.contactPerson && <div>{s.contactPerson}</div>}
                {s.phone && (
                  <div className="flex items-center gap-1">
                    <Phone size={10} /> {s.phone}
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-1">
                    <Mail size={10} /> {s.email}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "totalPurchases",
            header: "Purchases",
            sortable: true,
            render: (v: number) => <span className="font-medium">{bdt(v)}</span>,
          },
          {
            key: "totalPaid",
            header: "Paid",
            sortable: true,
            render: (v: number) => <span className="text-muted-foreground">{bdt(v)}</span>,
          },
          {
            key: "balance",
            header: "Balance",
            sortable: true,
            render: (v: number) => (
              <span
                className={
                  v > 0 ? "text-sale font-medium" : v < 0 ? "text-emerald-600 font-medium" : ""
                }
              >
                {bdt(v)}
              </span>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (_: any, s: Supplier) => (
              <div className="flex items-center justify-end gap-1">
                {s.verificationStatus !== "verified" && s.nidImages && s.nidImages.length > 0 && (
                  <button
                    onClick={() => setVerificationTarget(s)}
                    className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-emerald-600"
                    title="Verify supplier"
                  >
                    <Shield size={12} />
                  </button>
                )}
                <Link
                  href={`/dashboard/suppliers/${s.id}`}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  title="View details"
                >
                  <ArrowRight size={12} />
                </Link>
                <button
                  onClick={() => {
                    setEditingSupplier(s);
                    setShowForm(true);
                  }}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
                {s.isActive ? (
                  <button
                    onClick={() => setDeactivateTarget(s)}
                    disabled={supplierBusy}
                    className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
                    title="Deactivate"
                  >
                    <PowerOff size={12} />
                  </button>
                ) : (
                  <button
                    onClick={() => void handleActivate(s)}
                    disabled={supplierBusy}
                    className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground disabled:opacity-50"
                    title="Activate"
                  >
                    <Power size={12} />
                  </button>
                )}
                <button
                  onClick={() => {
                    setDeleteConflict(null);
                    setDeleteTarget(s);
                  }}
                  className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
                  title="Delete permanently"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ),
          },
        ]}
        data={filtered}
        rowKey={(s) => s.id}
        defaultSortColumn="totalPurchases"
        defaultSortDirection="desc"
        emptyMessage={
          search || typeFilter !== "all"
            ? "No suppliers match your filters."
            : "No suppliers yet. Add your first supplier to get started."
        }
      />

      {showForm && (
        <SupplierForm
          supplier={editingSupplier}
          onClose={() => {
            setShowForm(false);
            setEditingSupplier(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingSupplier(null);
            void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers"] });
          }}
        />
      )}

      {deactivateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm border border-border bg-background p-4">
            <div className="text-sm font-medium">Deactivate Supplier</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Deactivate &quot;{deactivateTarget.name}&quot;? They will be hidden from dropdowns but
              their data is preserved.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="surface" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleDeactivate}
                disabled={supplierBusy}
                className="bg-sale hover:bg-sale/90"
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm border border-border bg-background p-4">
            <div className="text-sm font-medium">Delete Supplier</div>
            {!deleteConflict ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Permanently delete &quot;{deleteTarget.name}&quot;? If they have purchase history,
                you will be asked to confirm before anything is removed.
              </p>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                <p>
                  &quot;{deleteTarget.name}&quot; has purchase history. Deleting permanently removes
                  all of it: {deleteConflict.counts.purchaseOrders} purchase order(s),{" "}
                  {deleteConflict.counts.batches} inventory batch(es) with their units
                  {deleteConflict.counts.payments
                    ? `, ${deleteConflict.counts.payments} payment record(s)`
                    : ""}
                  , and any sales made up solely of those units. This cannot be undone.
                </p>
                <p className="mt-2">
                  Prefer{" "}
                  <button
                    className="underline hover:text-foreground"
                    onClick={() => {
                      setDeactivateTarget(deleteTarget);
                      setDeleteTarget(null);
                      setDeleteConflict(null);
                    }}
                  >
                    deactivating
                  </button>{" "}
                  instead — history stays intact and the supplier is hidden from dropdowns.
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="surface"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConflict(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                disabled={supplierBusy}
                onClick={() => void handleDelete(Boolean(deleteConflict))}
                className="bg-sale hover:bg-sale/90"
              >
                {deleteConflict ? "Delete everything permanently" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {verificationTarget && (
        <VerificationModal
          supplier={verificationTarget}
          onClose={() => setVerificationTarget(null)}
          onVerified={() => {
            setVerificationTarget(null);
            void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers"] });
          }}
        />
      )}

      {showTypeManager && <SupplierTypeManager onClose={() => setShowTypeManager(false)} />}
    </>
  );
}

// ===========================================================================
// Verification Modal
// ===========================================================================

function VerificationModal({
  supplier,
  onClose,
  onVerified,
}: {
  supplier: Supplier;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify(status: "verified" | "rejected") {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${supplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationStatus: status,
          verificationNotes: notes || null,
        }),
      });
      if (!res.ok) throw new Error("Verification failed");
      toast.success(status === "verified" ? "Supplier verified" : "Supplier rejected");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl border border-border bg-background p-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-3 text-sm font-medium">Verify Supplier: {supplier.name}</div>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>{" "}
              {fallbackTypeLabels[supplier.type] || supplier.type}
            </div>
            <div>
              <span className="text-muted-foreground">NID:</span>{" "}
              {supplier.nidNumber || "Not provided"}
            </div>
            <div>
              <span className="text-muted-foreground">DOB:</span> {supplier.dob || "Not provided"}
            </div>
            <div>
              <span className="text-muted-foreground">Phone:</span>{" "}
              {supplier.phone || "Not provided"}
            </div>
          </div>

          {supplier.contactPerson && (
            <div className="text-sm">
              <span className="text-muted-foreground">Contact Person:</span>{" "}
              {supplier.contactPerson}
            </div>
          )}

          {supplier.address && (
            <div className="text-sm">
              <span className="text-muted-foreground">Address:</span> {supplier.address}
              {supplier.city && `, ${supplier.city}`}
            </div>
          )}

          {supplier.nidImages && supplier.nidImages.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                NID Documents
              </div>
              <div className="flex flex-wrap gap-3">
                {supplier.nidImages.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`NID ${i + 1}`}
                      className="h-40 w-56 border border-border object-cover"
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {i === 0 ? "Front" : "Back"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Verification Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this verification decision..."
              className="rounded-md w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/80 min-h-[80px]"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-between">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleVerify("rejected")}
              disabled={loading}
              className="border-sale text-sale hover:bg-sale/10"
            >
              <XCircle size={14} className="mr-1" /> Reject
            </Button>
            <Button
              variant="default"
              onClick={() => handleVerify("verified")}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check size={14} className="mr-1" /> Verify
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: supplierTypesRaw } = useSupplierTypes();
  const supplierTypes: SupplierType[] = Array.isArray(supplierTypesRaw) ? supplierTypesRaw : [];
  const typeOptions = supplierTypes.length
    ? supplierTypes.filter((t) => t.isActive)
    : (["company", "importer", "dealer", "individual", "customer"].map((slug) => ({
        slug,
        name: (fallbackTypeLabels as any)[slug] || slug,
      })) as any);
  const [name, setName] = useState(supplier?.name || "");
  const [type, setType] = useState(supplier?.type || typeOptions[0]?.slug || "company");
  const [contactPerson, setContactPerson] = useState(supplier?.contactPerson || "");
  const [email, setEmail] = useState(supplier?.email || "");
  const [phone, setPhone] = useState(supplier?.phone || "");
  const [address, setAddress] = useState(supplier?.address || "");
  const [city, setCity] = useState(supplier?.city || "");
  const [notes, setNotes] = useState(supplier?.notes || "");
  const [openingBalance, setOpeningBalance] = useState(String(supplier?.openingBalance || ""));
  const [nidNumber, setNidNumber] = useState(supplier?.nidNumber ? String(supplier.nidNumber) : "");
  const [dob, setDob] = useState(supplier?.dob || "");
  const [nidImages, setNidImages] = useState<string[]>(supplier?.nidImages || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        type,
        contactPerson: contactPerson || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        notes: notes || null,
        openingBalance: openingBalance ? Number(openingBalance) : 0,
        nidNumber: nidNumber ? Number(nidNumber) : null,
        dob: dob || null,
        nidImages,
      };
      const url = supplier ? `/api/dashboard/suppliers/${supplier.id}` : "/api/dashboard/suppliers";
      const res = await fetch(url, {
        method: supplier ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(supplier ? "Supplier updated" : "Supplier created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleNidUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (nidImages.length + files.length > 2) {
      toast.error("NID has only 2 parts (front & back). Max 2 images.");
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/dashboard/upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
        }
        const data = await res.json();
        setNidImages((prev) => [...prev, data.url]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg border border-border bg-background p-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-3 text-sm font-medium">
          {supplier ? "Edit Supplier" : "Add Supplier"}
        </div>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Samsung Bangladesh"
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Type
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t: any) => (
                  <SelectItem key={t.slug} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Contact Person
              </label>
              <input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Name"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Phone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+880..."
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                City
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Dhaka"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Address
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Full address"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                NID Number
              </label>
              <input
                value={nidNumber}
                onChange={(e) => setNidNumber(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1234567890"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Date of Birth
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Upload NID <span className="normal-case">(optional)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleNidUpload}
              disabled={uploading}
              className="sr-only"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> {uploading ? "Uploading…" : "Choose Files"}
              </Button>
              {nidImages.length > 0 && (
                <span className="text-xs text-muted-foreground">{nidImages.length}/2 uploaded</span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Front &amp; back — 1 to 2 images
            </p>
            {nidImages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {nidImages.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`NID ${i + 1}`}
                      className="h-16 w-24 border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setNidImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute -right-1.5 -top-1.5 border border-border bg-background p-0.5 text-muted-foreground hover:text-sale"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Opening Balance (৳)
              </label>
              <input
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Amount owed from before (if migrating)
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Notes
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
                className={inputCls}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={saving}>
            {saving ? "Saving…" : supplier ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ===========================================================================
// Tab 3 — Payable Reports
// ===========================================================================

function PayablesTab() {
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["dashboard", "suppliers"],
    queryFn: () => fetch("/api/dashboard/suppliers").then((r) => r.json()),
  });

  const [sortBy, setSortBy] = useState<"balance" | "name" | "purchases">("balance");

  const active = suppliers.filter((s) => s.isActive);
  const totalPayable = active.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
  const totalReceivable = active.reduce((sum, s) => sum + Math.min(0, s.balance), 0);
  const settledCount = active.filter((s) => s.balance === 0).length;

  const sorted = [...active].sort((a, b) => {
    if (sortBy === "balance") return Math.abs(b.balance) - Math.abs(a.balance);
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return b.totalPurchases - a.totalPurchases;
  });

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total Payable" value={bdt(totalPayable)} hint="Owed to suppliers" />
        <Stat label="Total Receivable" value={bdt(totalReceivable)} hint="Credit from suppliers" />
        <Stat
          label="Net Position"
          value={bdt(totalPayable - totalReceivable)}
          hint={totalPayable > totalReceivable ? "Net owed" : "Net credit"}
        />
        <Stat label="Settled" value={String(settledCount)} hint={`of ${active.length} suppliers`} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(["balance", "name", "purchases"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={
              "border px-2.5 py-1 text-xs transition-colors " +
              (sortBy === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {key === "balance" ? "Balance" : key === "name" ? "Name" : "Total Purchases"}
          </button>
        ))}
      </div>

      <SortableTable
        columns={[
          {
            key: "name",
            header: "Supplier",
            sortable: true,
            render: (_: any, s: Supplier) => (
              <>
                <Link href={`/dashboard/suppliers/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                {s.city && <div className="text-xs text-muted-foreground">{s.city}</div>}
              </>
            ),
          },
          {
            key: "openingBalance",
            header: "Opening",
            sortable: true,
            render: (v: number | null) => (
              <span className="text-muted-foreground">{bdt(v || 0)}</span>
            ),
          },
          {
            key: "totalPurchases",
            header: "Purchases",
            sortable: true,
            render: (v: number) => <span className="font-medium">{bdt(v)}</span>,
          },
          {
            key: "totalPaid",
            header: "Paid",
            sortable: true,
            render: (v: number) => <span className="text-muted-foreground">{bdt(v)}</span>,
          },
          {
            key: "balance",
            header: "Balance",
            sortable: true,
            render: (v: number) => (
              <span
                className={
                  v > 0 ? "text-sale font-medium" : v < 0 ? "text-emerald-600 font-medium" : ""
                }
              >
                {bdt(v)}
              </span>
            ),
          },
          {
            key: "details",
            header: "Details",
            className: "text-right",
            render: (_: any, s: Supplier) => (
              <Link
                href={`/dashboard/suppliers/${s.id}`}
                className="text-xs text-muted-foreground hover:underline hover:text-foreground"
              >
                View ledger →
              </Link>
            ),
          },
        ]}
        data={sorted}
        rowKey={(s) => s.id}
        defaultSortColumn="balance"
        defaultSortDirection="desc"
        emptyMessage="No active suppliers."
      />
    </>
  );
}

function SupplierTypeManager({ onClose }: { onClose: () => void }) {
  const { data: types = [], isLoading } = useSupplierTypes();
  const createMut = useCreateSupplierType();
  const updateMut = useUpdateSupplierType();
  const deleteMut = useDeleteSupplierType();
  const [editing, setEditing] = useState<SupplierType | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<SupplierType["tone"]>("info");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SupplierType | null>(null);
  const [deleting, setDeleting] = useState(false);
  function resetForm() {
    setEditing(null);
    setName("");
    setSlug("");
    setDescription("");
    setTone("info");
    setSortOrder("0");
    setIsActive(true);
  }
  function startEdit(t: SupplierType) {
    setEditing(t);
    setName(t.name);
    setSlug(t.slug);
    setDescription(t.description || "");
    setTone(t.tone);
    setSortOrder(String(t.sortOrder));
    setIsActive(t.isActive);
  }
  function slugify(v: string) {
    return v
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          data: {
            name: name.trim(),
            slug: slugify(slug),
            description: description.trim() || null,
            tone,
            sortOrder: Number(sortOrder) || 0,
            isActive,
          },
        });
        toast.success("Supplier type updated");
      } else {
        await createMut.mutateAsync({
          name: name.trim(),
          slug: slugify(slug),
          description: description.trim() || null,
          tone,
          sortOrder: Number(sortOrder) || 0,
          isActive,
        } as any);
        toast.success("Supplier type created");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteMut.mutateAsync(pendingDelete.id);
      toast.success("Supplier type deleted");
      setPendingDelete(null);
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }
  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl border border-border bg-background p-4 max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>
        <div className="mb-3 flex items-center gap-2 pr-6">
          <Tag size={16} />
          <h2 className="text-sm font-semibold">Manage Supplier Types</h2>
          <span className="text-xs text-muted-foreground">{types.length} types</span>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mb-6 rounded border border-border bg-surface/50 p-3"
        >
          <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {editing ? `Edit: ${editing.name}` : "Add New Type"}
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!editing) setSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. Wholesaler"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Slug *
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. wholesaler"
                  className={inputCls + " font-mono"}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Description
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Tone
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className={inputCls}
                >
                  <option value="info">Info (blue)</option>
                  <option value="success">Success (green)</option>
                  <option value="warn">Warn (amber)</option>
                  <option value="muted">Muted (gray)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />{" "}
                  Active
                </label>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {editing && (
              <Button type="button" variant="surface" onClick={resetForm}>
                Cancel Edit
              </Button>
            )}
            <Button type="submit" variant="default" disabled={saving}>
              {saving ? "Saving…" : editing ? "Update Type" : "Add Type"}
            </Button>
          </div>
        </form>
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Existing Types
          </div>
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : types.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No supplier types yet. Add one above.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Slug</th>
                    <th className="px-3 py-2 font-medium">Tone</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{t.slug}</td>
                      <td className="px-3 py-2">
                        <Pill tone={t.tone}>{t.tone}</Pill>
                      </td>
                      <td className="px-3 py-2 text-xs">{t.isActive ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => startEdit(t)}
                            className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(t)}
                            className="border border-border p-1.5 text-muted-foreground hover:bg-surface hover:text-sale"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm border border-border bg-background p-4 shadow-lg"
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-sale">
                <Trash2 size={16} />
              </div>
              <h3 className="text-sm font-semibold">Delete supplier type?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-medium text-foreground">"{pendingDelete.name}"</span> (
              {pendingDelete.slug})? This cannot be undone. Types in use by suppliers cannot be
              deleted — reassign those suppliers first.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="surface" onClick={() => setPendingDelete(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-sale hover:bg-sale/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fix intake: edit / add / remove the units a PO's receive created
// ---------------------------------------------------------------------------

interface FixItem {
  id: number;
  variantId: number | null;
  qtyOrdered: number;
  qtyReceived: number | null;
  costPrice: number;
  sellPrice: number;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  batteryHealth: number | null;
  conditionGrade: string | null;
  color: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
}

interface FixUnit {
  unitId: string;
  variantId: number;
  unitCode: string | null;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  identityType: string;
  conditionGrade: string | null;
  batteryHealth: number | null;
  acquisitionCost: number | null;
  currentPrice: number | null;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  color: string | null;
  status: string;
  receivedAt: string | null;
  specs: { label: string; value: string }[];
}

interface FixDraft {
  key: string;
  unitId?: string;
  variantId: number;
  status: string;
  imei1: string;
  imei2: string;
  serialNumber: string;
  batteryHealth: string;
  conditionGrade: string;
  acquisitionCost: string;
  currentPrice: string;
  costCode: string;
  dCode: string;
  sellCode: string;
  ram: string;
  storage: string;
  color: string;
  markedForRemoval: boolean;
  isNew: boolean;
}

function specValue(specs: { label: string; value: string }[], label: string): string {
  return specs.find((s) => s.label === label)?.value ?? "";
}

function draftFromUnit(u: FixUnit): FixDraft {
  return {
    key: u.unitId,
    unitId: u.unitId,
    variantId: u.variantId,
    status: u.status,
    imei1: u.imei1 ?? "",
    imei2: u.imei2 ?? "",
    serialNumber: u.serialNumber ?? "",
    batteryHealth: u.batteryHealth != null ? String(u.batteryHealth) : "",
    conditionGrade: u.conditionGrade ?? "",
    acquisitionCost: u.acquisitionCost != null ? String(u.acquisitionCost) : "",
    currentPrice: u.currentPrice != null ? String(u.currentPrice) : "",
    costCode: u.costCode ?? "",
    dCode: u.dCode ?? "",
    sellCode: u.sellCode ?? "",
    ram: specValue(u.specs, "RAM"),
    storage: specValue(u.specs, "Storage"),
    color: u.color ?? specValue(u.specs, "Color"),
    markedForRemoval: false,
    isNew: false,
  };
}

function draftFromItem(item: FixItem, seq: number): FixDraft {
  return {
    key: `new-${item.id}-${seq}`,
    variantId: item.variantId ?? 0,
    status: "available",
    imei1: "",
    imei2: "",
    serialNumber: "",
    batteryHealth: item.batteryHealth != null ? String(item.batteryHealth) : "",
    conditionGrade: item.conditionGrade ?? "",
    acquisitionCost: item.costPrice ? String(item.costPrice) : "",
    currentPrice: item.sellPrice ? String(item.sellPrice) : "",
    costCode: item.costCode ?? "",
    dCode: item.dCode ?? "",
    sellCode: item.sellCode ?? "",
    ram: "",
    storage: "",
    color: item.color ?? "",
    markedForRemoval: false,
    isNew: true,
  };
}

function MiniField({
  label,
  className,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        {...props}
        className={
          "rounded border border-border bg-background px-2 py-1 text-xs " + (className ?? "")
        }
      />
    </label>
  );
}

const FIX_CONDITIONS = [
  "New",
  "Aslike New (95-100)",
  "Good (90-95)",
  "Average (85-90)",
  "Below Average (80-85)",
  "Bad (Issues)",
];

function FixIntakeModal({
  po,
  onClose,
  onSaved,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FixItem[]>([]);
  const [drafts, setDrafts] = useState<FixDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/procurement/units?poId=${po.id}`);
        const data = await res.json();
        if (cancelled) return;
        setItems((data.items ?? []) as FixItem[]);
        setDrafts(((data.units ?? []) as FixUnit[]).map(draftFromUnit));
      } catch {
        if (!cancelled) toast.error("Couldn't load received units");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [po.id]);

  function updateDraft(key: string, patch: Partial<FixDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addRow(item: FixItem) {
    setDrafts((prev) => [...prev, draftFromItem(item, Date.now())]);
  }

  function removeRow(d: FixDraft) {
    if (d.isNew) {
      setDrafts((prev) => prev.filter((x) => x.key !== d.key));
    } else {
      updateDraft(d.key, { markedForRemoval: !d.markedForRemoval });
    }
  }

  async function save() {
    setSaving(true);
    try {
      for (const d of drafts) {
        const specs = { RAM: d.ram, Storage: d.storage, Color: d.color };
        if (d.isNew) {
          // Silently skip untouched add-rows.
          if (!d.imei1 && !d.imei2 && !d.serialNumber) continue;
          const res = await fetch("/api/dashboard/procurement/units", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              poId: po.id,
              variantId: d.variantId,
              imei1: d.imei1,
              imei2: d.imei2,
              serialNumber: d.serialNumber,
              batteryHealth: d.batteryHealth,
              conditionGrade: d.conditionGrade,
              acquisitionCost: d.acquisitionCost,
              currentPrice: d.currentPrice,
              costCode: d.costCode,
              dCode: d.dCode,
              sellCode: d.sellCode,
              color: d.color,
              specs,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Couldn't add unit");
          }
        } else if (d.markedForRemoval) {
          const res = await fetch("/api/dashboard/procurement/units", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ unitId: d.unitId, poId: po.id }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Couldn't remove unit");
          }
        } else if (d.status === "available") {
          const res = await fetch("/api/dashboard/procurement/units", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unitId: d.unitId,
              imei1: d.imei1,
              imei2: d.imei2,
              serialNumber: d.serialNumber,
              batteryHealth: d.batteryHealth,
              conditionGrade: d.conditionGrade,
              acquisitionCost: d.acquisitionCost,
              currentPrice: d.currentPrice,
              costCode: d.costCode,
              dCode: d.dCode,
              sellCode: d.sellCode,
              color: d.color,
              specs,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "Couldn't save unit");
          }
        }
      }
      toast.success("Intake updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // One section per PO line (deduped by variant so two lines for the same
  // product don't render their units twice).
  const shownVariants = new Set<number>();
  const sections = items.filter((i) => {
    if (i.variantId == null || shownVariants.has(i.variantId)) return false;
    shownVariants.add(i.variantId);
    return true;
  });
  const unitCount = drafts.filter((d) => !d.markedForRemoval).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-border bg-background p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
        <div className="mb-1 pr-8 text-sm font-medium">Fix intake</div>
        <div className="mb-3 text-xs text-muted-foreground">
          {po.supplier} · <span className="font-mono">{po.id}</span> · edits apply to units still in
          stock; sold units are read-only. Removals and additions adjust stock and the PO counts.
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {sections.map((item) => {
              const rows = drafts.filter((d) => d.variantId === item.variantId);
              return (
                <div key={item.id} className="rounded border border-border">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">
                        {item.productName}
                        {item.variantName ? ` · ${item.variantName}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.qtyReceived ?? 0}/{item.qtyOrdered} received
                        {item.sku ? ` · ${item.sku}` : ""}
                      </div>
                    </div>
                    {item.variantId != null && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addRow(item)}
                      >
                        <Plus size={12} /> Add unit
                      </Button>
                    )}
                  </div>

                  {rows.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">
                      No units received for this line yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {rows.map((d) => (
                        <div
                          key={d.key}
                          className={
                            "px-3 py-2 " +
                            (d.markedForRemoval ? "bg-destructive/10 opacity-60" : "")
                          }
                        >
                          {d.status !== "available" && !d.isNew ? (
                            <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                              <Pill tone="muted">{d.status}</Pill>
                              <span className="font-mono">
                                {d.imei1 || d.serialNumber || d.key}
                              </span>
                              {d.batteryHealth != null && <span>{d.batteryHealth}%</span>}
                              <span>sold/transferred — read-only</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-end gap-1.5">
                                <MiniField
                                  label="IMEI 1"
                                  value={d.imei1}
                                  onChange={(e) => updateDraft(d.key, { imei1: e.target.value })}
                                  className="w-40 font-mono"
                                  placeholder="IMEI 1"
                                />
                                <MiniField
                                  label="Serial"
                                  value={d.serialNumber}
                                  onChange={(e) =>
                                    updateDraft(d.key, { serialNumber: e.target.value })
                                  }
                                  className="w-40 font-mono"
                                  placeholder="Serial"
                                />
                                <MiniField
                                  label="Battery %"
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={d.batteryHealth}
                                  onChange={(e) =>
                                    updateDraft(d.key, { batteryHealth: e.target.value })
                                  }
                                  className="w-16 text-right"
                                  placeholder="%"
                                />
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Condition
                                  </span>
                                  <Select
                                    value={d.conditionGrade}
                                    onValueChange={(v) => updateDraft(d.key, { conditionGrade: v })}
                                  >
                                    <SelectTrigger className="h-7 px-2 text-xs">
                                      <SelectValue placeholder="Condition" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {FIX_CONDITIONS.map((c) => (
                                        <SelectItem key={c} value={c}>
                                          {c}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </label>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
                                <MiniField
                                  label="Cost Code"
                                  value={d.costCode}
                                  onChange={(e) => updateDraft(d.key, { costCode: e.target.value })}
                                  className="w-20"
                                />
                                <MiniField
                                  label="Cost Price"
                                  type="number"
                                  value={d.acquisitionCost}
                                  onChange={(e) =>
                                    updateDraft(d.key, { acquisitionCost: e.target.value })
                                  }
                                  className="w-20 text-right"
                                />
                                <MiniField
                                  label="D Code"
                                  value={d.dCode}
                                  onChange={(e) => updateDraft(d.key, { dCode: e.target.value })}
                                  className="w-20"
                                />
                                <MiniField
                                  label="Sell Code"
                                  value={d.sellCode}
                                  onChange={(e) => updateDraft(d.key, { sellCode: e.target.value })}
                                  className="w-20"
                                />
                                <MiniField
                                  label="Sell Price"
                                  type="number"
                                  value={d.currentPrice}
                                  onChange={(e) =>
                                    updateDraft(d.key, { currentPrice: e.target.value })
                                  }
                                  className="w-20 text-right"
                                />
                                <MiniField
                                  label="RAM"
                                  value={d.ram}
                                  onChange={(e) => updateDraft(d.key, { ram: e.target.value })}
                                  className="w-16"
                                />
                                <MiniField
                                  label="Storage"
                                  value={d.storage}
                                  onChange={(e) => updateDraft(d.key, { storage: e.target.value })}
                                  className="w-20"
                                />
                                <MiniField
                                  label="Color"
                                  value={d.color}
                                  onChange={(e) => updateDraft(d.key, { color: e.target.value })}
                                  className="w-24"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className={
                                    d.markedForRemoval
                                      ? "ml-auto text-foreground"
                                      : "ml-auto text-sale"
                                  }
                                  onClick={() => removeRow(d)}
                                >
                                  {d.markedForRemoval ? "Undo" : "Remove"}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {sections.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                This PO has no device lines — nothing to fix here.
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {unitCount} unit{unitCount === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || loading} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
