import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <Link href="/" className="mb-8 flex flex-col items-center gap-3" aria-label="Axiom Tech home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/axiom-mark.svg" alt="" className="h-12 w-12" />
        <span className="text-lg font-semibold tracking-tight">Axiom Tech</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Sign in with the account your shop provided.
      </p>
    </div>
  );
}
