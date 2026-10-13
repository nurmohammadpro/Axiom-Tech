/**
 * Edge gate for the admin console: every page needs a valid signed session cookie.
 * Roles are enforced in server actions (src/lib/session.ts). Public: /login, /signup,
 * /api/health, and the secret-protected server-to-server routes /api/gate and /api/cron/*.
 */
import { NextRequest, NextResponse } from "next/server";

const COOKIE = "axiom_admin";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function valid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [, userId, exp, sig] = parts;
  const secret = process.env.PLATFORM_AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "axiom-platform-insecure-dev-secret");
  if (!secret) return false; // fail closed
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${userId}.${exp}`));
    if (b64url(new Uint8Array(mac)) !== sig) return false;
  } catch {
    return false;
  }
  return Number(exp) * 1000 >= Date.now();
}

export default async function proxy(req: NextRequest) {
  if (await valid(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|signup|api/health|api/gate|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
