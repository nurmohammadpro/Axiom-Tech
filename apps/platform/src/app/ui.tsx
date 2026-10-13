import type { ReactNode } from "react";

/** Status → token classes; same palette roles the store dashboard uses for alerts. */
const TONE: Record<string, string> = {
  trial: "bg-primary/10 text-primary",
  provisioning: "bg-primary/10 text-primary",
  active: "bg-emerald-50 text-emerald-700",
  ready: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  suspended: "bg-amber-50 text-amber-700",
  due: "bg-amber-50 text-amber-700",
  cancelled: "bg-surface text-muted-foreground",
  pending: "bg-surface text-muted-foreground",
  void: "bg-surface text-muted-foreground",
  failed: "bg-red-50 text-red-700",
  overdue: "bg-red-50 text-red-700",
};

export function Badge({ value }: { value: string }) {
  const tone = TONE[value] ?? TONE.pending;
  return <span className={`rounded-sm px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>{value}</span>;
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={
        "mb-4 rounded-sm border px-3 py-2 text-sm font-medium " +
        (error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")
      }
    >
      {error ?? ok}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export const th = "px-3 py-2 text-left text-xs font-semibold";
export const td = "px-3 py-2 text-sm";
