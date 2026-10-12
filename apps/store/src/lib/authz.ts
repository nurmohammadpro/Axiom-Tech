import { db } from "@/db";
import { staff, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requestTenantId, sessionTokenFromHeaders, verifySessionToken } from "./auth";
import { canAccessFeature, type FeatureKey, type Role } from "./feature-permissions";

export type ScopeRole = "owner" | "manager" | "salesman" | "customer" | string | null;

export interface SessionScope {
  userId: string | null;
  role: ScopeRole;
  /** Warehouse the staff member is assigned to (owners have none). */
  storeLocation: string | null;
  isOwner: boolean;
  /** True for managers/salesmen — data must be filtered to storeLocation. */
  isScoped: boolean;
}

const UNSCOPED: SessionScope = {
  userId: null,
  role: null,
  storeLocation: null,
  isOwner: false,
  isScoped: false,
};

/**
 * Resolve the caller's user id from the signed session token (httpOnly cookie
 * or `x-session-token` header). A bare `x-user-id` header is never trusted.
 */
export function requestUserId(headers: Headers): string | null {
  return verifySessionToken(sessionTokenFromHeaders(headers), requestTenantId(headers));
}

/**
 * Resolve who is calling an API route from their signed session and whether
 * their data must be scoped to a single warehouse.
 */
export async function getScope(headers: Headers): Promise<SessionScope> {
  const userId = requestUserId(headers);
  if (!userId) return UNSCOPED;

  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ...UNSCOPED, userId };

  if (user.role === "owner") {
    return { userId, role: "owner", storeLocation: null, isOwner: true, isScoped: false };
  }

  const [record] = await db
    .select({ role: staff.role, storeLocation: staff.storeLocation, isActive: staff.isActive })
    .from(staff)
    .where(eq(staff.userId, user.id))
    .limit(1);

  if (record?.isActive && record.storeLocation) {
    return {
      userId,
      role: record.role ?? user.role,
      storeLocation: record.storeLocation,
      isOwner: false,
      isScoped: true,
    };
  }

  return { userId, role: user.role, storeLocation: null, isOwner: false, isScoped: false };
}

/**
 * 401/403 helpers. Each returns null when allowed; routes return the error as
 * `NextResponse.json({ error: e.error }, { status: e.status })`.
 */

/** Rejects callers with no valid session (401). */
export function requireAuth(scope: SessionScope): NextResponseError | null {
  if (!scope.userId) {
    return { status: 401, error: "Authentication required" };
  }
  return null;
}

/**
 * Rejects anonymous callers (401) and authenticated portal customers (403).
 * Staff accounts get users.role of manager/salesman at creation, so a session
 * whose users.role is still "customer" is a storefront customer, not staff.
 */
export function requireStaff(scope: SessionScope): NextResponseError | null {
  if (!scope.userId) {
    return { status: 401, error: "Authentication required" };
  }
  if (scope.role === "customer") {
    return { status: 403, error: "Staff access required" };
  }
  return null;
}

/** Rejects anonymous callers (401) and anyone but the owner (403). */
export function requireOwner(scope: SessionScope): NextResponseError | null {
  if (!scope.userId) {
    return { status: 401, error: "Authentication required" };
  }
  if (!scope.isOwner) {
    return { status: 403, error: "Only the store owner can manage this" };
  }
  return null;
}

/** Deny helper mirroring requireOwner for legacy callers. */
export function ownerOnly(scope: SessionScope): NextResponseError | null {
  return requireOwner(scope);
}

/**
 * Enforces the role feature toggles (feature_settings) server-side: 401 for
 * anonymous callers, 403 when the caller's role has the feature disabled.
 * Owners always pass.
 */
export async function requireFeature(
  scope: SessionScope,
  featureKey: FeatureKey,
): Promise<NextResponseError | null> {
  if (!scope.userId) {
    return { status: 401, error: "Authentication required" };
  }
  if (scope.isOwner) {
    return null;
  }
  const allowed = await canAccessFeature((scope.role as Role) ?? "customer", featureKey);
  if (!allowed) {
    return { status: 403, error: "You do not have access to this feature" };
  }
  return null;
}

export type NextResponseError = { status: number; error: string };
