"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

const EVENT = "axiom:confirm";

/**
 * Promise-based confirm for imperative call sites, rendered with the shared
 * ConfirmDialog instead of the browser's window.confirm. Mounts once via
 * <Providers>; call `confirmDialog({ title, description })` anywhere.
 */
export function confirmDialog(options: {
  title: string;
  description: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmRequest>(EVENT, { detail: { ...options, resolve } }),
    );
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    const onConfirm = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmRequest>).detail;
      if (detail) setRequest(detail);
    };
    window.addEventListener(EVENT, onConfirm);
    return () => window.removeEventListener(EVENT, onConfirm);
  }, []);

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      title={request?.title ?? ""}
      description={request?.description ?? ""}
      confirmLabel={request?.confirmLabel ?? "Delete"}
      onConfirm={() => settle(true)}
    />
  );
}
