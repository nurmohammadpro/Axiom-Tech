"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Metric card — style 3 from the metrics preview: icon tile left, value +
 * label right, optional "vs previous period" delta chip.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  delta,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  /** Change vs the previous period; positive = up. */
  delta?: { pct: number | null; abs: string | null };
  danger?: boolean;
}) {
  return (
    <div className="border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span
          className={
            "flex h-9 w-9 flex-none items-center justify-center text-sm font-bold " +
            (danger
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary")
          }
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[17px] font-extrabold leading-tight tracking-tight">{value}</div>
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
      {(sub || delta) && (
        <div className="mt-2 flex items-center gap-2">
          {delta && delta.pct !== null && Number.isFinite(delta.pct) && delta.pct !== 0 && (
            <span
              className={
                "inline-flex items-center gap-0.5 text-[10.5px] font-bold " +
                (delta.pct > 0 ? "text-primary" : "text-destructive")
              }
            >
              {delta.pct > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              {Math.abs(delta.pct).toFixed(1)}%
            </span>
          )}
          {delta && delta.pct === 0 && (
            <span className="text-[10.5px] font-semibold text-muted-foreground">— flat</span>
          )}
          {delta && delta.pct === null && delta.abs && (
            <span className="text-[10.5px] font-bold text-primary">{delta.abs}</span>
          )}
          {sub && <span className="text-[10.5px] text-muted-foreground">{sub}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Target ring — style 7: percentage of a goal inside an SVG ring.
 * Progress 0–100.
 */
export function TargetRing({
  label,
  pct,
  center,
  sub,
  tone = "primary",
  action,
}: {
  label: string;
  /** 0–100. */
  pct: number;
  center: string;
  sub?: string;
  tone?: "primary" | "warning";
  action?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const color = tone === "primary" ? "var(--primary)" : "#f59e0b";
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <div className="border border-border bg-card p-3 text-center">
      <div className="relative mx-auto h-[74px] w-[74px]">
        <svg width="74" height="74" viewBox="0 0 74 74">
          <circle cx="37" cy="37" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="37"
            cy="37"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 37 37)"
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-sm font-extrabold">{center}</span>
        </div>
      </div>
      <div className="mt-1.5 text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-xs font-semibold">{sub}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** Percentage change between a value and its previous-period counterpart. */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Absolute change formatted with an optional prefix (e.g. "৳" or ""). */
export function absChange(current: number, previous: number | null | undefined, prefix = ""): string | null {
  if (previous === null || previous === undefined) return null;
  const d = current - previous;
  return `${d >= 0 ? "+" : "−"}${prefix}${Math.abs(d).toLocaleString("en-US")}`;
}
