"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";
import { RANGE_PRESETS, resolveRange, type DateRange } from "@/lib/date-range";

/** Preset chips + a custom from/to pair. Fully controlled by the parent's DateRange. */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [showCustom, setShowCustom] = useState(value.preset === "custom");
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");

  const activeCls = "border-primary bg-primary text-primary-foreground";
  const idleCls = "border-border text-muted-foreground hover:text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar size={14} className="text-muted-foreground" />
      <div className="flex flex-wrap items-center gap-1">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setShowCustom(false);
              onChange(resolveRange(p.id));
            }}
            className={
              "border px-2.5 py-1 text-xs transition-colors " +
              (value.preset === p.id ? activeCls : idleCls)
            }
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((s) => !s)}
          className={
            "border px-2.5 py-1 text-xs transition-colors " +
            (value.preset === "custom" ? activeCls : idleCls)
          }
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-border bg-background px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            onClick={() => onChange(resolveRange("custom", { from, to }))}
            className="border border-primary bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      )}

      <span className="ml-auto text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{value.label}</span>
      </span>
    </div>
  );
}
