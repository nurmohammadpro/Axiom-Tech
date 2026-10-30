import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        The page you are looking for does not exist.
      </p>
      <Link className="btn" href="/admin">Go to dashboard</Link>
    </div>
  );
}
