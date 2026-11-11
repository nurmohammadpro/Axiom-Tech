export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { formatInvoiceNumber, taka } from "@/lib/domain";
import { fmtDate, fmtDateTime, methodLabel } from "@/lib/format";
import { getInvoice } from "@/lib/invoices";
import { can } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { payInvoiceAction, voidInvoiceAction } from "../../actions";
import { Badge, Field, Notice } from "../../../ui";
import { SubmitButton } from "../../submit-button";
import { OwnerLinkButtons } from "./owner-link-buttons";
import { ownerInvoiceToken, ownerReminderMessage } from "@/lib/invoice-link";
import { headers } from "next/headers";
import { PrintButton } from "./print-button";
import { HistoryTable } from "./history-table";

function VoidButton({ action }: { action: () => void }) {
  return (
    <SubmitButton
      className="btn btn-danger"
      confirm="Void this invoice? It stops counting as outstanding and can never be paid."
      pendingLabel="Voiding…"
    >
      Void
    </SubmitButton>
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ["banglaqr", "cash", "bkash", "nagad", "bank", "other"] as const;

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const data = await getInvoice(id);
  if (!data) notFound();
  const { inv, tenant, payment, history } = data;
  const user = await getCurrentUser();
  const number = formatInvoiceNumber(inv.seq, inv.createdAt);
  const payable = inv.status === "due" && inv.kind === "monthly";
  const now = new Date();
  const overdue = inv.status === "due" && inv.dueDate && inv.dueDate < now;
  const voidAction = voidInvoiceAction.bind(null, inv.id);

  // Owner-facing link: survives without a login so the admin can send it over
  // WhatsApp. The HMAC secret stays server-side; only the final URL is copied.
  const host = (await headers()).get("host") ?? process.env.ROOT_DOMAIN ?? "localhost:3100";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const ownerUrl = `${proto}://${host}/i/${inv.id}?t=${ownerInvoiceToken(inv.id)}`;
  const reminder = ownerReminderMessage({
    ownerUrl,
    shopName: tenant.name,
    invoiceNumber: number,
    amount: inv.amount,
    dueDate: inv.dueDate ?? now,
    taka,
  });

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold">{number}</h1>
          <Badge value={overdue ? "overdue" : inv.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn inline-flex items-center gap-1.5" href="/invoices"><ArrowLeft size={13} /> All invoices</Link>
          {inv.status === "due" && <OwnerLinkButtons link={ownerUrl} reminder={reminder} />}
          {inv.status === "paid" && <PrintButton />}
          {inv.status === "due" && user && can(user.role, "tenant:payment") && (
            <VoidButton action={voidAction} />
          )}
        </div>
      </div>
      <Notice ok={ok} error={error} />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-bold">Invoice</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Shop</dt><dd><Link className="underline" href={`/tenants/${tenant.id}`}>{tenant.name}</Link> <span style={{ color: "var(--muted-foreground)" }}>.{tenant.slug}</span></dd></div>
            <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Description</dt><dd>{inv.description}</dd></div>
            <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Amount</dt><dd className="text-base font-bold">{taka(inv.amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Due date</dt><dd style={overdue ? { color: "var(--bad)" } : undefined}>{fmtDate(inv.dueDate)}</dd></div>
            {inv.paidAt && <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Paid at</dt><dd>{fmtDateTime(inv.paidAt)}</dd></div>}
            {payment && (
              <>
                <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Method</dt><dd>{methodLabel(payment.method)}</dd></div>
                <div className="flex justify-between gap-4"><dt style={{ color: "var(--muted-foreground)" }}>Reference</dt><dd className="font-mono">{payment.reference ?? "-"}</dd></div>
              </>
            )}
          </dl>
        </section>

        {inv.status === "due" && (
          <section className="card p-5">
            {inv.kind === "activation" ? (
              <>
                <h2 className="text-sm font-bold">Activation invoice</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Activation invoices are paid with <Link className="underline" href={`/tenants/${tenant.id}`}>Activate to Production</Link> on
                  the shop page, which also moves the shop out of its trial.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold">Scan to pay (BanglaQR)</h2>
                {user && can(user.role, "tenant:payment") ? (
                  <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
                    <Image src="/banglaqr.png" alt="BanglaQR merchant QR" width={180} height={180} className="h-[180px] w-[180px] rounded-lg border" style={{ borderColor: "var(--line)" }} />
                    <div className="text-sm">
                      <div>Amount due: <span className="font-bold">{taka(inv.amount)}</span></div>
                      <div className="mt-1" style={{ color: "var(--muted-foreground)" }}>Invoice {number} - {tenant.name}</div>
                      <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Scan with any banking or MFS app. After the customer pays, record the transaction below.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Only billing staff can record payments.</p>
                )}
              </>
            )}
          </section>
        )}
      </div>

      {payable && user && can(user.role, "tenant:payment") && (
        <section className="card no-print p-5">
          <h2 className="text-sm font-bold">Record payment</h2>
          <form action={payInvoiceAction.bind(null, inv.id)} className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Method">
              <select name="method" className="input" defaultValue="banglaqr">
                {METHODS.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
              </select>
            </Field>
            <Field label="Transaction reference">
              <input name="reference" className="input" placeholder="Txn ID (required for non-cash)" />
            </Field>
            <Field label="Amount (BDT)">
              <input name="amount" type="number" min={1} required defaultValue={inv.amount} className="input" />
            </Field>
            <Field label="Months paid">
              <input name="months" type="number" min={1} max={12} step={1} defaultValue={1} className="input" />
            </Field>
            <Field label="Proof URL">
              <input name="proofUrl" type="url" className="input" placeholder="https:// (screenshot link)" />
            </Field>
            <Field label="Note">
              <input name="note" className="input" placeholder="Optional" />
            </Field>
            <p className="text-xs md:col-span-3" style={{ color: "var(--muted-foreground)" }}>
              The amount must cover the selected months: months × {taka(inv.amount)} (one month).
            </p>
            <div className="md:col-span-3">
              <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
            </div>
          </form>
        </section>
      )}

      <section className="card no-print">
        <h2 className="px-4 pt-4 text-sm font-bold">Shop payment history</h2>
        <div className="mt-2 px-2 pb-2">
          <HistoryTable
            rows={history.map((p) => ({
              id: p.id,
              kind: p.kind,
              amount: p.amount,
              method: p.method,
              reference: p.reference,
              receivedAt: p.receivedAt,
            }))}
          />
        </div>
      </section>

      {inv.status === "paid" && (
        <section className="print-only hidden mx-auto max-w-md p-8 text-sm">
          <div className="text-center">
            <div className="text-lg font-bold">Axiom Tech</div>
            <div style={{ color: "var(--muted-foreground)" }}>Payment receipt</div>
          </div>
          <table className="mt-6 w-full">
            <tbody>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Receipt</td><td className="py-1 text-right font-mono">{number}</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Shop</td><td className="py-1 text-right">{tenant.name} ({tenant.slug})</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>For</td><td className="py-1 text-right">{inv.description}</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Amount paid</td><td className="py-1 text-right font-bold">{taka(inv.amount)}</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Method</td><td className="py-1 text-right">{payment ? methodLabel(payment.method) : "-"}</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Reference</td><td className="py-1 text-right font-mono">{payment?.reference ?? "-"}</td></tr>
              <tr><td className="py-1" style={{ color: "var(--muted-foreground)" }}>Paid on</td><td className="py-1 text-right">{fmtDateTime(inv.paidAt)}</td></tr>
            </tbody>
          </table>
          <p className="mt-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>Thank you for your business. Axiom Tech - by AppBrainer.</p>
        </section>
      )}
    </div>
  );
}
