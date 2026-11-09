"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export type ImeiUnit = {
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  unitCode?: string | null;
  status: string;
  locationId?: string | null;
};

type Filter = "all" | "available" | "sold";

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (s === "available") return { label: "In Stock", tone: "success" as const };
  if (s === "sold") return { label: "Sold", tone: "muted" as const };
  if (s === "reserved" || s === "in_transit") return { label: s.replace("_", " "), tone: "warn" as const };
  if (s === "damaged" || s === "returned") return { label: s, tone: "danger" as const };
  return { label: s, tone: "muted" as const };
}

const toneCls: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  muted: "border-border bg-surface text-muted-foreground",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-sale",
};

export function ImeiUnitsTable({
  units,
  highlight,
}: {
  units: ImeiUnit[];
  highlight?: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const available = units.filter((u) => u.status === "available").length;
    const sold = units.filter((u) => u.status === "sold").length;
    return { total: units.length, available, sold, other: units.length - available - sold };
  }, [units]);

  const filtered = useMemo(() => {
    if (filter === "all") return units;
    if (filter === "available") return units.filter((u) => u.status === "available");
    if (filter === "sold") return units.filter((u) => u.status === "sold");
    return units;
  }, [units, filter]);

  const doCopy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      toast.success("Copied");
      setTimeout(() => setCopied(null), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };

  const highlightCls = (v: string) => {
    if (!highlight?.trim() || !v) return "";
    return v.toLowerCase().includes(highlight.trim().toLowerCase())
      ? "bg-amber-100 dark:bg-amber-900/30 rounded px-0.5"
      : "";
  };

  if (units.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface/30 px-3 py-4 text-center text-xs text-muted-foreground">
        No serialized units found for this variant.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      {/* Filter chips + counts */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface/30 px-2 py-1.5">
        {(
          [
            { id: "all" as Filter, label: "All", n: counts.total },
            { id: "available" as Filter, label: "In Stock", n: counts.available },
            { id: "sold" as Filter, label: "Sold", n: counts.sold },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-surface hover:text-foreground"
            }`}
          >
            {f.label} <span className="opacity-60">{f.n}</span>
          </button>
        ))}
        {counts.other > 0 && <span className="ml-1 text-[10px] text-muted-foreground">+{counts.other} other</span>}
      </div>

      {/* column headers — mirrors SortableTable header */}
      <div className="grid grid-cols-[28px_1fr_1fr_1fr_88px] gap-2 border-b border-border bg-surface px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <span className="text-center">#</span>
        <span>IMEI 1</span>
        <span>IMEI 2</span>
        <span>Serial</span>
        <span className="text-right">Status</span>
      </div>

      <div className="divide-y divide-border/50 max-h-[360px] overflow-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No {filter === "sold" ? "sold" : filter === "available" ? "in-stock" : ""} units in this filter.
          </div>
        ) : (
          filtered.map((u, idx) => {
            const meta = statusMeta(u.status);
            return (
              <div
                key={`${u.imei1 ?? u.serialNumber ?? "u"}-${idx}-${u.status}`}
                className={`grid grid-cols-[28px_1fr_1fr_1fr_88px] gap-2 px-2.5 py-1.5 items-center transition-colors hover:bg-surface/50 ${
                  u.status === "sold" ? "opacity-60" : ""
                }`}
              >
                <span className="mx-auto grid h-5 w-5 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold leading-none text-primary">
                  {idx + 1}
                </span>

                <MonoCell value={u.imei1} copied={copied} onCopy={doCopy} highlightCls={highlightCls} />
                <MonoCell value={u.imei2} copied={copied} onCopy={doCopy} highlightCls={highlightCls} />
                <MonoCell value={u.serialNumber} copied={copied} onCopy={doCopy} highlightCls={highlightCls} />

                <span className="flex justify-end">
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${toneCls[meta.tone]}`}>
                    {meta.label}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border bg-surface/40 px-2.5 py-1 text-[10px] text-muted-foreground">
        <span>
          {filtered.length !== counts.total ? `${filtered.length} of ${counts.total} · ` : ""}
          {counts.available} in stock · {counts.sold} sold · click value to copy
        </span>
        <span className="hidden sm:inline">IMEIs are 15-digit Luhn-valid</span>
      </div>
    </div>
  );
}

function MonoCell({
  value,
  copied,
  onCopy,
  highlightCls,
}: {
  value: string | null | undefined;
  copied: string | null;
  onCopy: (v: string) => void;
  highlightCls: (v: string) => string;
}) {
  if (!value) {
    return <span className="font-mono text-xs text-muted-foreground/40">—</span>;
  }
  const isCopied = copied === value;
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      title="Click to copy"
      className="group flex min-w-0 items-center gap-1 text-left"
    >
      <span
        className={`truncate font-mono text-xs tracking-tight text-foreground group-hover:text-primary ${highlightCls(value)}`}
      >
        {value}
      </span>
      <span className="shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground">
        {isCopied ? (
          <Check size={11} className="text-emerald-600" />
        ) : (
          <Copy size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </span>
    </button>
  );
}
