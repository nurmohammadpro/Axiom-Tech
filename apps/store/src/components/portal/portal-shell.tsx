import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Package,
  Heart,
  MapPin,
  Settings,
  User,
  ChevronDown,
  LogOut,
  Menu,
  X,
  RotateCcw,
  HelpCircle,
} from "lucide-react";
import { useProfile } from "@/lib/hooks";

const navItems = [
  { to: "/clientportal", label: "Overview", icon: LayoutDashboard },
  { to: "/clientportal/orders", label: "Orders", icon: Package },
  { to: "/clientportal/returns", label: "Returns", icon: RotateCcw },
  { to: "/clientportal/wishlist", label: "Wishlist", icon: Heart },
  { to: "/clientportal/addresses", label: "Addresses", icon: MapPin },
  { to: "/clientportal/settings", label: "Settings", icon: Settings },
  { to: "/clientportal/guide", label: "Help & Guide", icon: HelpCircle },
];

export function PortalShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);
  const { data: profile } = useProfile(userId ?? undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = profile ? (profile.firstName?.[0] ?? "") + (profile.lastName?.[0] ?? "") : "??";
  const displayName = profile ? `${profile.firstName} ${profile.lastName}` : "User";

  const signOut = () => {
    localStorage.removeItem("userId");
    router.push("/signin");
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <aside
        className={`sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-border bg-background ${mobileNavOpen ? "fixed z-40 flex" : "hidden md:flex"}`}
      >
        <div className="flex h-12 items-center border-b border-border px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pslogo.png" alt="Play Store logo" className="h-6 w-6 object-contain" />
            Play Store
          </Link>
          <span className="ml-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Account
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-2 py-2">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
              My Account
            </div>
            <ul>
              {navItems.map((item) => {
                const active =
                  item.to === "/clientportal"
                    ? pathname === "/clientportal"
                    : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      href={item.to}
                      className={
                        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors border-l-2 " +
                        (active
                          ? "bg-surface text-foreground border-primary/80 font-medium"
                          : "text-muted-foreground border-transparent hover:bg-surface hover:text-foreground")
                      }
                    >
                      <Icon size={14} className={active ? "text-primary" : "shrink-0"} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
        {mobileNavOpen && (
          <button
            onClick={() => setMobileNavOpen(false)}
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center border border-border md:hidden"
          >
            <X size={16} />
          </button>
        )}
        {profile && (
          <div className="border-t border-border p-3">
            <Link
              href="/clientportal/settings"
              className="flex items-center gap-2 text-xs hover:bg-surface -mx-3 -mb-3 px-3 py-3"
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-[10px] font-medium">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{displayName}</div>
                <div className="truncate text-muted-foreground">
                  {(profile.loyaltyPoints ?? 0).toLocaleString()} pts
                </div>
              </div>
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-background px-6">
          <button
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="grid h-8 w-8 shrink-0 place-items-center border border-border md:hidden"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Play Store</span>
              <span>/</span>
              <span className="truncate">{title}</span>
            </div>
          </div>
          <Link
            href="/"
            className="hidden items-center gap-2 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground md:flex lg:flex"
          >
            <User size={12} />
            <span>Storefront</span>
          </Link>
          {profile && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 border border-border px-2 py-1 text-xs hover:bg-surface"
              >
                <div className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  {initials}
                </div>
                <span>{displayName}</span>
                <ChevronDown size={11} className="text-muted-foreground" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-48 border border-border bg-background py-1 text-sm shadow-sm">
                  <div className="border-b border-border px-3 py-2">
                    <div className="font-medium">{displayName}</div>
                    <div className="text-xs text-muted-foreground">{profile.email}</div>
                  </div>
                  <Link
                    href="/clientportal/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <User size={13} /> Profile
                  </Link>
                  <Link
                    href="/clientportal/addresses"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <MapPin size={13} /> Addresses
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
          )}
        </header>

        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-background/80 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <div className="border-b border-border bg-background px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
