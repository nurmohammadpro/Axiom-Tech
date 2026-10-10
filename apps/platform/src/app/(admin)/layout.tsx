import Link from "next/link";
import { requireUser } from "@/lib/session";
import { logoutAction } from "./actions";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/tenants", label: "Shops" },
  { href: "/plans", label: "Plans" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-52 md:shrink-0">
        <div className="mb-4 text-lg font-bold">Axiom Tech</div>
        <nav className="flex gap-2 md:flex-col">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 hidden text-xs md:block" style={{ color: "var(--muted)" }}>
          <div className="font-semibold" style={{ color: "var(--ink)" }}>{user.name}</div>
          <div>{user.role.replace("_", " ")}</div>
          <form action={logoutAction} className="mt-2">
            <button className="underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
