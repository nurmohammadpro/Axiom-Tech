import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformUsers, type PlatformUser } from "@/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import { can, type Permission } from "./rbac";
import { DomainError } from "./domain";

export const getCurrentUser = cache(async (): Promise<PlatformUser | null> => {
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const [u] = await db.select().from(platformUsers).where(eq(platformUsers.id, userId));
  return u && u.isActive ? u : null;
});

export async function requireUser(): Promise<PlatformUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For server actions: returns the user or throws a DomainError the action reports back. */
export async function requirePermission(p: Permission): Promise<PlatformUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!can(u.role, p)) throw new DomainError("You do not have permission to do this");
  return u;
}
