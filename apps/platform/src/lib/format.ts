const TZ = "Asia/Dhaka";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}

/** Whole days from now until d (negative when past). */
export function daysUntil(d: Date | string | null | undefined, now = new Date()): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - now.getTime()) / 86_400_000);
}

const METHOD_LABELS: Record<string, string> = { banglaqr: "BanglaQR", cash: "Cash", bkash: "bKash", nagad: "Nagad", bank: "Bank", other: "Other" };
export function methodLabel(m: string): string {
  return METHOD_LABELS[m] ?? m;
}
