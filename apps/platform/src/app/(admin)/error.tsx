"use client";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-lg font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm" style={{ color: "var(--muted-foreground)" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="flex gap-2">
        <button className="btn" onClick={reset}>Try again</button>
        <a className="btn" href="/admin">Go to dashboard</a>
      </div>
    </div>
  );
}
