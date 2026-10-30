export const dynamic = "force-dynamic";

import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { formatInvoiceNumber, taka } from "@/lib/domain";
import { fmtDate, daysUntil } from "@/lib/format";
import { listInvoices, type InvoiceFilter } from "@/lib/invoices";
import { can } from "@/lib/rbac";
import { getCurrentUser } from "@/lib/session";
import { generateInvoicesAction } from "../actions";
import { Badge, Notice, td, th } from "../../ui";
import { SubmitButton } from "../submit-button";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "due", label: "Due" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

function isFilter(v: string | undefined): v is InvoiceFilter {
  return v === "due" || v === "paid" || v === "void" || v === "overdue";
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; shop?: string; ok?: string; error?: string }> }) {
  const { status, shop, ok, error } = await searchParams;
  const user = await getCurrentUser();
  const [rows, shops] = await Promise.all([
    listInvoices({ status: isFilter(status) ? status : undefined, tenantId: shop || undefined }),
    db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(asc(tenants.name)),
  ]);
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {user && can(user.role, "tenant:payment") && (
          <form action={generateInvoicesAction} className="no-print flex items-end gap-2">
            <div>
              <label className="label" htmlFor="cutoffDays">Generate for period ending within (days)</label>
              <input id="cutoffDays" name="cutoffDays" type="number" min={1} max={60} defaultValue={7} className="input w-28" />
            </div>
            <SubmitButton pendingLabel="Generating…">Generate monthly invoices</SubmitButton>
          </form>
        )}
      </div>
      <Notice ok={ok} error={error} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.key;
          const params = new URLSearchParams();
          if (f.key) params.set("status", f.key);
          if (shop) params.set("shop", shop);
          const qs = params.toString();
          return (
            <Link
              key={f.key || "all"}
              href={`/invoices${qs ? `?${qs}` : ""}`}
              className={`rounded-full px-3 py-1 text-sm font-medium ${active ? "text-white" : ""}`}
              style={active ? { background: "var(--brand)" } : { background: "var(--card)", border: "1px solid var(--line)" }}
            >
              {f.label}
            </Link>
          );
        })}
        <form className="ml-auto flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Shop</label>
          <select name="shop" defaultValue={shop ?? ""} className="input w-56">
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="btn" type="submit">Filter</button>
        </form>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--muted-foreground)" }}>
              <th className={th}>Invoice</th>
              <th className={th}>Shop</th>
              <th className={th}>Description</th>
              <th className={th}>Amount</th>
              <th className={th}>Due date</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className={td} style={{ color: "var(--muted-foreground)" }}>
                  No invoices{status ? " for this filter" : ""}. Use "Generate monthly invoices" for shops near their renewal date.
                </td>
              </tr>
            )}
            {rows.map(({ inv, shop: shopName, slug }) => {
              const overdue = inv.status === "due" && inv.dueDate && inv.dueDate < now;
              return (
                <tr key={inv.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={`${td} font-mono text-xs`}>{formatInvoiceNumber(inv.seq, inv.createdAt)}</td>
                  <td className={td}>
                    <Link className="underline" href={`/tenants/${inv.tenantId}`}>{shopName}</Link>
                    <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>.{slug}</span>
                  </td>
                  <td className={td}>{inv.description}</td>
                  <td className={td}>{taka(inv.amount)}</td>
                  <td className={td} style={overdue ? { color: "var(--bad)" } : undefined}>
                    {fmtDate(inv.dueDate)}
                    {overdue && inv.dueDate && ` (${Math.abs(daysUntil(inv.dueDate, now) ?? 0)}d late)`}
                  </td>
                  <td className={td}><Badge value={overdue ? "overdue" : inv.status} /></td>
                  <td className={td}><Link className="underline" href={`/invoices/${inv.id}`}>View</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
