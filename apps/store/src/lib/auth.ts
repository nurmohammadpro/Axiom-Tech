/**
 * Authentication primitives: password hashing and signed session tokens.
 *
 * - Passwords are hashed with scrypt (node:crypto, no external deps). Users
 *   created before this change stored their password in plaintext; verify()
 *   accepts the legacy format and reports it so the caller can transparently
 *   upgrade the row on the next successful login.
 * - Sessions are opaque signed tokens: `v1.<userId>.<expiry>.<hmac>`. The
 *   token is set as an httpOnly cookie at sign-in and can also be sent as an
 *   `x-session-token` header. The server never trusts a bare user id header.
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SECRET =
  process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "playstore-insecure-dev-secret";

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
  // Legacy plaintext row — compare directly and flag for upgrade.
  return { ok: password === stored, needsUpgrade: true };
}

// ── Session tokens ─────────────────────────────────────────────────────────

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Create a signed session token for a user id. */
export function createSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = `v1.${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a session token and return the user id, or null when invalid/expired. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, userId, exp, sig] = parts;
  const payload = `v1.${userId}.${exp}`;
  const expected = Buffer.from(sign(payload));
  let actual: Buffer;
  try {
    actual = Buffer.from(sig);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return userId;
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
