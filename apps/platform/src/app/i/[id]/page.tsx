import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { formatInvoiceNumber, taka } from "@/lib/domain";
import { fmtDate } from "@/lib/format";
import { getInvoice } from "@/lib/invoices";
import { verifyOwnerInvoiceToken } from "@/lib/invoice-link";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Owner-facing invoice view, reachable without a login via an unguessable
 * link the admin sends over WhatsApp/SMS. Shows what to pay, the BanglaQR
 * and where to send the transaction ID. Read-only by design — payments are
 * recorded by the Axiom team after verification.
 */
export default async function OwnerInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !verifyOwnerInvoiceToken(id, t)) {
    notFound();
  }
  const data = await getInvoice(id);
  if (!data) notFound();
  const { inv, tenant, payment } = data;
  const number = formatInvoiceNumber(inv.seq, inv.createdAt);
  const now = new Date();
  const overdue = inv.status === "due" && inv.dueDate && inv.dueDate < now;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/axiom-mark.svg" alt="" className="h-7 w-7" />
        <span className="text-sm font-bold">Axiom Tech</span>
      </div>

      <div className="card space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-lg font-bold">{number}</h1>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{tenant.name}</p>
          </div>
          <span
            className="rounded px-2 py-1 text-xs font-semibold"
            style={
              inv.status === "paid"
                ? { background: "#dcfce7", color: "#166534" }
                : overdue
                  ? { background: "#fee2e2", color: "#991b1b" }
                  : { background: "#fef9c3", color: "#854d0e" }
            }
          >
            {inv.status === "paid" ? "Paid — thank you" : overdue ? "Overdue" : "Due"}
          </span>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>For</dt><dd className="text-right">{inv.description}</dd></div>
          <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Amount</dt><dd className="text-lg font-bold">{taka(inv.amount)}</dd></div>
          {inv.status !== "paid" && (
            <div className="flex justify-between gap-4">
              <dt style={{ color: "var(--muted-foreground)" }}>Due date</dt>
              <dd style={overdue ? { color: "var(--bad)" } : undefined}>{fmtDate(inv.dueDate)}</dd>
            </div>
          )}
          {inv.status === "paid" && (
            <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Paid on</dt><dd>{fmtDate(inv.paidAt)}</dd></div>
          )}
        </dl>

        {inv.status !== "paid" && (
          <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <div className="flex flex-col items-center gap-2">
              <Image src="/banglaqr.png" alt="BanglaQR merchant QR" width={200} height={200} className="h-[200px] w-[200px] rounded-lg border" style={{ borderColor: "var(--line)" }} />
              <p className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                Scan with any banking or MFS app (bKash, Nagad, Rocket, bank app).
                Amount: <strong>{taka(inv.amount)}</strong>. Then send us the transaction ID
                to confirm.
              </p>
            </div>
          </div>
        )}

        {inv.status === "paid" && payment && (
          <p className="border-t pt-3 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}>
            Received via {payment.method.replace(/^\w/, (c) => c.toUpperCase())}
            {payment.reference ? <> — ref {payment.reference}</> : null}.
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
        Questions? Reply to the Axiom Tech agent who set up your shop.
      </p>
    </main>
  );
}
