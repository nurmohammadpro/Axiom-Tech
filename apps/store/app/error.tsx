"use client";

export default function StoreError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/axiom-mark.svg" alt="" className="h-10 w-10 opacity-70" />
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          Try again
        </button>
        <a href="/dashboard" className="border border-border bg-background px-4 py-2 text-sm hover:bg-surface">
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
