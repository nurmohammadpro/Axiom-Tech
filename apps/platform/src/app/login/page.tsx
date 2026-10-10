import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformUsers } from "@/db/schema";
import { SESSION_COOKIE, SESSION_TTL, createSessionToken, verifyPassword } from "@/lib/auth";
import { allow, clear } from "@/lib/rate-limit";

// Verified against a real hash so unknown emails cost the same time as wrong passwords.
const DUMMY = "scrypt$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `${ip}:${email}`;
  if (!allow(key)) redirect("/login?error=Too+many+attempts.+Try+again+in+15+minutes");

  const [user] = await db.select().from(platformUsers).where(eq(platformUsers.email, email));
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY) && !!user && user.isActive;
  if (!ok) redirect(`/login?error=Invalid+email+or+password&next=${encodeURIComponent(next)}`);

  clear(key);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
  redirect(next);
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-xl font-bold">Axiom Tech</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Platform admin sign-in</p>
      <form action={login} className="card space-y-4 p-5">
        <input type="hidden" name="next" value={next ?? "/"} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        {error && <p role="alert" className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
        <button className="btn btn-primary w-full" type="submit">Sign in</button>
      </form>
    </main>
  );
}
