"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  listCancelAction,
  listResetOwnerPassword,
  listRestoreAction,
  listResumeAction,
  listSuspendAction,
} from "../actions";

export interface RowActionTenant {
  id: string;
  slug: string;
  status: string;
  activatedAt: boolean;
  provisioned: boolean;
}

/**
 * Kebab menu of quick per-shop actions on the shops list. Money actions
 * (Activate to production, recording payments) need forms, so they open the
 * shop page instead of running inline.
 */
export function RowActions({ t, perms }: { t: RowActionTenant; perms: { pay: boolean; suspend: boolean; cancel: boolean; reset: boolean } }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [oneTime, setOneTime] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const live = t.status !== "cancelled";

  const run = (fn: (id: string) => Promise<void>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(async () => {
      await fn(t.id);
      router.refresh();
    });
  };

  const items: { label: string; danger?: boolean; run: () => void }[] = [];

  items.push({ label: "View / manage", run: () => router.push(`/tenants/${t.id}`) });

  if (perms.pay && live && !t.activatedAt) {
    items.push({ label: "Activate to production…", run: () => router.push(`/tenants/${t.id}#activate`) });
  }
  if (perms.pay && live && t.activatedAt) {
    items.push({ label: "Record payment…", run: () => router.push(`/tenants/${t.id}#monthly`) });
  }

  if (perms.suspend && live && (t.status === "active" || t.status === "trial")) {
    items.push({
      label: "Suspend",
      run: () =>
        run(
          (id) => listSuspendAction(id).then(() => undefined),
          `Suspend ${t.slug}? All its users lose access until you resume it.`,
        ),
    });
  }
  if (perms.suspend && t.status === "suspended") {
    items.push({ label: "Resume", run: () => run((id) => listResumeAction(id).then(() => undefined)) });
  }

  if (perms.reset && live && t.provisioned) {
    items.push({
      label: "Reset owner password…",
      run: () =>
        startTransition(async () => {
          const r = await listResetOwnerPassword(t.id);
          if (r.ok) setOneTime(r.password);
          else window.alert(r.error);
        }),
    });
  }

  if (perms.pay && live && t.provisioned) {
    items.push({
      label: "Backup (JSON)",
      run: () => window.open(`/api/admin/tenants/${t.id}/backup`, "_blank"),
    });
  }

  if (perms.cancel && live) {
    items.push({
      label: "Delete / cancel",
      danger: true,
      run: () =>
        run(
          (id) => listCancelAction(id).then(() => undefined),
          `Cancel ${t.slug}? Its database is dropped and all users lose access. This is reversible via Restore.`,
        ),
    });
  }
  if (perms.cancel && t.status === "cancelled") {
    items.push({
      label: "Restore",
      run: () =>
        run(
          (id) => listRestoreAction(id).then(() => undefined),
          `Restore ${t.slug} to trial? You will need to run provisioning again.`,
        ),
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={`Actions for ${t.slug}`}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 hover:bg-surface"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 border bg-background py-1 shadow-md"
          style={{ borderColor: "var(--line)" }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-surface"
              style={item.danger ? { color: "var(--bad)" } : undefined}
            >
              {pending ? "…" : item.label}
            </button>
          ))}
        </div>
      )}
      {oneTime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOneTime(null)}>
          <div className="w-full max-w-sm border bg-background p-5" style={{ borderColor: "var(--line)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold">One-time password for {t.slug}</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              Shown once — copy it now and hand it to the owner securely.
            </p>
            <p className="mt-3 select-all border px-3 py-2 font-mono text-sm" style={{ borderColor: "var(--line)" }}>
              {oneTime}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn" onClick={() => void navigator.clipboard.writeText(oneTime)}>Copy</button>
              <button className="btn btn-primary" onClick={() => setOneTime(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
