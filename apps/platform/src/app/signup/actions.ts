"use server";

import { headers } from "next/headers";
import { DomainError } from "@/lib/domain";
import { allow } from "@/lib/rate-limit";
import { selfSignup } from "@/lib/signup";

export interface SignupState {
  ok: boolean;
  error?: string;
  shopUrl?: string;
  provisioned?: boolean;
  values?: Record<string, string>;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  // Behind Traefik the LAST entry is the address the proxy saw; earlier ones are client-supplied.
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "local";
}

export async function signupAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const get = (k: string) => String(fd.get(k) ?? "");
  const values = { shopName: get("shopName"), slug: get("slug"), ownerName: get("ownerName"), email: get("email"), phone: get("phone"), planId: get("planId") };

  // Honeypot: real people never fill this hidden field.
  if (get("website")) return { ok: true, shopUrl: "", provisioned: true };

  if (!allow(`signup:${await clientIp()}`, 10, 60 * 60 * 1000)) {
    return { ok: false, error: "Too many attempts. Please try again in an hour.", values };
  }
  try {
    const r = await selfSignup({ ...values, password: get("password") });
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, values };
    console.error("signup failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Please try again.", values };
  }
}
