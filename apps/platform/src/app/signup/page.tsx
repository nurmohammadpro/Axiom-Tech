import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { rootDomain } from "@/lib/domain";
import { SignupForm } from "./signup-form";
import { supportContact } from "@/lib/support";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start your free trial - Axiom Tech", robots: { index: true, follow: true } };

const FAQ: { q: string; a: string }[] = [
  {
    q: "How does the free trial work?",
    a: "Seven days, full system, no card. Your shop subdomain is ready in minutes and everything you enter stays yours.",
  },
  {
    q: "How do I pay after the trial?",
    a: "We send you an invoice with a BanglaQR — scan it with bKash, Nagad or any bank app and send us the transaction ID. No card, no online payment.",
  },
  {
    q: "Is my shop data separate from other shops?",
    a: "Yes. Every shop runs on its own database with its own credentials. Nobody else, including other shops, can reach your data.",
  },
  {
    q: "Can I change plans later?",
    a: "Anytime. Message us and we switch your plan the same day — you only pay the new plan's monthly price.",
  },
];

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const rows = await db
    .select({ id: plans.id, name: plans.name, monthlyPrice: plans.monthlyPrice, signupFee: plans.signupFee })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
  const defaultPlan = rows.some((p) => p.id === plan) ? plan : undefined;
  const contact = supportContact();
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <h1 className="mb-1 text-xl font-bold">Axiom Tech</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)" }}>
        Inventory, POS and sales management for tech shops. Start a 7-day free trial — no card, nothing charged now.
      </p>
      <SignupForm plans={rows} rootDomain={rootDomain()} defaultPlan={defaultPlan} support={contact} />

      <section className="mt-10">
        <h2 className="text-sm font-bold">Frequently asked</h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map((f) => (
            <div key={f.q}>
              <dt className="text-sm font-semibold">{f.q}</dt>
              <dd className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="mt-10 border-t pt-4 text-center text-xs" style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}>
        <div>Axiom Tech — shop management by AppBrainer</div>
        <div className="mt-1 flex items-center justify-center gap-4">
          <Link href="/login" className="underline">Already have a shop? Sign in</Link>
        </div>
        {contact && <div className="mt-1">Support: {contact}</div>}
      </footer>
    </main>
  );
}
