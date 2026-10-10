"use client";

import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";

interface WarrantyPolicy {
  id: number;
  name: string;
  durationValue: number;
  durationUnit: string;
  coverageType: string;
  terms?: string | null;
  exclusions?: string | null;
}

interface WarrantySelectorProps {
  value: number | null;
  onChange: (policyId: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  showSummary?: boolean;
}

export function WarrantySelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Select warranty",
  showSummary = true,
}: WarrantySelectorProps) {
  const { data: policies = [], isLoading } = useQuery<WarrantyPolicy[]>({
    queryKey: ["dashboard", "warranties"],
    queryFn: () => fetch("/api/dashboard/warranties").then((r) => r.json()),
  });

  const selectedPolicy = policies.find((p) => p.id === value);

  const formatDuration = (policy: WarrantyPolicy) => {
    const { durationValue, durationUnit } = policy;
    const unit = durationUnit === "months" ? "month" : durationUnit === "years" ? "year" : "day";
    return `${durationValue} ${durationValue > 1 ? unit + "s" : unit}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-muted-foreground" />
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled || isLoading}
          className="flex-1 border border-border bg-background px-2 py-1.5 text-sm outline-none transition-colors hover:border-border/80 focus:border-foreground/80 disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {policies.map((policy) => (
            <option key={policy.id} value={policy.id}>
              {policy.name} ({formatDuration(policy)})
            </option>
          ))}
        </select>
      </div>

      {showSummary && selectedPolicy && (
        <div className="rounded border border-border bg-muted/40 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{selectedPolicy.name}</div>
          <div className="text-muted-foreground">
            Coverage: <span className="capitalize">{selectedPolicy.coverageType}</span>
            {" • Duration: "}
            <span className="font-medium">{formatDuration(selectedPolicy)}</span>
          </div>
          {selectedPolicy.terms && (
            <div className="mt-1 text-muted-foreground">
              <span className="font-medium">Terms:</span> {selectedPolicy.terms}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
