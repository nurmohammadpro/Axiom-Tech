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
