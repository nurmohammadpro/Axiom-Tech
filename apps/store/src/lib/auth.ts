/**
 * Authentication primitives: password hashing and signed session tokens.
 *
 * - Passwords are hashed with scrypt (node:crypto, no external deps). Non-scrypt
 *   stored values are always rejected.
 * - Sessions are opaque signed tokens: `v1.<userId>.<expiry>.<hmac>`. The
 *   token is set as an httpOnly cookie at sign-in and can also be sent as an
 *   `x-session-token` header. The server never trusts a bare user id header.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SINGLE_TENANT_ID, TENANT_HEADER, tenancyMode } from "./tenancy/config";

/**
 * Session signing secret. Required in production (fail closed); a fixed dev
 * secret is allowed only outside production. Resolved lazily so `next build`
 * does not need runtime env.
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
  return "axiom-insecure-dev-secret";
}

export const SESSION_COOKIE = "ps_session";
/** Session lifetime in seconds (7 days). */
export const SESSION_TTL = 7 * 24 * 60 * 60;

// ── Passwords ──────────────────────────────────────────────────────────────

/** scrypt-hash a password as `scrypt$<salt>$<hash>` (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export interface PasswordCheck {
  ok: boolean;
  /** True when the stored hash is legacy plaintext and should be upgraded. */
  needsUpgrade: boolean;
}

export function verifyPassword(password: string, stored: string): PasswordCheck {
  if (stored.startsWith("scrypt$")) {
    const [, saltHex, hashHex] = stored.split("$");
    try {
      const expected = Buffer.from(hashHex, "hex");
      const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
      return { ok: timingSafeEqual(expected, actual), needsUpgrade: false };
    } catch {
      return { ok: false, needsUpgrade: false };
    }
  }
  // Anything that is not a scrypt hash is rejected (no plaintext rows exist in Axiom Tech).
  return { ok: false, needsUpgrade: false };
}

// ── Session tokens ─────────────────────────────────────────────────────────

/**
 * Each shop signs with its own key derived from AUTH_SECRET and the tenant id, so a session
 * issued by one shop never verifies on another (even for an identical user id).
 */
function signingKey(tenantId: string): Buffer {
  return createHmac("sha256", getSecret()).update(`axiom-session-v1:${tenantId}`).digest();
}

function sign(payload: string, tenantId: string): string {
  return createHmac("sha256", signingKey(tenantId)).update(payload).digest("base64url");
}

/** Create a signed session token for a user of the given shop. */
export function createSessionToken(userId: string, tenantId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `v1.${userId}.${exp}`;
  return `${payload}.${sign(payload, tenantId)}`;
}

/** Verify a session token for a shop and return the user id, or null when invalid/expired. */
export function verifySessionToken(token: string | undefined | null, tenantId: string | null | undefined): string | null {
  if (!token || !tenantId) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, userId, exp, sig] = parts;
  const payload = `v1.${userId}.${exp}`;
  const expected = Buffer.from(sign(payload, tenantId));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return userId;
}

/**
 * The shop a request belongs to. In multi mode this is set by proxy.ts after the gate passed
 * (client-supplied values are overwritten); in single mode it is a constant.
 */
export function requestTenantId(headers: Headers): string | null {
  if (tenancyMode() === "single") return SINGLE_TENANT_ID;
  return headers.get(TENANT_HEADER);
}

/** Extract a session token from request headers (cookie or x-session-token). */
export function sessionTokenFromHeaders(headers: Headers): string | null {
  const headerToken = headers.get("x-session-token");
  if (headerToken) return headerToken;
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}
