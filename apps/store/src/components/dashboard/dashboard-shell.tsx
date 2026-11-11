import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { Sparkline } from "./sparkline";
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Boxes,
  Barcode,
  ScanLine,
  ShoppingBag,
  Banknote,
  Receipt,
  Users,
  Truck,
  FileText,
  Shield,
  UserCog,
  Settings,
  Search,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
  ChevronUp,
  ChevronsUpDown,
  ChevronDown as ChevronDownIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useSessionScope } from "@/lib/hooks";
import type { FeatureKey } from "@/lib/feature-permissions";
import { CommandPalette, useCommandPalette } from "./command-palette";
export { SortableTable } from "./sortable-table";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  featureKey?: FeatureKey;
};
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Sell",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/dashboard/pos", label: "POS", icon: ScanLine, featureKey: "pos" },
      { to: "/dashboard/orders", label: "Orders", icon: ShoppingBag, featureKey: "orders" },
      { to: "/dashboard/customers", label: "Customers", icon: Users, featureKey: "customers" },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/dashboard/catalog", label: "Products", icon: Package, featureKey: "products" },
      { to: "/dashboard/inventory", label: "Inventory", icon: Boxes, featureKey: "inventory" },
      { to: "/dashboard/stock", label: "Stock in", icon: PackagePlus, featureKey: "inventory" },
      { to: "/dashboard/barcodes", label: "Barcodes", icon: Barcode, featureKey: "barcodes" },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/dashboard/cash", label: "Cash drawer", icon: Banknote, featureKey: "cash" },
      { to: "/dashboard/expenses", label: "Expenses", icon: Receipt, featureKey: "expenses" },
      { to: "/dashboard/reports", label: "Reports", icon: FileText, featureKey: "reports" },
    ],
  },
  {
    title: "People",
    items: [
      { to: "/dashboard/staff", label: "Staff & HR", icon: UserCog, featureKey: "staff" },
      { to: "/dashboard/purchases", label: "Suppliers & Purchases", icon: Truck, featureKey: "purchases" },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/dashboard/settings", label: "Settings", icon: Settings, featureKey: "settings" },
      { to: "/dashboard/audit", label: "Audit Log", icon: Shield, featureKey: "audit" },
      { to: "/dashboard/guide", label: "Guide", icon: FileText, featureKey: "guide" },
    ],
  },
];

/** Derive the page title from the current path via the nav map. */
function titleForPath(pathname: string, nav: Group[]): string {
  let best = "";
  let bestLen = -1;
  for (const g of nav) {
    for (const item of g.items) {
      if ((pathname === item.to || pathname.startsWith(item.to + "/")) && item.to.length > bestLen) {
        best = item.label;
        bestLen = item.to.length;
      }
    }
  }
  return best || "Dashboard";
}

export function DashboardShell({
  subtitle,
  actions,
  children,
}: {
  /** Unused placeholder kept for call-site compatibility. */
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = titleForPath(pathname, groups);
  useEffect(() => {
    document.title = `${title} · Axiom Tech`;
  }, [title]);
  const { data: session } = useSessionScope();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Restore sidebar collapse preference
  useEffect(() => {
    if (localStorage.getItem("dashboardSidebarCollapsed") === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem("dashboardSidebarCollapsed", c ? "0" : "1");
      return !c;
    });

  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);

  const userRole = session?.staffRole || session?.role || "customer";
  const isOwner = userRole === "owner";

  useEffect(() => {
    const token = localStorage.getItem("sessionToken");
    if (!token) return;
    fetch("/api/auth/permissions", { headers: { "x-session-token": token } })
      .then((r) => r.json())
      .then((data) => {
        if (data.permissions) setPermissions(data.permissions);
      })
      .catch(() => {});
  }, []);

  const visibleGroups = useMemo(() => {
    if (isOwner) return groups;
    if (!permissions) return [];

    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => {
          if (!it.featureKey) return true;
          return permissions[it.featureKey] !== false;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [isOwner, permissions]);

  useEffect(() => {
    const token = localStorage.getItem("sessionToken");
    if (!token) return;
    fetch("/api/auth/me", { headers: { "x-session-token": token } })
      .then((r) => r.json())
      .then((u) => {
        if (u.firstName && u.lastName) setUser(u);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  const initials = user ? (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "") : "??";
  const displayName = user ? `${user.firstName} ${user.lastName}` : "Dashboard";
  const rail = collapsed && !mobileNavOpen;

  const signOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Still clear local state below even if the call fails.
    }
    localStorage.removeItem("userId");
    localStorage.removeItem("sessionToken");
    router.push("/");
  };

  return (
    <div className="surface-orbit flex min-h-screen">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* Mobile backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar — desktop: static sticky, mobile: fixed overlay */}
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
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold tracking-tight"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/axiom-mark.svg" alt="Axiom Tech logo" className="h-6 w-6 object-contain" />
                Axiom Tech
              </Link>
              <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Admin
              </span>
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
          {/* Mobile close */}
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto grid h-7 w-7 place-items-center text-muted-foreground hover:text-foreground md:hidden"
          >
            <X size={15} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleGroups.map((g) => (
            <div key={g.title} className="px-2 py-2">
              {!rail && (
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                  {g.title}
                </div>
              )}
              <ul>
                {g.items.map((it) => {
                  const active = pathname === it.to;
                  const Icon = it.icon;
                  return (
                    <li key={it.to}>
                      <Link
                        href={it.to}
                        onClick={() => setMobileNavOpen(false)}
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
        {user && (
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                title={rail ? displayName : undefined}
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
                      <div className="truncate font-medium">{displayName}</div>
                      <div className="truncate text-muted-foreground capitalize">
                        {user.role} · Active
                      </div>
                    </div>
                    <ChevronUp size={11} className="text-muted-foreground shrink-0" />
                  </>
                )}
              </button>
              {menuOpen && (
                <div className="rounded-md absolute left-0 bottom-full mb-2 w-48 z-50 border border-border bg-background py-1 text-sm shadow-sm">
                  <div className="border-b border-border px-3 py-2">
                    <div className="font-medium">{displayName}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <Link
                    href="/dashboard/staff"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <User size={13} /> Profile
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <Settings size={13} /> Settings
                  </Link>
                  <hr className="my-1 border-border" />
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <LogOut size={13} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl">
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
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-surface md:flex"
          >
            <Search size={12} />
            <span className="w-64 text-left">Search orders, products, customers…</span>
            <span className="rounded-sm border border-border px-1 text-[10px]">⌘K</span>
          </button>
          {/* User profile moved to sidebar bottom - navbar simplified */}
        </header>

        {/* The POS till is a full-height workspace — it renders without the page-title bar. */}
        {pathname.startsWith("/dashboard/pos") ? null : (
          <div className="border-b border-border/70 bg-background/70 px-5 py-7 backdrop-blur-xl sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"card-orbit " + className}>{children}</div>;
}

export function Stat({
  label,
  value,
  delta,
  hint,
  href,
  spark,
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
  href?: string;
  spark?: number[];
}) {
  const positive = delta?.startsWith("+");
  const inner = (
    <>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {delta && (
          <span className={"text-xs " + (positive ? "text-emerald-600" : "text-sale")}>
            {delta}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      {spark && spark.length > 1 && (
        <div className="mt-2 text-primary">
          <Sparkline data={spark} />
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface">
          {inner}
        </Card>
      </Link>
    );
  }

  return <Card className="p-4">{inner}</Card>;
}

export function Table({
  columns,
  rows,
  sortData,
  sortKeys,
  onSort,
}: {
  columns: ReactNode[];
  rows: ReactNode[][];
  sortData?: Record<string, any>[];
  sortKeys?: (string | null)[];
  onSort?: (key: string, dir: "asc" | "desc") => void;
}) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortData || !sortCol || !sortKeys) return rows;
    const colIdx = sortKeys.indexOf(sortCol);
    if (colIdx === -1) return rows;
    const indexed = rows.map((r, i) => ({ row: r, val: sortData[i]?.[sortCol] }));
    indexed.sort((a, b) => {
      const av = a.val,
        bv = b.val;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return sortDir === "asc" ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return indexed.map((x) => x.row);
  }, [rows, sortData, sortCol, sortDir, sortKeys]);

  const handleSort = (key: string) => {
    if (sortCol === key) {
      const next = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      onSort?.(key, next);
    } else {
      setSortCol(key);
      setSortDir("asc");
      onSort?.(key, "asc");
    }
  };

  const sortIcon = (key: string) => {
    if (sortCol !== key) return <ChevronsUpDown size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDownIcon size={12} />;
  };

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
            {columns.map((c, idx) => {
              const key = sortKeys?.[idx];
              return (
                <th
                  key={idx}
                  className={`px-3 py-2 font-medium ${key ? "cursor-pointer select-none hover:bg-muted/50" : ""}`}
                  onClick={() => key && handleSort(key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{c}</span>
                    {key && sortIcon(key)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0 hover:bg-surface">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "warn" | "danger" | "info";
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
