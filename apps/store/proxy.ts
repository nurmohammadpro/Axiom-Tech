/**
 * Edge authentication gate.
 *
 * Every /api/dashboard/* and /api/admin/* call and every
 * /dashboard/* page now requires a valid signed session token (`ps_session`
 * cookie or `x-session-token` header — same format as src/lib/auth.ts).
 * API routes answer 401 JSON; pages redirect to /signin.
 *
 * Authorization (owner-only, feature toggles, store scoping) still happens in
 * the route handlers via src/lib/authz.ts — this layer only guarantees that
 * the caller is authenticated.
 */

import { NextRequest, NextResponse } from "next/server";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "axiom-insecure-dev-secret";
}

const SESSION_COOKIE = "ps_session";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Web-Crypto port of verifySessionToken (edge runtime has no node:crypto). */
async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, userId, exp, sig] = parts;
  const payload = `v1.${userId}.${exp}`;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    if (base64url(new Uint8Array(mac)) !== sig) return null;
  } catch {
    return null;
  }
  if (Number(exp) * 1000 < Date.now()) return null;
  return userId;
}

export default async function proxy(request: NextRequest) {
  const headerToken = request.headers.get("x-session-token");
  const token = headerToken || request.cookies.get(SESSION_COOKIE)?.value;
  const authed = (await verifySessionToken(token)) !== null;
  if (authed) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/api/dashboard/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
  ],
};
