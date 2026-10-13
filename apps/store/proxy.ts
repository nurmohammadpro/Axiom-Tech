/**
 * Request gate (Next.js proxy, Node runtime).
 *
 * 1. Multi-shop mode: the request host must belong to a shop the platform currently allows.
 *    Unknown host -> 404, suspended/expired/cancelled -> 402, platform down with nothing
 *    cached -> 503. On success the shop id is forwarded in `x-axiom-tenant`; any value the
 *    client sent for that header is discarded first.
 * 2. /api/dashboard, /api/admin and /dashboard additionally require a valid session for
 *    THAT shop (sessions are signed with a per-shop key).
 *
 * Authorization (owner-only, feature toggles, store scoping) stays in the route handlers
 * (src/lib/authz.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { SINGLE_TENANT_ID, TENANT_HEADER, VALID_AFTER_HEADER, tenancyMode } from "@/lib/tenancy/config";
import { GateUnavailableError, gateClient } from "@/lib/tenancy/gate-client";
import { featureForPath, fromShop, planAllows } from "@/lib/tenancy/entitlements";

const REASONS: Record<string, string> = {
  trial_expired: "This shop's free trial has ended.",
  payment_overdue: "This shop's subscription payment is overdue.",
  suspended: "This shop is currently suspended.",
  cancelled: "This shop has been closed.",
  not_ready: "This shop is still being set up.",
};

function blockedResponse(req: NextRequest, status: number, code: string, message: string) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message, code }, { status, headers: { "cache-control": "no-store" } });
  }
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status === 404 ? "Shop not found" : "Unavailable"}</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#111"><main style="max-width:28rem;padding:1.5rem;text-align:center"><h1 style="font-size:1.25rem">${status === 404 ? "Shop not found" : "Service unavailable"}</h1><p>${message}</p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const needsSession = (path: string) =>
  path.startsWith("/api/dashboard") || path.startsWith("/api/admin") || path.startsWith("/dashboard");

export default async function proxy(request: NextRequest) {
  const fwd = new Headers(request.headers);
  fwd.delete(TENANT_HEADER);
  fwd.delete(VALID_AFTER_HEADER);
  let tenantId = SINGLE_TENANT_ID;
  let validAfter = 0;

  if (tenancyMode() === "multi") {
    const host = request.headers.get("host");
    if (!host) return blockedResponse(request, 404, "unknown_shop", "No shop exists at this address.");
    try {
      const shop = await gateClient().resolve(host);
      if (shop.kind === "unknown") return blockedResponse(request, 404, "unknown_shop", "No shop exists at this address.");
      if (shop.kind === "blocked") {
        return blockedResponse(request, 402, shop.reason, REASONS[shop.reason] ?? "This shop is not available right now.");
      }
      tenantId = shop.tenantId;
      validAfter = shop.sessionsValidAfter;
      const feature = featureForPath(request.nextUrl.pathname);
      if (feature && !planAllows(fromShop(shop), feature)) {
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Your plan does not include this feature", code: "plan_feature", feature }, { status: 403 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = `?upgrade=${encodeURIComponent(feature)}`;
        return NextResponse.redirect(url);
      }
    } catch (e) {
      if (e instanceof GateUnavailableError) {
        return blockedResponse(request, 503, "gate_unavailable", "Please try again in a moment.");
      }
      throw e;
    }
    fwd.set(TENANT_HEADER, tenantId);
    fwd.set(VALID_AFTER_HEADER, String(validAfter));
  }

  if (needsSession(request.nextUrl.pathname)) {
    const token = request.headers.get("x-session-token") || request.cookies.get(SESSION_COOKIE)?.value;
    if (verifySessionToken(token, tenantId, validAfter) === null) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/signin";
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next({ request: { headers: fwd } });
}

export const config = {
  // Everything except static assets and the health probe.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|txt|woff2?)$).*)"],
};
