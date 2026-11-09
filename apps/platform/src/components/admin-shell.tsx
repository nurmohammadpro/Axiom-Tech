"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Store,
  ReceiptText,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronUp,
  LogOut,
} from "lucide-react";
import { logoutAction } from "@/app/(admin)/actions";

type Item = { to: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

const NAV: { title: string; items: Item[] }[] = [
  {
    title: "Platform",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/tenants", label: "Shops", icon: Store },
      { to: "/invoices", label: "Invoices", icon: ReceiptText },
      { to: "/plans", label: "Plans", icon: CreditCard },
    ],
  },
];

/** Section title for the breadcrumb + page-header band. */
function sectionTitle(pathname: string): string {
  if (pathname === "/admin") return "Dashboard";
  if (pathname === "/tenants" || pathname.startsWith("/tenants/")) return "Shops";
  if (pathname === "/invoices" || pathname.startsWith("/invoices/")) return "Invoices";
  if (pathname === "/plans") return "Plans";
  return "Admin";
}

export function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem("adminSidebarCollapsed") === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("adminSidebarCollapsed", c ? "0" : "1");
      return !c;
    });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  const title = sectionTitle(pathname);
  const rail = collapsed && !mobileNavOpen;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-surface">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={
          mobileNavOpen
            ? "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-background transition-transform duration-200 md:sticky md:top-0 md:h-dvh md:translate-x-0"
            : `hidden ${rail ? "md:w-16" : "md:w-60"} shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 md:sticky md:top-0 md:h-dvh md:flex`
        }
      >
        <div
          className={
            "flex h-12 items-center border-b border-border " +
            (rail ? "justify-center px-2" : "justify-between px-4")
          }
        >
          {!rail && (
            <div className="flex min-w-0 items-center">
              <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/axiom-mark.svg" alt="Axiom Tech logo" className="h-6 w-6 object-contain" />
                Axiom Tech
              </Link>
              <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">Admin</span>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden h-7 w-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-surface hover:text-foreground md:grid"
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
            title={rail ? "Expand sidebar" : "Collapse sidebar"}
          >
            {rail ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Close navigation"
          >
            <X size={15} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((g) => (
            <div key={g.title} className="px-2 py-2">
              {!rail && (
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                  {g.title}
                </div>
              )}
              <ul>
                {g.items.map((it) => {
                  const active = pathname === it.to || pathname.startsWith(it.to + "/");
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <Link
                        href={it.to}
                        aria-current={active ? "page" : undefined}
                        title={rail ? it.label : undefined}
                        className={
                          "flex items-center gap-2 rounded-sm py-1.5 text-sm transition-colors border-l-2 " +
                          (rail ? "justify-center" : "px-2") +
                          " " +
                          (active
                            ? "bg-surface text-foreground border-primary/80 font-medium"
                            : "text-muted-foreground border-transparent hover:bg-surface hover:text-foreground")
                        }
                      >
                        <Icon size={14} className={active ? "text-primary" : "shrink-0"} />
                        {!rail && <span className="truncate">{it.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title={rail ? user.name : undefined}
              className={
                "flex items-center gap-2 text-xs hover:bg-surface -mx-3 -mb-3 px-3 py-3 flex-1 rounded transition-colors " +
                (rail ? "justify-center" : "")
              }
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-medium">
                {initials || "??"}
              </div>
              {!rail && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate font-medium">{user.name}</div>
                    <div className="truncate text-muted-foreground capitalize">{user.role.replace("_", " ")}</div>
                  </div>
                  <ChevronUp size={11} className="text-muted-foreground shrink-0" />
                </>
              )}
            </button>
            {menuOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-48 z-50 border border-border bg-background py-1 text-sm shadow-sm">
                <div className="border-b border-border px-3 py-2">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <LogOut size={13} /> Sign out
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-background px-4">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="grid h-8 w-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Axiom Tech</span>
              <span>/</span>
              <span className="truncate">{title}</span>
            </div>
          </div>
        </header>

        <div className="border-b border-border bg-background px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </div>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
