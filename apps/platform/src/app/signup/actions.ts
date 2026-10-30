"use server";

import { DomainError } from "@/lib/domain";
import { allow } from "@/lib/rate-limit";
import { selfSignup } from "@/lib/signup";
import { clientIp } from "@/lib/client-ip";

export interface SignupState {
  ok: boolean;
  error?: string;
  shopUrl?: string;
  provisioned?: boolean;
  values?: Record<string, string>;
}

export async function signupAction(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const get = (k: string) => String(fd.get(k) ?? "");
  const values = { shopName: get("shopName"), slug: get("slug"), ownerName: get("ownerName"), email: get("email"), phone: get("phone"), planId: get("planId") };

  // Honeypot: real people never fill this hidden field. Pretend success (bots
  // cannot tell) but with provisioned=false so a human caught by browser
  // autofill sees the "contact us" message instead of a link to nowhere.
  if (get("website")) return { ok: true, shopUrl: "", provisioned: false };

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
