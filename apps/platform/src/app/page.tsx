import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { PLAN_CATALOG } from "@/lib/plan-catalog";
import { taka } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Axiom Tech - Shop management for tech retailers",
  description:
    "POS, serialized inventory, barcodes, multi-warehouse and staff management for mobile, gadget and electronics shops. Start a 7-day free trial.",
  robots: { index: true, follow: true },
};

const FEATURES = [
  { title: "Scan-first POS", body: "Sell by barcode or IMEI in seconds. Receipts with your logo, printed or PDF." },
  { title: "Serialized stock", body: "Every phone tracked by IMEI/serial, from stock-in to sale, with warranty history." },
  { title: "Multi-warehouse", body: "Separate showrooms and storerooms, with stock transfers between them." },
  { title: "Suppliers & purchases", body: "Purchase orders, stock receiving and supplier dues in one place." },
  { title: "Staff & attendance", body: "Roles, seats, leave and payroll - on the Pro plan." },
  { title: "Works on any device", body: "Runs in the browser with barcode scanners and receipt printers." },
];

const FAQ = [
  { q: "How does the free trial work?", a: "Every shop starts with a 7-day free trial on the plan you pick. No payment is needed to try; a shop address like yourshop.axiom.appbrainer.tech is ready in minutes." },
  { q: "How do I pay?", a: "Scan the BanglaQR code on your invoice with any banking app, or pay cash/bKash/Nagad. The team verifies your transaction and activates you." },
  { q: "Is my shop data separate from other shops?", a: "Yes. Each shop gets its own dedicated database - your data is never mixed with anyone else's." },
  { q: "Can I change plans later?", a: "Yes, upgrade or downgrade any time. Limits like staff seats and warehouses adjust automatically." },
];

export default async function MarketingPage() {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
  const catalog = rows.length
    ? rows.map((p) => ({
        id: p.id,
        name: p.name,
        monthlyPrice: p.monthlyPrice,
        signupFee: p.signupFee,
        maxStaff: p.maxStaff,
        maxWarehouses: p.maxWarehouses,
        features: p.features,
        sortOrder: p.sortOrder,
      }))
    : PLAN_CATALOG.map((p) => ({ ...p }));

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <span className="text-lg font-bold">Axiom Tech</span>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="#pricing" className="underline">Pricing</Link>
          <Link href="/login" className="underline">Sign in</Link>
          <Link href="/signup" className="btn btn-primary">Start free trial</Link>
        </nav>
      </header>

      <section className="py-14 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Run your tech shop from one screen</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base" style={{ color: "var(--muted-foreground)" }}>
          Axiom Tech is the shop management system for mobile, gadget and electronics retailers:
          scan-first POS, serialized inventory with IMEI tracking, barcodes, purchases, staff and reports.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/signup" className="btn btn-primary">Start your 7-day free trial</Link>
          <Link href="/login" className="btn">Sign in to your shop</Link>
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>No card required. Your shop subdomain is ready in minutes.</p>
      </section>

      <section>
        <h2 className="mb-4 text-center text-xl font-bold">Everything a tech shop needs</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-4">
              <div className="text-sm font-bold">{f.title}</div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="pt-14">
        <h2 className="mb-1 text-center text-xl font-bold">Simple pricing in taka</h2>
        <p className="mb-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          One-time sign-up fee + a monthly subscription. All plans include a 7-day free trial.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {catalog.map((p) => (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{p.name}</div>
              <div className="mt-2 text-3xl font-bold">
                {taka(p.monthlyPrice)}<span className="text-sm font-normal" style={{ color: "var(--muted-foreground)" }}> /month</span>
              </div>
              <div className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                Sign-up fee {taka(p.signupFee)} one-time
              </div>
              <ul className="mt-4 space-y-1.5 text-sm">
                <li>{p.maxStaff == null ? "Unlimited staff seats" : `${p.maxStaff} staff seat${p.maxStaff > 1 ? "s" : ""}`}</li>
                <li>{p.maxWarehouses == null ? "Unlimited warehouses" : `${p.maxWarehouses} warehouse${p.maxWarehouses > 1 ? "s" : ""}`}</li>
                <li>{p.features.includes("suppliers") ? "Suppliers, purchases & returns" : "POS, inventory & reports"}</li>
                <li>{p.features.includes("hr") ? "HR, leave & payroll" : "Email support"}</li>
              </ul>
              <Link href={`/signup?plan=${p.id}`} className="btn btn-primary mt-5 text-center">Start free trial</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-14">
        <h2 className="mb-4 text-center text-xl font-bold">Frequently asked</h2>
        <div className="mx-auto max-w-2xl space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="card p-4">
              <summary className="cursor-pointer text-sm font-bold">{f.q}</summary>
              <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t pt-6 text-center text-xs" style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}>
        <div>Axiom Tech - shop management by AppBrainer</div>
        <div className="mt-1 flex items-center justify-center gap-4">
          <Link href="/signup" className="underline">Create a shop</Link>
          <Link href="/login" className="underline">Shop sign-in</Link>
        </div>
      </footer>
    </main>
  );
}
