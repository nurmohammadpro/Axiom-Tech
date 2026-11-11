"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { signIn } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignIn() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const user = await signIn({
        email: emailRef.current!.value,
        password: passwordRef.current!.value,
      });
      localStorage.setItem("userId", user.id);
      if (user.sessionToken) localStorage.setItem("sessionToken", user.sessionToken);
      router.push(
        user.role === "owner" || user.role === "manager" || user.role === "salesman"
          ? "/dashboard"
          : "/clientportal",
      );
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
      setPending(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in to your shop</h1>
      <form onSubmit={submit} className="mt-5 space-y-3">
        {error && (
          <div
            role="alert"
            className="rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-subtle)] px-3 py-2 text-xs text-[var(--color-danger-foreground)]"
          >
            {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
          <Input ref={emailRef} type="email" required autoComplete="email" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
          <Input
            ref={passwordRef}
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
