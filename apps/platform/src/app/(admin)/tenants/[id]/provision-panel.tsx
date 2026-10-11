"use client";

import { useActionState } from "react";
import { provisionAction, type ProvisionState } from "../../actions";

const initial: ProvisionState = { ok: false };

export function ProvisionPanel({ tenantId, status }: { tenantId: string; status: string }) {
  const [state, action, pending] = useActionState(provisionAction.bind(null, tenantId), initial);
  const retry = status === "failed";

  // Stays mounted across the refresh that follows a successful setup, so the one-time
  // credentials below are not lost when the shop flips to "ready".
  if (!state.ok && status === "ready") return null;

  if (state.ok) {
    return (
      <section className="card space-y-3 p-5" role="status">
        <h2 className="text-sm font-bold">Shop is ready</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt style={{ color: "var(--muted)" }}>Address</dt><dd className="font-mono">{state.shopUrl}</dd>
          <dt style={{ color: "var(--muted)" }}>Owner email</dt><dd className="font-mono">{state.ownerEmail}</dd>
          <dt style={{ color: "var(--muted)" }}>Temporary password</dt>
          <dd className="font-mono">{state.tempPassword ?? "Owner account already existed; password unchanged"}</dd>
        </dl>
        {state.tempPassword && (
          <p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>
            Copy this now. It is not stored anywhere and cannot be shown again. Ask the owner to change it after signing in.
          </p>
        )}
      </section>
    );
  }

  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">{retry ? "Retry shop setup" : "Set up shop"}</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Creates the shop&apos;s own database, installs the store system and creates the owner account. Takes up to a minute.
      </p>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Setting up..." : retry ? "Retry setup" : "Set up shop"}</button>
    </form>
  );
}
