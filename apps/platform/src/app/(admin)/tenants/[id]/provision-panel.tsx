"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { provisionAction, type ProvisionState } from "../../actions";

const initial: ProvisionState = { ok: false };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] hover:bg-surface"
      style={{ borderColor: "var(--line)", color: copied ? "var(--primary)" : "var(--muted-foreground)" }}
    >
      <Copy size={11} /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ProvisionPanel({ tenantId, status }: { tenantId: string; status: string }) {
  const [state, action, pending] = useActionState(provisionAction.bind(null, tenantId), initial);
  const [allCopied, setAllCopied] = useState(false);
  const retry = status === "failed";

  // Stays mounted across the refresh that follows a successful setup, so the one-time
  // credentials below are not lost when the shop flips to "ready".
  if (!state.ok && status === "ready") return null;

  if (state.ok) {
    const rows = [
      { label: "Address", value: state.shopUrl },
      { label: "Owner email", value: state.ownerEmail },
      { label: "Temporary password", value: state.tempPassword ?? "" },
    ];
    const copyAll = rows
      .filter((r) => r.value)
      .map((r) => `${r.label}: ${r.value}`)
      .join("\n");

    return (
      <section className="card space-y-3 p-5" role="status">
        <h2 className="text-sm font-bold">Shop is ready</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr_auto]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt style={{ color: "var(--muted-foreground)" }}>{r.label}</dt>
              <dd className="min-w-0 break-all font-mono">{r.value || "Owner account already existed; password unchanged"}</dd>
              <dd>{r.value ? <CopyButton value={r.value} label={r.label} /> : null}</dd>
            </div>
          ))}
        </dl>
        <div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copyAll);
                setAllCopied(true);
                setTimeout(() => setAllCopied(false), 1500);
              } catch {
                setAllCopied(false);
              }
            }}
            className="btn"
          >
            <Copy size={13} /> {allCopied ? "Copied everything" : "Copy all details"}
          </button>
        </div>
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
      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
        Creates the shop&apos;s own database, installs the store system and creates the owner account. Takes up to a minute.
      </p>
      {state.error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Setting up..." : retry ? "Retry setup" : "Set up shop"}</button>
    </form>
  );
}
