"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { signUp } from "@/lib/api";
import { Eye, EyeOff } from "lucide-react";

export default function SignUp() {
  const router = useRouter();
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const user = await signUp({
        firstName: firstNameRef.current!.value,
        lastName: lastNameRef.current!.value,
        email: emailRef.current!.value,
        password: passwordRef.current!.value,
      });
      localStorage.setItem("userId", user.id);
      if (user.sessionToken) localStorage.setItem("sessionToken", user.sessionToken);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="border-b border-border pb-3 text-2xl font-semibold tracking-tight">
        Create account
      </h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        {error && (
          <div className="border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">First name</span>
            <input
              ref={firstNameRef}
              required
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Last name</span>
            <input
              ref={lastNameRef}
              required
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Email</span>
          <input
            ref={emailRef}
            type="email"
            required
            className="w-full border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Password</span>
          <div className="relative">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              required
              className="w-full border border-border bg-background px-3 py-2 pr-9 text-sm focus:border-foreground focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        <Button type="submit" className="w-full justify-center">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/signin" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
