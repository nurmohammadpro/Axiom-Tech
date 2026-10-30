"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the PWA service worker in production and surfaces a reload toast
 * when a new version is waiting. Dev stays SW-free so hot reload works.
 */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
        r.addEventListener("updatefound", () => {
          const sw = r.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              toast("A new version is available", {
                description: "Reload to get the latest Axiom Tech.",
                duration: Infinity,
                action: { label: "Reload", onClick: () => window.location.reload() },
              });
            }
          });
        });
      })
      .catch(() => {});

    void reg;
  }, []);

  return null;
}
