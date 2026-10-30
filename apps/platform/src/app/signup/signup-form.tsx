"use client";

import { useActionState } from "react";
import { signupAction, type SignupState } from "./actions";

export interface PlanOption {
  id: string;
  name: string;
  monthlyPrice: number;
  signupFee: number;
}

const initial: SignupState = { ok: false };

export function SignupForm({ plans, rootDomain, defaultPlan, support }: { plans: PlanOption[]; rootDomain: string; defaultPlan?: string; support?: string | null }) {
  const [state, action, pending] = useActionState(signupAction, initial);
  const v = state.values ?? {};

  if (state.ok) {
    return (
      <section className="card space-y-3 p-5" role="status">
        <h2 className="text-lg font-bold">{state.provisioned ? "Your shop is ready" : "We got your sign-up"}</h2>
        {state.provisioned ? (
          <>
            <p className="text-sm">Sign in at <a className="font-mono underline" href={state.shopUrl}>{state.shopUrl}</a> with the email and password you just chose.</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Your 7-day free trial has started.</p>
          </>
        ) : (
          <p className="text-sm">
            Your shop is registered, but setup did not finish. Contact us with your shop address and we will finish it for you.
            {support ? <> Reach us at <strong>{support}</strong>.</> : null}
          </p>
        )}
      </section>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="shopName">Shop name</label>
        <input id="shopName" name="shopName" required maxLength={80} defaultValue={v.shopName} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="slug">Shop address</label>
        <div className="flex items-center gap-1">
          <input id="slug" name="slug" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" defaultValue={v.slug} className="input" autoCapitalize="none" />
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>.{rootDomain}</span>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ownerName">Your name</label>
        <input id="ownerName" name="ownerName" required maxLength={80} defaultValue={v.ownerName} className="input" autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required defaultValue={v.email} className="input" autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" name="phone" type="tel" required defaultValue={v.phone} className="input" autoComplete="tel" placeholder="01712345678" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password (10+ characters)</label>
        <input id="password" name="password" type="password" required minLength={10} maxLength={128} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="planId">Plan</label>
        <select id="planId" name="planId" required defaultValue={v.planId || defaultPlan || plans[0]?.id} className="input">
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} - ৳{p.monthlyPrice.toLocaleString("en-US")}/month (+ ৳{p.signupFee.toLocaleString("en-US")} one-time sign-up fee)</option>
          ))}
        </select>
        <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Free for 7 days. Nothing is charged now; you pay only to continue after the trial.</p>
      </div>
      {/* Honeypot */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Setting up your shop... this can take up to a minute" : "Start free trial"}</button>
    </form>
  );
}
