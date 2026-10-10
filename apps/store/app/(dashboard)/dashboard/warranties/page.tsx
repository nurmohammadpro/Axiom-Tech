"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  useWarranties,
  useWarrantyClaims,
  useWarrantyPolicies,
  useWarrantyStats,
  useCreateWarrantyClaim,
  useUpdateWarrantyClaim,
} from "@/lib/hooks";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Filter,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Shield,
  Clock,
  Edit,
  Trash2,
} from "lucide-react";
import { Card as UICard } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "active", label: "Active", tone: "success" as const },
  { value: "claimed", label: "Claimed", tone: "info" as const },
  { value: "void", label: "Void", tone: "danger" as const },
];

const CLAIM_STATUS_OPTIONS = [
  { value: "requested", label: "Requested", tone: "info" as const },
  { value: "diagnosing", label: "Diagnosing", tone: "warn" as const },
  { value: "resolved", label: "Resolved", tone: "success" as const },
  { value: "rejected", label: "Rejected", tone: "danger" as const },
];

function statusTone(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.tone ?? "muted";
}

function claimStatusTone(status: string) {
  return CLAIM_STATUS_OPTIONS.find((s) => s.value === status)?.tone ?? "muted";
}

// ---------------------------------------------------------------------------
// Overview Tab — Warranty data table
// ---------------------------------------------------------------------------

function OverviewTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading } = useWarranties({ search, status: statusFilter, page, limit });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search customer, product, IMEI…"
          label="Search Warranties"
          description="search by customer, product, or IMEI"
        />
        <div className="flex items-center gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatusFilter(statusFilter === s.value ? "" : s.value);
                setPage(0);
              }}
              className={
                "rounded-sm border px-2 py-1 text-xs transition-colors " +
                (statusFilter === s.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-surface")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading warranties…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search || statusFilter
            ? "No warranties match your filters."
            : "No warranties yet. Warranties are created when products are sold."}
        </div>
      ) : (
        <>
          <div className="mb-3 text-xs text-muted-foreground">{total} total warranties</div>
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">IMEI / Serial</th>
                  <th className="px-3 py-2 font-medium">Purchase</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface"
                  >
                    <td className="px-3 py-2 align-middle">
                      <div className="text-sm">{r.customerName}</div>
                      {r.customerPhone && (
                        <div className="text-xs text-muted-foreground">{r.customerPhone}</div>
                      )}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-sm align-middle">
                      {r.productName}
                    </td>
                    <td className="px-3 py-2 text-sm align-middle">
                      {r.variantName || "—"}
                      {r.variantSku && (
                        <div className="text-xs text-muted-foreground">SKU: {r.variantSku}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs align-middle">
                      {r.imei1 || r.serialNumber || r.unitCode || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground align-middle">
                      {r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground align-middle">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Pill tone={statusTone(r.displayStatus)}>
                        {r.displayStatus === "claimed"
                          ? "Claimed"
                          : r.displayStatus === "void"
                            ? "Void"
                            : "Active"}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Claims Tab — Claims management
// ---------------------------------------------------------------------------

function ClaimsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [showNewClaim, setShowNewClaim] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 25;

  const { data, isLoading } = useWarrantyClaims({ search, status: statusFilter, page, limit });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search claim #, customer, product…"
          label="Search Claims"
          description="search by claim number, customer, or product"
        />
        <div className="flex items-center gap-1">
          {CLAIM_STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setStatusFilter(statusFilter === s.value ? "" : s.value);
                setPage(0);
              }}
              className={
                "rounded-sm border px-2 py-1 text-xs transition-colors " +
                (statusFilter === s.value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-surface")
              }
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowNewClaim(true)}>
          <Plus size={13} /> New Claim
        </Button>
      </div>

      {showNewClaim && <NewClaimForm onClose={() => setShowNewClaim(false)} />}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading claims…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search || statusFilter ? "No claims match your filters." : "No warranty claims yet."}
        </div>
      ) : (
        <>
          <div className="mb-3 text-xs text-muted-foreground">{total} total claims</div>
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 font-medium"></th>
                  <th className="px-3 py-2 font-medium">Claim #</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => {
                  const isExpanded = expandedId === c.id;
                  return (
                    <ClaimRow
                      key={c.id}
                      claim={c}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : c.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} /> Previous
                </Button>
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Claim row with expand + inline status update
// ---------------------------------------------------------------------------

function ClaimRow({
  claim,
  isExpanded,
  onToggle,
}: {
  claim: any;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const updateClaim = useUpdateWarrantyClaim();
  const [newStatus, setNewStatus] = useState(claim.status);

  const handleStatusChange = (status: string) => {
    setNewStatus(status);
    updateClaim.mutate({ id: claim.id, status });
  };

  return (
    <>
      <tr
        className="border-b border-border last:border-b-0 hover:bg-surface cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-muted-foreground w-6 align-middle">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
        </td>
        <td className="px-3 py-2 font-mono text-xs align-middle">{claim.claimNumber}</td>
        <td className="px-3 py-2 text-sm align-middle">{claim.customerName}</td>
        <td className="max-w-[180px] truncate px-3 py-2 text-sm align-middle">
          {claim.productName}
        </td>
        <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground align-middle">
          {claim.issueDescription || "—"}
        </td>
        <td className="px-3 py-2 align-middle">
          <Pill tone={claimStatusTone(claim.status)}>{claim.status}</Pill>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground align-middle">
          {claim.receivedAt ? new Date(claim.receivedAt).toLocaleDateString() : "—"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border bg-surface/50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground">IMEI / Serial: </span>
                  <span className="font-mono text-xs">
                    {claim.imei1 || claim.serialNumber || claim.unitCode || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Variant: </span>
                  <span className="text-xs">
                    {claim.variantName || "—"}{" "}
                    {claim.variantSku ? `(SKU: ${claim.variantSku})` : ""}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Warranty: </span>
                  <span className="text-xs">{claim.policyName || "—"}</span>
                  {claim.warrantyExpiresAt && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · Expires {new Date(claim.warrantyExpiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Intake condition: </span>
                  <span className="text-xs">{claim.intakeCondition || "—"}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Update Status</label>
                  <div className="mt-1 flex gap-1">
                    {CLAIM_STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(s.value);
                        }}
                        disabled={updateClaim.isPending}
                        className={
                          "rounded-sm border px-2 py-1 text-xs transition-colors " +
                          (newStatus === s.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:bg-surface")
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {claim.diagnosis && (
                  <div>
                    <div className="text-xs text-muted-foreground">Diagnosis</div>
                    <div className="mt-1 text-sm">{claim.diagnosis}</div>
                  </div>
                )}
                {claim.resolution && (
                  <div>
                    <div className="text-xs text-muted-foreground">Resolution</div>
                    <div className="mt-1 text-sm">{claim.resolution}</div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// New Claim Form
// ---------------------------------------------------------------------------

function NewClaimForm({ onClose }: { onClose: () => void }) {
  const createClaim = useCreateWarrantyClaim();
  const [unitCode, setUnitCode] = useState("");
  const [issue, setIssue] = useState("");
  const [intakeCondition, setIntakeCondition] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupError, setLookupError] = useState("");

  const handleLookup = async () => {
    if (!unitCode.trim()) return;
    setLookupError("");
    setLookupResult(null);
    try {
      const res = await fetch(
        `/api/warranties/validate?identifier=${encodeURIComponent(unitCode.trim())}`,
      );
      if (!res.ok) {
        const err = await res.json();
        setLookupError(err.error || "Unit not found");
        return;
      }
      const data = await res.json();
      setLookupResult(data);
    } catch {
      setLookupError("Lookup failed");
    }
  };

  const handleSubmit = () => {
    if (!lookupResult?.unit?.id || !issue.trim()) return;
    createClaim.mutate(
      {
        unitId: lookupResult.unit.id,
        issueDescription: issue.trim(),
        intakeCondition: intakeCondition.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 text-sm font-medium">New Warranty Claim</div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 rounded border border-border p-3 text-sm">
          <span className="text-xs text-muted-foreground">IMEI / Serial / Unit Code</span>
          <div className="flex gap-2">
            <input
              value={unitCode}
              onChange={(e) => setUnitCode(e.target.value)}
              placeholder="Scan or type…"
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
            />
            <Button size="sm" variant="surface" onClick={handleLookup} disabled={!unitCode.trim()}>
              Lookup
            </Button>
          </div>
          {lookupError && <span className="text-xs text-sale">{lookupError}</span>}
          {lookupResult && (
            <div className="rounded border border-border bg-surface p-2 text-xs">
              <div>
                Unit: <span className="font-mono">{lookupResult.unit.unitCode}</span>
              </div>
              <div>Status: {lookupResult.unit.status}</div>
              {lookupResult.warranty && (
                <div className="mt-1 text-muted-foreground">
                  Warranty {lookupResult.warranty.status} · {lookupResult.warranty.remainingDays}{" "}
                  days remaining
                </div>
              )}
              {!lookupResult.warranty && (
                <div className="mt-1 text-muted-foreground">No active warranty on this unit</div>
              )}
            </div>
          )}
        </label>
        <label className="grid gap-1.5 rounded border border-border p-3 text-sm">
          <span className="text-xs text-muted-foreground">Issue Description *</span>
          <textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="Describe the problem…"
            rows={3}
            className="rounded border border-border bg-background px-2 py-1.5 text-sm resize-none"
          />
        </label>
        <label className="grid gap-1.5 rounded border border-border p-3 text-sm">
          <span className="text-xs text-muted-foreground">Intake Condition</span>
          <input
            value={intakeCondition}
            onChange={(e) => setIntakeCondition(e.target.value)}
            placeholder="e.g. Cracked screen, water damage"
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!lookupResult?.unit?.id || !issue.trim() || createClaim.isPending}
        >
          {createClaim.isPending ? "Creating…" : "Create Claim"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Policies Tab — Warranty policy management (moved from its own page)
// ---------------------------------------------------------------------------

function PoliciesTab() {
  const { data: policies = [], refetch } = useWarrantyPolicies();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<any>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage warranty coverage periods and terms for your products
        </p>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Policy
        </Button>
      </div>

      {showCreateForm && (
        <PolicyForm
          onSubmit={async (data) => {
            await fetch("/api/warranties/policies", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            setShowCreateForm(false);
            refetch();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {editingPolicy && (
        <PolicyForm
          policy={editingPolicy}
          onSubmit={async (data) => {
            await fetch(`/api/warranties/policies/${editingPolicy.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            setEditingPolicy(null);
            refetch();
          }}
          onCancel={() => setEditingPolicy(null)}
        />
      )}

      <div className="grid gap-4">
        {policies.length === 0 ? (
          <UICard className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No warranty policies yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first warranty policy to start offering warranty coverage
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Policy
            </Button>
          </UICard>
        ) : (
          policies.map((policy: any) => (
            <UICard key={policy.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-semibold">{policy.name}</h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        policy.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {policy.active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Duration
                      </p>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {policy.durationValue} {policy.durationUnit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        Coverage Type
                      </p>
                      <p className="text-sm font-medium capitalize">
                        {policy.coverageType || "Standard"}
                      </p>
                    </div>
                  </div>

                  {policy.terms && (
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Terms
                      </p>
                      <p className="text-sm text-muted-foreground">{policy.terms}</p>
                    </div>
                  )}

                  {policy.exclusions && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                        Exclusions
                      </p>
                      <p className="text-sm text-muted-foreground">{policy.exclusions}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <Button variant="ghost" size="sm" onClick={() => setEditingPolicy(policy)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      if (confirm("Delete this policy?")) {
                        await fetch(`/api/warranties/policies/${policy.id}`, {
                          method: "DELETE",
                        });
                        refetch();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </UICard>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Policy form (create / edit) — used inside the Policies tab
// ---------------------------------------------------------------------------

function PolicyForm({
  policy,
  onSubmit,
  onCancel,
}: {
  policy?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: policy?.name || "",
    durationValue: policy?.durationValue || 12,
    durationUnit: policy?.durationUnit || "months",
    coverageType: policy?.coverageType || "standard",
    terms: policy?.terms || "",
    exclusions: policy?.exclusions || "",
    active: policy?.active !== false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <UICard className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Policy Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Duration Value</label>
            <input
              type="number"
              value={formData.durationValue}
              onChange={(e) =>
                setFormData({ ...formData, durationValue: parseInt(e.target.value) })
              }
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              min="1"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration Unit</label>
            <select
              value={formData.durationUnit}
              onChange={(e) => setFormData({ ...formData, durationUnit: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="days">Days</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Coverage Type</label>
            <select
              value={formData.coverageType}
              onChange={(e) => setFormData({ ...formData, coverageType: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="standard">Standard</option>
              <option value="extended">Extended</option>
              <option value="premium">Premium</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Terms & Conditions</label>
          <textarea
            value={formData.terms}
            onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Exclusions</label>
          <textarea
            value={formData.exclusions}
            onChange={(e) => setFormData({ ...formData, exclusions: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            rows={2}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            checked={formData.active}
            onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
            className="rounded"
          />
          <label htmlFor="active" className="text-sm">
            Active
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{policy ? "Update Policy" : "Create Policy"}</Button>
        </div>
      </form>
    </UICard>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Warranties() {
  const [activeTab, setActiveTab] = useState<"overview" | "claims" | "policies">("overview");

  return (
    <div style={{ fontSize: "0.95em" }}>
      <div className="flex gap-4 border-b border-border mb-4">
        {(["overview", "claims", "policies"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" ? "Overview" : tab === "claims" ? "Claims" : "Policies"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "claims" && <ClaimsTab />}
      {activeTab === "policies" && <PoliciesTab />}
    </div>
  );
}
