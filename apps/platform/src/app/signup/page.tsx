import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { rootDomain } from "@/lib/domain";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start your free trial - Axiom Tech", robots: { index: true, follow: true } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const rows = await db
    .select({ id: plans.id, name: plans.name, monthlyPrice: plans.monthlyPrice, signupFee: plans.signupFee })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
  const defaultPlan = rows.some((p) => p.id === plan) ? plan : undefined;
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <h1 className="mb-1 text-xl font-bold">Axiom Tech</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted-foreground)" }}>Inventory, POS and sales management for tech shops. Start a 7-day free trial.</p>
      <SignupForm plans={rows} rootDomain={rootDomain()} defaultPlan={defaultPlan} />
    </main>
  );
}
