"use client";

import { useActionState } from "react";
import { resetOwnerAction, type OwnerResetState } from "../../actions";

const initial: OwnerResetState = { ok: false };

export function OwnerResetPanel({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(resetOwnerAction.bind(null, tenantId), initial);

  if (state.ok) {
    return (
      <section className="card space-y-3 p-5" role="status">
        <h2 className="text-sm font-bold">Owner password reset</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt style={{ color: "var(--muted)" }}>Owner email</dt><dd className="font-mono">{state.ownerEmail}</dd>
          <dt style={{ color: "var(--muted)" }}>New password</dt><dd className="font-mono">{state.tempPassword}</dd>
        </dl>
        <p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>
          Copy this now. It is not stored and cannot be shown again. Sessions that are already signed in stay valid until they expire.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="card space-y-3 p-5">
      <h2 className="text-sm font-bold">Reset owner password</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Creates a new temporary password for the shop owner. The current password stops working immediately.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" /> I confirm the reset</label>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Resetting..." : "Reset password"}</button>
    </form>
  );
}
