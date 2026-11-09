"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export interface FeatureRow {
  key: string;
  label: string;
  /** Included in the shop's plan. */
  inPlan: boolean;
}

/**
 * Per-shop feature toggles over the plan. Each feature is Inherit (follow the
 * plan), On (grant even if the plan lacks it) or Off (revoke even if the plan
 * includes it). The gate merges these, so the shop picks changes up within
 * its gate cache TTL (~30 s).
 */
export function FeaturesPanel({
  action,
  rows,
  initial,
  planName,
}: {
  action: (fd: FormData) => void;
  rows: FeatureRow[];
  initial: Record<string, boolean>;
  planName: string;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(initial);
  const dirty = JSON.stringify(overrides) !== JSON.stringify(initial);

  return (
    <form action={action} className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Feature access</h2>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Overrides the {planName} plan for this shop: grant anything, revoke anything.
            The shop picks changes up within about 30 seconds.
          </p>
        </div>
        <SaveButton disabled={!dirty} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--muted-foreground)" }} className="text-left text-xs">
              <th className="py-1.5 pr-3 font-medium">Feature</th>
              <th className="py-1.5 pr-3 font-medium">Plan</th>
              <th className="py-1.5 pr-3 font-medium">Override</th>
              <th className="py-1.5 font-medium">Shop gets</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const state = overrides[r.key]; // true=on, false=off, undefined=inherit
              const effective = state ?? r.inPlan;
              const changed = state !== undefined;
              return (
                <tr key={r.key} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="py-2 pr-3 font-medium">{r.label}</td>
                  <td className="py-2 pr-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {r.inPlan ? "included" : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="inline-flex border" style={{ borderColor: "var(--line)" }}>
                      {(
                        [
                          ["", "Inherit"],
                          ["on", "On"],
                          ["off", "Off"],
                        ] as const
                      ).map(([value, label]) => {
                        const isActive = value === "" ? state === undefined : state === (value === "on");
                        return (
                          <label
                            key={value}
                            className="cursor-pointer px-2 py-1 text-xs"
                            style={
                              isActive
                                ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                                : { color: "var(--muted-foreground)" }
                            }
                          >
                            <input
                              type="radio"
                              name={`f_${r.key}`}
                              value={value}
                              className="sr-only"
                              checked={isActive}
                              onChange={() =>
                                setOverrides((prev) => {
                                  const next = { ...prev };
                                  if (value === "") delete next[r.key];
                                  else next[r.key] = value === "on";
                                  return next;
                                })
                              }
                            />
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 text-xs">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 font-medium " +
                        (effective ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700")
                      }
                      title={changed ? "Changed from the plan — save to apply" : undefined}
                    >
                      {effective ? "on" : "off"}
                      {changed ? " *" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dirty && (
        <p className="text-xs" style={{ color: "var(--bad)" }}>
          Unsaved changes — click Save to apply.
        </p>
      )}
      <div>
        <SaveButton disabled={!dirty} />
      </div>
    </form>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn btn-primary">
      {pending ? "Saving…" : "Save features"}
    </button>
  );
}
