import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Owner invoice links: `/i/<invoiceId>?t=<token>` — viewable without a login
 * so the admin can send an invoice to a shop owner over WhatsApp. The token
 * is an HMAC over the invoice id; without it the page does not render.
 */
export function ownerInvoiceToken(invoiceId: string): string {
  return createHmac("sha256", process.env.PLATFORM_AUTH_SECRET || "dev")
    .update(`axiom-invoice-v1:${invoiceId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyOwnerInvoiceToken(invoiceId: string, token: string | undefined | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(ownerInvoiceToken(invoiceId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The reminder text an admin can paste into WhatsApp/SMS. */
export function ownerReminderMessage(input: {
  ownerUrl: string;
  shopName: string;
  invoiceNumber: string;
  amount: number;
  dueDate: Date;
  taka: (n: number) => string;
}): string {
  const due = input.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    `Assalamu alaikum ${input.shopName},\n` +
    `Your Axiom Tech subscription invoice ${input.invoiceNumber} is due: ${input.taka(input.amount)} by ${due}.\n` +
    `Pay by scanning the QR on this page with any banking or MFS app, then send us the transaction ID:\n` +
    input.ownerUrl
  );
}
