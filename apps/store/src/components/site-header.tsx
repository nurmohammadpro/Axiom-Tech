import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, ShoppingBag, User, Menu, X, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { useBrands, useSessionScope } from "@/lib/hooks";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { count } = useCart();
  const { data: brands = [] } = useBrands();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { data: me } = useSessionScope();

  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
  }, []);

  const isStaff =
    me?.role === "owner" ||
    me?.staffRole === "owner" ||
    me?.staffRole === "manager" ||
    me?.staffRole === "salesman";
  const accountHref = isStaff ? "/dashboard" : "/clientportal";

  const signOut = () => {
    localStorage.removeItem("userId");
    setUserId(null);
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1.5 text-xs text-muted-foreground">
          <span>Free delivery on orders over ৳50 · Same-day dispatch</span>
          <div className="hidden gap-4 md:flex">
            {userId ? (
              <>
                <Link href={accountHref} className="hover:text-foreground">
                  My Account
                </Link>
                <button onClick={signOut} className="hover:text-foreground">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/signin" className="hover:text-foreground">
                  Sign in
                </Link>
                <Link href="/signup" className="hover:text-foreground">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <button className="md:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/axiom-mark.svg" alt="Axiom Tech logo" className="h-7 w-7 object-contain" />
          Axiom Tech
        </Link>
        <nav className="hidden flex-1 gap-5 text-sm md:flex">
          <Link href="/store" className="hover:text-primary">
            Shop all
          </Link>
          <Link href="/store?brand=iPhone" className="hover:text-primary">
            iPhone
          </Link>
          <Link href="/store?brand=Samsung" className="hover:text-primary">
            Samsung
          </Link>
          <Link href="/store?brand=Google+Pixel" className="hover:text-primary">
            Pixel
          </Link>
          <Link href="/store?brand=MacBook" className="hover:text-primary">
            MacBook
          </Link>
          <Link href="/store?brand=Watch" className="hover:text-primary">
            Wearables
          </Link>
          <Link href="/store" className="text-sale hover:text-sale/80">
            Sale
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button
            aria-label="Search"
            className="hidden p-1.5 text-muted-foreground hover:text-foreground md:block"
          >
            <Search size={16} />
          </button>
          {userId ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-label="Account"
                className="p-1.5 text-muted-foreground hover:text-foreground"
              >
                <User size={16} />
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-44 border border-border bg-background shadow-sm">
                    <Link
                      href={accountHref}
                      onClick={() => setUserMenuOpen(false)}
                      className="block border-b border-border px-3 py-2 text-xs hover:bg-surface"
                    >
                      My profile
                    </Link>
                    <Link
                      href={isStaff ? "/dashboard/settings" : "/clientportal/settings"}
                      onClick={() => setUserMenuOpen(false)}
                      className="block border-b border-border px-3 py-2 text-xs hover:bg-surface"
                    >
                      Settings
                    </Link>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-surface"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/signin"
              aria-label="Account"
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <User size={16} />
            </Link>
          )}
          <Link
            href="/cart"
            aria-label="Cart"
            className="relative p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ShoppingBag size={16} />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
      {menuOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col px-4 py-2 text-sm">
            <Link
              href="/store"
              onClick={() => setMenuOpen(false)}
              className="border-b border-border py-2"
            >
              Shop all
            </Link>
            {brands.map((b) => (
              <Link
                key={b}
                href={`/store?brand=${encodeURIComponent(b)}`}
                onClick={() => setMenuOpen(false)}
                className="border-b border-border py-2"
              >
                {b}
              </Link>
            ))}
            {userId ? (
              <Link
                href={accountHref}
                onClick={() => setMenuOpen(false)}
                className="border-b border-border py-2"
              >
                My Account
              </Link>
            ) : (
              <Link
                href="/signin"
                onClick={() => setMenuOpen(false)}
                className="border-b border-border py-2"
              >
                Sign in
              </Link>
            )}
            {userId ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  signOut();
                }}
                className="border-b border-border py-2 text-left"
              >
                Sign out
              </button>
            ) : (
              <Link href="/signup" onClick={() => setMenuOpen(false)} className="py-2">
                Create account
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
