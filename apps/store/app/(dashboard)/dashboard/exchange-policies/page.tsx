"use client";

import { useState } from "react";
import { Card, Pill } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, TrendingUp, Calculator } from "lucide-react";
import { toast } from "sonner";
import { bdt } from "@/lib/utils";
import { confirmDialog } from "@/components/confirm-host";

async function getExchangePolicies() {
  const res = await fetch("/api/dashboard/exchange-policies");
  if (!res.ok) throw new Error("Failed to fetch exchange policies");
  return res.json();
}

async function createExchangePolicy(data: any) {
  const res = await fetch("/api/dashboard/exchange-policies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create exchange policy");
  return res.json();
}

async function updateExchangePolicy(id: number, data: any) {
  const res = await fetch(`/api/dashboard/exchange-policies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update exchange policy");
  return res.json();
}

async function deleteExchangePolicy(id: number) {
  const res = await fetch(`/api/dashboard/exchange-policies/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete exchange policy");
  return res.json();
}

export default function ExchangePolicies() {
  const queryClient = useQueryClient();
  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["exchange-policies"],
    queryFn: getExchangePolicies,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<any>(null);

  const createMutation = useMutation({
    mutationFn: createExchangePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-policies"] });
      toast.success("Exchange policy created");
      setShowForm(false);
    },
    onError: () => toast.error("Failed to create exchange policy"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateExchangePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-policies"] });
      toast.success("Exchange policy updated");
      setEditingPolicy(null);
    },
    onError: () => toast.error("Failed to update exchange policy"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteExchangePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-policies"] });
      toast.success("Exchange policy deleted");
    },
    onError: () => toast.error("Failed to delete exchange policy"),
  });

  const activePolicy = policies.find((p: any) => p.active);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Exchange Policies</div>
          <div className="text-xs text-muted-foreground">
            Configure device trade-in value calculations
          </div>
        </div>
        <Button variant="default" size="sm" onClick={() => setShowForm(true)}>
          <Plus size={13} /> New Policy
        </Button>
      </div>

      {/* Active Policy Summary */}
      {activePolicy && (
        <Card className="mb-4 border-l-4 border-l-primary">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <TrendingUp size={18} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{activePolicy.name}</span>
                <Pill tone="success">Active</Pill>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Device age range: {activePolicy.minDeviceAge}-{activePolicy.maxDeviceAge} months
                {activePolicy.exchangeFee > 0 &&
                  ` · Exchange fee: ${bdt(activePolicy.exchangeFee)}`}
              </div>
            </div>
            <Button
              variant="surface"
              size="sm"
              onClick={() => {
                setEditingPolicy(activePolicy);
                setShowForm(true);
              }}
            >
              <Pencil size={12} /> Edit
            </Button>
          </div>
        </Card>
      )}

      {/* Value Matrix Preview */}
      {activePolicy && (
        <Card className="mb-4">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator size={14} /> Value Retention Matrix
            </div>
          </div>
          <div className="p-4">
            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: "1 Month", value: activePolicy.month1Value },
                { label: "2 Months", value: activePolicy.month2Value },
                { label: "3 Months", value: activePolicy.month3Value },
                { label: "6 Months", value: activePolicy.month6Value },
                { label: "12 Months", value: activePolicy.month12Value },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold">{item.value}%</div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                Condition Modifiers
              </div>
              <div className="grid gap-3 md:grid-cols-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Excellent:</span>
                  <span className="text-emerald-600">+{activePolicy.excellentConditionBonus}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Good:</span>
                  <span
                    className={
                      activePolicy.goodConditionBonus >= 0 ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {activePolicy.goodConditionBonus >= 0 ? "+" : ""}
                    {activePolicy.goodConditionBonus}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fair:</span>
                  <span className="text-red-600">{activePolicy.fairConditionPenalty}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Poor:</span>
                  <span className="text-red-600">{activePolicy.poorConditionPenalty}%</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* All Policies */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading exchange policies…
        </div>
      ) : policies.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No exchange policies configured. Create one to enable device trade-ins.
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {policies.map((policy: any) => (
              <div
                key={policy.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{policy.name}</span>
                    {policy.active ? (
                      <Pill tone="success">Active</Pill>
                    ) : (
                      <Pill tone="muted">Inactive</Pill>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {policy.minDeviceAge}-{policy.maxDeviceAge} months
                    {policy.description && ` · ${policy.description}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={() => {
                      setEditingPolicy(policy);
                      setShowForm(true);
                    }}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={async () => {
                      if (await confirmDialog({ title: "Delete exchange policy", description: "Delete this exchange policy? Trades already made are unaffected." })) {
                        deleteMutation.mutate(policy.id);
                      }
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Policy Form Modal */}
      {showForm && (
        <PolicyForm
          policy={editingPolicy}
          onClose={() => {
            setShowForm(false);
            setEditingPolicy(null);
          }}
          onSubmit={(data) => {
            if (editingPolicy) {
              updateMutation.mutate({ id: editingPolicy.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
        />
      )}
    </>
  );
}

function PolicyForm({
  policy,
  onClose,
  onSubmit,
}: {
  policy: any;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [formData, setFormData] = useState(
    policy || {
      name: "",
      description: "",
      month1Value: 70,
      month2Value: 60,
      month3Value: 50,
      month6Value: 40,
      month12Value: 30,
      excellentConditionBonus: 5,
      goodConditionBonus: 0,
      fairConditionPenalty: -10,
      poorConditionPenalty: -25,
      exchangeFee: 0,
      minDeviceAge: 1,
      maxDeviceAge: 24,
      active: true,
    },
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3">
          <div className="font-semibold">
            {policy ? "Edit Exchange Policy" : "New Exchange Policy"}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Policy Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Description (optional)</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Value Retention (% of original price)
            </label>
            <div className="grid gap-3 md:grid-cols-5">
              {[
                { key: "month1Value", label: "1 Month" },
                { key: "month2Value", label: "2 Months" },
                { key: "month3Value", label: "3 Months" },
                { key: "month6Value", label: "6 Months" },
                { key: "month12Value", label: "12 Months" },
              ].map((field) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs text-muted-foreground">{field.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData[field.key as keyof typeof formData]}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: parseInt(e.target.value) || 0 })
                      }
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-center"
                      required
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Condition Modifiers (%)
            </label>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                { key: "excellentConditionBonus", label: "Excellent", color: "text-emerald-600" },
                { key: "goodConditionBonus", label: "Good", color: "text-blue-600" },
                { key: "fairConditionPenalty", label: "Fair", color: "text-amber-600" },
                { key: "poorConditionPenalty", label: "Poor", color: "text-red-600" },
              ].map((field) => (
                <div key={field.key}>
                  <label className={`mb-1 block text-xs ${field.color}`}>{field.label}</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {field.key.includes("Bonus") ? "+" : ""}
                    </span>
                    <input
                      type="number"
                      min="-50"
                      max="50"
                      step="1"
                      value={formData[field.key as keyof typeof formData]}
                      onChange={(e) =>
                        setFormData({ ...formData, [field.key]: parseInt(e.target.value) || 0 })
                      }
                      className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-center"
                      required
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Exchange Fee (BDT)</label>
              <input
                type="number"
                min="0"
                value={formData.exchangeFee}
                onChange={(e) =>
                  setFormData({ ...formData, exchangeFee: parseInt(e.target.value) || 0 })
                }
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Min Age (months)</label>
              <input
                type="number"
                min="1"
                value={formData.minDeviceAge}
                onChange={(e) =>
                  setFormData({ ...formData, minDeviceAge: parseInt(e.target.value) || 1 })
                }
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Max Age (months)</label>
              <input
                type="number"
                min="1"
                value={formData.maxDeviceAge}
                onChange={(e) =>
                  setFormData({ ...formData, maxDeviceAge: parseInt(e.target.value) || 24 })
                }
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span>Active (this policy will be used for calculations)</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              {policy ? "Update" : "Create"} Policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
