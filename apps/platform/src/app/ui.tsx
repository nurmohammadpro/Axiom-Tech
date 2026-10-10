import type { ReactNode } from "react";

const TONE: Record<string, { bg: string; fg: string }> = {
  trial: { bg: "#e8eefc", fg: "#1f4fff" },
  active: { bg: "#e3f4ec", fg: "#0f7b4b" },
  suspended: { bg: "#fdf0dc", fg: "#a15c00" },
  cancelled: { bg: "#f1f3f6", fg: "#5b6573" },
  ready: { bg: "#e3f4ec", fg: "#0f7b4b" },
  pending: { bg: "#f1f3f6", fg: "#5b6573" },
  provisioning: { bg: "#e8eefc", fg: "#1f4fff" },
  failed: { bg: "#fde8e6", fg: "#b42318" },
  paid: { bg: "#e3f4ec", fg: "#0f7b4b" },
  due: { bg: "#fdf0dc", fg: "#a15c00" },
  void: { bg: "#f1f3f6", fg: "#5b6573" },
};

export function Badge({ value }: { value: string }) {
  const t = TONE[value] ?? TONE.pending;
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize" style={{ background: t.bg, color: t.fg }}>
      {value}
    </span>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className="mb-4 rounded-lg px-3 py-2 text-sm font-medium"
      style={error ? { background: "#fde8e6", color: "var(--bad)" } : { background: "#e3f4ec", color: "var(--ok)" }}
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
      <div className="text-xs font-semibold" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{hint}</div>}
    </div>
  );
}

export const th = "px-3 py-2 text-left text-xs font-semibold";
export const td = "px-3 py-2 text-sm";
