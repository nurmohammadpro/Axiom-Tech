import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pslogo.png" alt="" className="h-6 w-6 object-contain" />
            Play Store
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Authorized retailer for iPhone, Samsung, Pixel, MacBook and more. Same-day dispatch,
            official warranty.
          </p>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Shop
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            <li>
              <Link href="/store" className="hover:underline">
                All products
              </Link>
            </li>
            <li>
              <Link href="/store?brand=iPhone" className="hover:underline">
                iPhone
              </Link>
            </li>
            <li>
              <Link href="/store?brand=Samsung" className="hover:underline">
                Samsung
              </Link>
            </li>
            <li>
              <Link href="/store?brand=MacBook" className="hover:underline">
                MacBook
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Support
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            <li>Shipping & returns</li>
            <li>Warranty</li>
            <li>Contact us</li>
            <li>Track order</li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Store
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>123 Market Street</li>
            <li>Mon–Sat · 10am–8pm</li>
            <li>+1 (555) 010-2200</li>
            <li>hello@playstore.shop</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Play Store. All rights reserved.</span>
          <span>Prices in BDT (৳). Trademarks belong to their respective owners.</span>
        </div>
      </div>
    </footer>
  );
}
