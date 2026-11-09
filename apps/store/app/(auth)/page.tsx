"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { signIn } from "@/lib/api";
import { Eye, EyeOff } from "lucide-react";

export default function SignIn() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="border border-border bg-background p-6">
      <h1 className="text-xl font-semibold tracking-tight">Sign in to your shop</h1>
      <form onSubmit={submit} className="mt-5 space-y-3">
        {error && (
          <div role="alert" className="border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
          <input
            ref={emailRef}
            type="email"
            required
            autoComplete="email"
            autoFocus
            className="w-full border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
          <div className="relative">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              className="w-full border border-border bg-background px-3 py-2.5 pr-9 text-sm focus:border-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full justify-center bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
