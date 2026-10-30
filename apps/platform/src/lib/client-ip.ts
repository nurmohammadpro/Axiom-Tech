import { headers } from "next/headers";

/**
 * Best-effort client IP for rate limiting.
 *
 * Behind Traefik (our deploy), the LAST x-forwarded-for entry is the address
 * the proxy actually saw; anything before it is client-supplied and spoofable.
 * When no proxy headers exist (local/dev), all callers share the "local" key.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf;
  const parts = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? "local";
}
