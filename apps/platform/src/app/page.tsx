import { redirect } from "next/navigation";

/**
 * The root domain IS the signup funnel: the signup page carries its own copy
 * (7-day trial, pricing on the plan selector, FAQ below the form). Anyone
 * landing on / goes straight to creating their shop.
 */
export default async function RootPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  redirect(plan ? `/signup?plan=${encodeURIComponent(plan)}` : "/signup");
}
