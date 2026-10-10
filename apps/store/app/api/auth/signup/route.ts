export const dynamic = "force-dynamic";

import { db } from "@/db";
import { users } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, SESSION_TTL, createSessionToken, hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { email, password, firstName, lastName } = await request.json();

  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: hashPassword(password),
      firstName,
      lastName,
    })
    .returning({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    });

  const sessionToken = createSessionToken(user.id);
  const res = NextResponse.json({ ...user, sessionToken }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return res;
}
