"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Pill, Stat, Card } from "@/components/dashboard/dashboard-shell";
import { useReturns, useSettings } from "@/lib/hooks";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { InStoreReturnModal } from "@/components/dashboard/in-store-return-modal";
import { SearchInput } from "@/components/ui/search-input";
import {
  Package,
  User,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  Plus,
  Download,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { bdt } from "@/lib/utils";
import { SortableTable } from "@/components/dashboard/sortable-table";

const statusConfig: Record<
  string,
  { tone: "success" | "warn" | "danger" | "muted" | "info"; label: string; icon: React.ElementType }
> = {
  pending: { tone: "muted", label: "Pending", icon: Clock },
  approved: { tone: "info", label: "Approved", icon: CheckCircle },
  processing: { tone: "info", label: "Processing", icon: RotateCcw },
  completed: { tone: "success", label: "Completed", icon: CheckCircle },
  refunded: { tone: "success", label: "Refunded", icon: CheckCircle },
  rejected: { tone: "danger", label: "Rejected", icon: XCircle },
  awaiting_parts: { tone: "warn", label: "Awaiting Parts", icon: AlertCircle },
  repairing: { tone: "info", label: "Repairing", icon: RotateCcw },
};

const REASONS = [
  "wrong_item",
  "defective",
  "damaged",
  "no_longer_needed",
  "not_as_described",
  "ordered_by_mistake",
  "other",
];

export default function Returns() {
  const {
    data: serverReturns = [],
    isLoading: serverLoading,
    refetch: serverRefetch,
  } = useReturns();
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingReturn, setEditingReturn] = useState<any>(null);
  const [channelTab, setChannelTab] = useState<"online" | "in_store">("online");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { data: settings } = useSettings();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/dashboard/returns?search=${encodeURIComponent(q.trim())}`);
      if (res.ok) setSearchResults(await res.json());
    } catch {
      // keep previous results on error
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, fetchSearch]);

  const returns = searchResults ?? serverReturns;
  const isLoading = search ? searchLoading : serverLoading;
  const refetch = search ? () => fetchSearch(search) : serverRefetch;

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "Your Shop",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "",
      email: settings?.storeEmail || "",
    }),
    [settings],
  );

  const onlineReturns = returns.filter((r) => r.channel === "online");
  const inStoreReturns = returns.filter((r) => r.channel !== "online");
  const visible = channelTab === "online" ? onlineReturns : inStoreReturns;

  const openRMAs = returns.filter(
    (r) => r.status === "pending" || r.status === "approved" || r.status === "processing",
  ).length;
  const inRepair = returns.filter(
    (r) => r.status === "awaiting_parts" || r.status === "repairing",
  ).length;
  const totalRefunded = returns
    .filter((r) => r.refundAmount && (r.status === "refunded" || r.status === "completed"))
    .reduce((s, r) => s + (r.refundAmount || 0), 0);

  const handleStatusUpdate = async (
    id: string,
    newStatus: string,
    notes?: string,
    extra?: Record<string, unknown>,
  ) => {
    try {
      const response = await fetch("/api/dashboard/returns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: newStatus,
          adminNotes: notes,
          ...extra,
        }),
      });

      if (!response.ok) throw new Error("Failed to update status");

      toast.success(`Return ${newStatus}`);
      refetch();
      if (selectedReturn?.id === id) {
        setSelectedReturn({ ...selectedReturn, status: newStatus, ...extra });
      }
    } catch (error) {
      toast.error("Failed to update return status");
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat label="Open RMAs" value={String(openRMAs)} hint="Awaiting action" />
        <Stat label="In Repair" value={String(inRepair)} hint="Parts/repair pending" />
        <Stat
          label="Refunded (30d)"
          value={totalRefunded > 0 ? bdt(totalRefunded) : "৳0"}
          hint="Total refunds issued"
        />
        <Stat
          label="Total Returns"
          value={String(returns.length)}
          hint="All time return requests"
        />
      </div>

      <div className="mt-4">
        {/* Channel tabs + new return action */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID, customer, product…"
              className="w-64"
            />
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "online", label: "Online", count: onlineReturns.length },
                  { id: "in_store", label: "In-store", count: inStoreReturns.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setChannelTab(t.id)}
                  className={
                    "flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-colors " +
                    (channelTab === t.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-surface hover:text-foreground")
                  }
                >
                  {t.label}
                  <span
                    className={
                      "rounded px-1 text-[10px] " +
                      (channelTab === t.id
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-surface text-muted-foreground")
                    }
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {visible.length > 0 && (
              <>
                <button
                  onClick={() => {
                    generatePDF({
                      title: `${channelTab === "online" ? "Online" : "In-Store"} Returns Report`,
                      storeInfo,
                      kpis: [
                        { label: "Total Returns", value: String(visible.length) },
                        { label: "Open RMAs", value: String(openRMAs) },
                        { label: "In Repair", value: String(inRepair) },
                        { label: "Total Refunded", value: bdtPDF(totalRefunded) },
                      ],
                      columns: [
                        { header: "RMA ID", key: "id", width: 22 },
                        { header: "Customer", key: "customer" },
                        { header: "Product", key: "product" },
                        { header: "Reason", key: "reason", width: 22 },
                        { header: "Status", key: "status", width: 18 },
                        { header: "Refund", key: "refund", width: 22, align: "right" },
                        { header: "Date", key: "date", width: 20 },
                      ],
                      rows: visible.map((r) => ({
                        id: r.id.slice(0, 8),
                        customer: r.customerName || "—",
                        product: r.productName || "—",
                        reason: r.reason || "—",
                        status: r.status,
                        refund: r.refundAmount ? bdtPDF(r.refundAmount) : "—",
                        date: new Date(r.createdAt).toLocaleDateString(),
                      })),
                      grandTotal: { label: "Total Refunded", value: bdtPDF(totalRefunded) },
                    });
                    toast.success("PDF exported");
                  }}
                  className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> PDF
                </button>
                <button
                  onClick={() => {
                    downloadCSV(
                      [
                        "RMA ID",
                        "Customer",
                        "Product",
                        "Reason",
                        "Status",
                        "Refund",
                        "Channel",
                        "Date",
                      ],
                      visible.map((r) => [
                        r.id.slice(0, 8),
                        r.customerName || "",
                        r.productName || "",
                        r.reason || "",
                        r.status,
                        r.refundAmount || "",
                        r.channel || "",
                        new Date(r.createdAt).toLocaleDateString(),
                      ]),
                      `returns-report-${channelTab}-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                    toast.success("CSV exported");
                  }}
                  className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                >
                  <Download size={12} /> CSV
                </button>
              </>
            )}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={13} /> New In-store Return
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading returns…</div>
        ) : visible.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            {search
              ? "No returns found."
              : channelTab === "online"
                ? "No online return requests yet."
                : "No in-store returns yet. Use “New In-store Return” to record a counter return."}
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <SortableTable
              columns={[
                {
                  key: "id",
                  header: "RMA",
                  sortable: true,
                  render: (v, row) => (
                    <div>
                      <div className="font-mono text-xs">{v.slice(0, 12)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "customerName",
                  header: "Customer",
                  sortable: true,
                  render: (v, row) => (
                    <div className="flex items-center gap-2">
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-medium">
                        {(row.userFirstName || v || "G")?.[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {row.userFirstName && row.userLastName
                            ? `${row.userFirstName} ${row.userLastName}`
                            : v || "Guest"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {row.customerPhone || row.customerEmail || "No contact"}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "productName",
                  header: "Item",
                  sortable: true,
                  render: (v, row) => (
                    <div>
                      <div className="font-medium">{v || row.productId}</div>
                      <div className="text-xs text-muted-foreground">
                        Qty: {row.qty}
                        {row.orderId ? ` · Order ${row.orderId.slice(0, 8)}` : ""}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "channel",
                  header: "Channel",
                  sortable: true,
                  render: (v) => (
                    <Pill tone={v === "online" ? "info" : "muted"}>
                      {v === "online" ? "Online" : "In-store"}
                    </Pill>
                  ),
                },
                {
                  key: "reason",
                  header: "Issue",
                  sortable: true,
                  render: (v, row) => (
                    <div>
                      <div className="max-w-[150px] truncate text-xs">{v || "—"}</div>
                      {row.condition && (
                        <div className="mt-1 text-xs text-muted-foreground capitalize">
                          {row.condition}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  key: "resolutionType",
                  header: "Resolution",
                  sortable: true,
                  render: (v) => <div className="text-xs capitalize">{v || "refund"}</div>,
                },
                {
                  key: "status",
                  header: "Stage",
                  sortable: true,
                  render: (v) => {
                    const config = statusConfig[v] || statusConfig.pending;
                    const Icon = config.icon;
                    return (
                      <Pill tone={config.tone}>
                        <span className="flex items-center gap-1">
                          <Icon size={10} /> {config.label}
                        </span>
                      </Pill>
                    );
                  },
                },
                {
                  key: "refundAmount",
                  header: "Amount",
                  sortable: true,
                  render: (v, row) =>
                    v ? (
                      <>
                        <div className="font-medium">{bdt(v)}</div>
                        {row.refundMethod && (
                          <div className="text-xs capitalize text-muted-foreground">
                            via {row.refundMethod}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-right",
                  render: (_v, row) => (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedReturn(row);
                          setShowDetails(true);
                        }}
                        className="text-primary hover:underline"
                      >
                        View
                      </button>
                      {row.channel !== "online" && row.saleLineId != null && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingReturn(row);
                          }}
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={visible}
              rowKey={(row) => row.id}
              onRowClick={(row) => {
                setSelectedReturn(row);
                setShowDetails(true);
              }}
              rowClassName={() => "cursor-pointer"}
              pageSize={25}
              emptyMessage="No returns found."
            />
          </Card>
        )}
      </div>

      {/* New In-store Return Modal */}
      {showCreate && (
        <InStoreReturnModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setChannelTab("in_store");
            refetch();
          }}
          settings={settings}
        />
      )}

      {/* Edit In-store Return Modal (older returns) */}
      {editingReturn && (
        <InStoreReturnModal
          existingReturn={editingReturn}
          onClose={() => setEditingReturn(null)}
          onCreated={() => {
            setChannelTab("in_store");
            refetch();
          }}
          settings={settings}
        />
      )}

      {/* Return Details Modal */}
      {showDetails && selectedReturn && (
        <ReturnDetailsModal
          returnData={selectedReturn}
          onClose={() => {
            setShowDetails(false);
            setSelectedReturn(null);
          }}
          onStatusUpdate={handleStatusUpdate}
          onDataChange={(updated) => setSelectedReturn(updated)}
          onEdit={(ret) => {
            setShowDetails(false);
            setSelectedReturn(null);
            setEditingReturn(ret);
          }}
        />
      )}
    </>
  );
}

function ReturnDetailsModal({
  returnData,
  onClose,
  onEdit,
  onStatusUpdate,
  onDataChange,
}: {
  returnData: any;
  onClose: () => void;
  onEdit: (data: any) => void;
  onStatusUpdate: (
    id: string,
    status: string,
    notes?: string,
    extra?: Record<string, unknown>,
  ) => void;
  onDataChange: (data: any) => void;
}) {
  const [notes, setNotes] = useState(returnData.adminNotes || "");
  const [saving, setSaving] = useState(false);
  const [refundMethod, setRefundMethod] = useState(returnData.refundMethod || "cash");
  const [refundAmountInput, setRefundAmountInput] = useState(String(returnData.refundAmount ?? 0));
  const [issuingRefund, setIssuingRefund] = useState(false);

  const config = statusConfig[returnData.status] || statusConfig.pending;
  const Icon = config.icon;
  const isRefund = (returnData.resolutionType || "refund") === "refund";
  const canIssueRefund =
    isRefund && (returnData.status === "approved" || returnData.status === "processing");

  const handleUpdateStatus = (newStatus: string, extra?: Record<string, unknown>) => {
    setSaving(true);
    onStatusUpdate(returnData.id, newStatus, notes, extra);
    setSaving(false);
  };

  const handleIssueRefund = () => {
    setIssuingRefund(true);
    onStatusUpdate(returnData.id, "refunded", notes, {
      refundAmount: Math.round(parseFloat(refundAmountInput || "0")),
      refundMethod,
    });
    setIssuingRefund(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[85vh] w-full max-w-3xl overflow-y-auto border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface">
              <Package size={18} className="text-muted-foreground" />
            </div>
            <div>
              <div className="font-mono text-sm">{returnData.id}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Created {new Date(returnData.createdAt).toLocaleDateString()}</span>
                {returnData.resolvedAt && (
                  <span>· Resolved {new Date(returnData.resolvedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground"
          >
            <XCircle size={18} />
          </button>
        </div>

        <div className="p-5">
          {/* Status Banner */}
          <div className="mb-4 rounded border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pill tone={config.tone}>
                  <span className="flex items-center gap-1.5">
                    <Icon size={12} /> {config.label}
                  </span>
                </Pill>
                <span className="text-sm text-muted-foreground">
                  {returnData.resolutionType || "refund"} · {returnData.condition || "new"}{" "}
                  condition
                </span>
                {returnData.refundMethod && (
                  <span className="text-sm capitalize text-muted-foreground">
                    · via {returnData.refundMethod}
                  </span>
                )}
                <Pill tone={returnData.channel === "online" ? "info" : "muted"}>
                  {returnData.channel === "online" ? "Online" : "In-store"}
                </Pill>
              </div>
              {returnData.refundAmount && (
                <div className="font-medium">{bdt(returnData.refundAmount)}</div>
              )}
            </div>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2">
            {/* Customer Info */}
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <User size={12} /> Customer
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-medium">
                  {returnData.userFirstName && returnData.userLastName
                    ? `${returnData.userFirstName} ${returnData.userLastName}`
                    : returnData.customerName || "Guest"}
                </div>
                {returnData.customerEmail && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Mail size={12} /> {returnData.customerEmail}
                  </div>
                )}
                {returnData.customerPhone && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Phone size={12} /> {returnData.customerPhone}
                  </div>
                )}
              </div>
            </Card>

            {/* Product Info */}
            <Card className="p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                <Package size={12} /> Product
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-medium">{returnData.productName || returnData.productId}</div>
                <div className="text-muted-foreground">
                  {returnData.orderId ? `Order: ${returnData.orderId}` : "In-store return"} · Qty:{" "}
                  {returnData.qty}
                </div>
                {returnData.reason && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Reason:</span> {returnData.reason}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Admin Notes */}
          <Card className="mb-4 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Admin Notes
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
              rows={3}
              placeholder="Add notes about this return..."
            />
          </Card>

          {/* Actions */}
          <Card className="p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Update Status
            </div>

            {canIssueRefund && (
              <div className="mb-4 rounded border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                  <CheckCircle size={12} /> Issue Refund
                </div>
                <div className="mb-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Amount (৳)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={refundAmountInput}
                      onChange={(e) => setRefundAmountInput(e.target.value)}
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Payment Method
                    </label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="mobile">Mobile</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleIssueRefund}
                  disabled={saving || issuingRefund || parseFloat(refundAmountInput || "0") <= 0}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {issuingRefund ? "Issuing…" : "Issue Refund"}
                </button>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  {returnData.saleLineId || returnData.exchangeOrderId
                    ? "Restores the returned item to stock automatically."
                    : "Not linked to a POS sale — stock is not restored automatically."}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {returnData.channel !== "online" && returnData.saleLineId != null && (
                <button
                  onClick={() => onEdit(returnData)}
                  className="flex items-center gap-1 rounded border border-border px-3 py-1.5 text-xs text-primary hover:bg-surface"
                >
                  <Pencil size={11} /> Edit with Counter Modal
                </button>
              )}
              {returnData.status === "pending" && (
                <>
                  <button
                    onClick={() => handleUpdateStatus("approved")}
                    disabled={saving}
                    className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdateStatus("rejected")}
                    disabled={saving}
                    className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
              {(returnData.status === "approved" || returnData.status === "processing") && (
                <>
                  <button
                    onClick={() => handleUpdateStatus("processing")}
                    disabled={saving}
                    className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface disabled:opacity-50"
                  >
                    Processing
                  </button>
                  <button
                    onClick={() => handleUpdateStatus("awaiting_parts")}
                    disabled={saving}
                    className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface disabled:opacity-50"
                  >
                    Awaiting Parts
                  </button>
                  {!canIssueRefund && (
                    <button
                      onClick={() => handleUpdateStatus("completed")}
                      disabled={saving}
                      className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Complete
                    </button>
                  )}
                </>
              )}
              {(returnData.status === "completed" || returnData.status === "refunded") && (
                <div className="text-xs text-muted-foreground">
                  This return has been {returnData.status}
                  {returnData.refundMethod ? ` (refunded via ${returnData.refundMethod})` : ""}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
