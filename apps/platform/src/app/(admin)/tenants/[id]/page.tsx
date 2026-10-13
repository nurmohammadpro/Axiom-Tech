import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, plans, tenantEvents, tenants } from "@/db/schema";
import { formatInvoiceNumber, rootDomain, taka } from "@/lib/domain";
import { daysUntil, fmtDate, fmtDateTime, methodLabel } from "@/lib/format";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";
import {
  activateAction,
  cancelAction,
  changePlanAction,
  extendTrialAction,
  monthlyPaymentAction,
  resumeAction,
  suspendAction,
} from "../../actions";
import { Badge, Field, Notice, td, th } from "../../../ui";
import { OwnerResetPanel } from "./owner-reset-panel";
import { ProvisionPanel } from "./provision-panel";

const UUID = /^[0-9a-f-]{36}$/i;
const METHODS = [["banglaqr", "BanglaQR"], ["cash", "Cash (physical)"], ["bkash", "bKash"], ["nagad", "Nagad"], ["bank", "Bank"], ["other", "Other"]] as const;

function MethodFields({ amount }: { amount: number }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount (BDT)"><input name="amount" defaultValue={amount} inputMode="numeric" required className="input" /></Field>
        <Field label="Method">
          <select name="method" defaultValue="banglaqr" className="input">
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Transaction ID"><input name="reference" placeholder="Required unless cash" className="input" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proof link (optional)"><input name="proofUrl" type="url" className="input" /></Field>
        <Field label="Note (optional)"><input name="note" className="input" /></Field>
      </div>
    </>
  );
}

export default async function TenantDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!UUID.test(id)) notFound();

  const [t] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!t) notFound();
  const [allPlans, invs, pays, events] = await Promise.all([
    db.select().from(plans).orderBy(asc(plans.sortOrder)),
    db.select().from(invoices).where(eq(invoices.tenantId, id)).orderBy(desc(invoices.createdAt)),
    db.select().from(payments).where(eq(payments.tenantId, id)).orderBy(desc(payments.receivedAt)),
    db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, id)).orderBy(desc(tenantEvents.createdAt)).limit(50),
  ]);
  const plan = allPlans.find((p) => p.id === t.planId)!;
  const live = t.status !== "cancelled";
  const canPay = can(user.role, "tenant:payment");

  const activate = activateAction.bind(null, id);
  const monthly = monthlyPaymentAction.bind(null, id);
  const extend = extendTrialAction.bind(null, id);
  const suspend = suspendAction.bind(null, id);
  const resume = resumeAction.bind(null, id);
  const change = changePlanAction.bind(null, id);
  const cancel = cancelAction.bind(null, id);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/tenants" className="text-sm underline" style={{ color: "var(--muted-foreground)" }}>All shops</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">{t.name}</h1>
          <Badge value={t.status} />
        </div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{t.slug}.{rootDomain()}</p>
      </div>
      <Notice ok={ok} error={error} />

      <section className="card grid gap-4 p-5 sm:grid-cols-3">
        <div><div className="label">Plan</div><div className="text-sm font-semibold">{plan.name} · {taka(plan.monthlyPrice)}/mo</div></div>
        <div><div className="label">Owner</div><div className="text-sm">{t.ownerName}<br />{t.ownerEmail}{t.ownerPhone ? <><br />{t.ownerPhone}</> : null}</div></div>
        <div><div className="label">Setup</div><div className="text-sm"><Badge value={t.provisionStatus} />{t.provisionError ? <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{t.provisionError}</p> : null}</div></div>
        {!t.activatedAt ? (
          <div><div className="label">Trial ends</div><div className="text-sm">{fmtDate(t.trialEndsAt)} ({daysUntil(t.trialEndsAt)} days)</div></div>
        ) : (
          <>
            <div><div className="label">Activated</div><div className="text-sm">{fmtDate(t.activatedAt)}</div></div>
            <div><div className="label">Paid until</div><div className="text-sm">{fmtDate(t.currentPeriodEnd)} ({daysUntil(t.currentPeriodEnd)} days)</div></div>
          </>
        )}
        {t.suspendedReason && t.status !== "active" && t.status !== "trial" ? <div><div className="label">Reason</div><div className="text-sm">{t.suspendedReason.replace("_", " ")}</div></div> : null}
      </section>

      {can(user.role, "tenant:provision") && live && (
        <ProvisionPanel tenantId={id} status={t.provisionStatus} />
      )}

      {can(user.role, "tenant:reset_owner") && live && t.provisionStatus === "ready" && <OwnerResetPanel tenantId={id} />}

      {canPay && live && !t.activatedAt && t.status !== "active" && (
        <form action={activate} className="card space-y-4 p-5">
          <h2 className="text-sm font-bold">Activate to production</h2>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Records the sign-up fee + first month and removes the trial. Minimum amount is the selected plan&apos;s fee plus one month.</p>
          <Field label="Plan">
            <select name="planId" defaultValue={t.planId} className="input">
              {allPlans.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}: {taka(p.signupFee + p.monthlyPrice)} due</option>)}
            </select>
          </Field>
          <MethodFields amount={plan.signupFee + plan.monthlyPrice} />
          <button className="btn btn-primary">Record payment and activate</button>
        </form>
      )}

      {canPay && live && t.activatedAt && (
        <form action={monthly} className="card space-y-4 p-5">
          <h2 className="text-sm font-bold">Record subscription payment</h2>
          <Field label="Months"><input name="months" defaultValue={1} inputMode="numeric" required className="input max-w-[8rem]" /></Field>
          <MethodFields amount={plan.monthlyPrice} />
          <button className="btn btn-primary">Record payment</button>
        </form>
      )}

      <section className="card grid gap-5 p-5 md:grid-cols-2">
        {can(user.role, "tenant:extend_trial") && live && !t.activatedAt && (
          <form action={extend} className="space-y-2">
            <h2 className="text-sm font-bold">Extend trial</h2>
            <div className="flex gap-2"><input name="days" defaultValue={3} inputMode="numeric" className="input max-w-[6rem]" /><button className="btn">Extend days</button></div>
          </form>
        )}
        {can(user.role, "tenant:suspend") && t.status === "suspended" && (
          <form action={resume} className="space-y-2"><h2 className="text-sm font-bold">Resume access</h2><button className="btn">Resume shop</button></form>
        )}
        {can(user.role, "tenant:suspend") && (t.status === "active" || t.status === "trial") && (
          <form action={suspend} className="space-y-2">
            <h2 className="text-sm font-bold">Suspend</h2>
            <div className="flex gap-2"><input name="reason" placeholder="Reason" className="input" /><button className="btn">Suspend</button></div>
          </form>
        )}
        {can(user.role, "tenant:change_plan") && live && (
          <form action={change} className="space-y-2">
            <h2 className="text-sm font-bold">Change plan</h2>
            <div className="flex gap-2">
              <select name="planId" defaultValue={t.planId} className="input">{allPlans.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              <button className="btn">Save</button>
            </div>
          </form>
        )}
        {can(user.role, "tenant:cancel") && live && (
          <form action={cancel} className="space-y-2">
            <h2 className="text-sm font-bold">Cancel shop</h2>
            <div className="flex gap-2"><input name="reason" placeholder="Reason" className="input" /><button className="btn btn-danger">Cancel shop</button></div>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 text-sm font-bold">Invoices</h2>
        <table className="mt-2 w-full">
          <thead><tr style={{ color: "var(--muted-foreground)" }}><th className={th}>No.</th><th className={th}>Description</th><th className={th}>Amount</th><th className={th}>Status</th><th className={th}>Paid</th></tr></thead>
          <tbody>
            {invs.map((i) => (
              <tr key={i.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className={td}>{formatInvoiceNumber(i.seq, i.createdAt)}</td><td className={td}>{i.description}</td><td className={td}>{taka(i.amount)}</td><td className={td}><Badge value={i.status} /></td><td className={td}>{fmtDate(i.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 text-sm font-bold">Payments</h2>
        <table className="mt-2 w-full">
          <thead><tr style={{ color: "var(--muted-foreground)" }}><th className={th}>Date</th><th className={th}>Kind</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}>Reference</th><th className={th}>Months</th></tr></thead>
          <tbody>
            {pays.length === 0 && <tr><td colSpan={6} className={td} style={{ color: "var(--muted-foreground)" }}>No payments yet</td></tr>}
            {pays.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className={td}>{fmtDate(p.receivedAt)}</td><td className={`${td} capitalize`}>{p.kind}</td><td className={td}>{taka(p.amount)}</td><td className={td}>{methodLabel(p.method)}</td><td className={td}>{p.reference ?? "-"}</td><td className={td}>{p.months || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-bold">History</h2>
        <ul className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id}><span style={{ color: "var(--muted-foreground)" }}>{fmtDateTime(e.createdAt)}</span> · <span className="font-medium">{e.type.replace(/_/g, " ")}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
