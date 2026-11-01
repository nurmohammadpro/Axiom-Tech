export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bkash", label: "bKash" },
  { id: "nagad", label: "Nagad" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank Transfer" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.id, m.label]),
);

// Methods that have configurable accounts in settings (Cash has none).
export const ACCOUNT_METHODS = ["bkash", "nagad", "card", "bank"] as const;
export type AccountMethodId = (typeof ACCOUNT_METHODS)[number];

// ── POS payment methods (owner-managed in Settings → Payments) ──────────────
// Stored per shop as store_settings key `pos_methods`. Cash is pinned: always
// first and never deletable, so a sale can always be settled in cash.

export interface PosMethod {
  id: string;
  name: string;
  active: boolean;
}

export const DEFAULT_POS_METHODS: PosMethod[] = [
  { id: "cash", name: "Cash", active: true },
  { id: "bkash", name: "bKash", active: true },
  { id: "nagad", name: "Nagad", active: true },
  { id: "card", name: "Card", active: true },
  { id: "bank", name: "Bank", active: true },
];

export function posMethodsFromSettings(raw: unknown): PosMethod[] {
  if (!Array.isArray(raw)) return DEFAULT_POS_METHODS.map((m) => ({ ...m }));
  const list = (raw as PosMethod[]).filter(
    (m) => m && typeof m.id === "string" && typeof m.name === "string" && m.id.length > 0,
  );
  if (!list.some((m) => m.id === "cash")) {
    list.unshift({ id: "cash", name: "Cash", active: true });
  }
  return list;
}
