/**
 * Shared date-range presets for reports. Dates are `YYYY-MM-DD` in the
 * viewer's local timezone; `null` means open-ended. The API compares these
 * against `created_at::date`, so a whole day is always included.
 */

export type RangePreset = "today" | "7d" | "30d" | "month" | "last_month" | "all" | "custom";

export interface DateRange {
  preset: RangePreset;
  from: string | null;
  to: string | null;
  label: string;
}

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "all", label: "All time" },
];

/** Local-time YYYY-MM-DD (avoids the UTC off-by-one of toISOString). */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function resolveRange(
  preset: RangePreset,
  custom?: { from?: string; to?: string },
): DateRange {
  const now = new Date();
  switch (preset) {
    case "today": {
      const t = ymd(now);
      return { preset, from: t, to: t, label: "Today" };
    }
    case "7d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 6);
      return { preset, from: ymd(f), to: ymd(now), label: "Last 7 days" };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(f.getDate() - 29);
      return { preset, from: ymd(f), to: ymd(now), label: "Last 30 days" };
    }
    case "month": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset, from: ymd(f), to: ymd(now), label: "This month" };
    }
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { preset, from: ymd(f), to: ymd(t), label: "Last month" };
    }
    case "custom": {
      const from = custom?.from || null;
      const to = custom?.to || null;
      return { preset, from, to, label: `${from ?? "…"} → ${to ?? "…"}` };
    }
    case "all":
    default:
      return { preset: "all", from: null, to: null, label: "All time" };
  }
}
