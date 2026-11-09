export const dynamic = "force-dynamic";

import { db } from "@/db";
import { users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  createSessionToken,
  requestTenantId,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const tenantId = requestTenantId(request.headers);
  if (!tenantId) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  const { email, password } = await request.json();

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const check = verifyPassword(password, user.passwordHash);
  if (!check.ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Transparent upgrade: pre-hash rows stored the password in plaintext.
  if (check.needsUpgrade) {
    await db
      .update(users)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(users.id, user.id));
  }

  const sessionToken = createSessionToken(user.id, tenantId);
  const res = NextResponse.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    sessionToken,
  });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return res;
}
