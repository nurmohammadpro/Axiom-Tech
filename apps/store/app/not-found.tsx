import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/axiom-mark.svg" alt="" className="h-10 w-10 opacity-70" />
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-surface"
      >
        Go to sign in
      </Link>
    </div>
  );
}
