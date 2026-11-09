import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/lib/providers";
import { themeClass } from "@/lib/themes";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { SwRegister } from "@/components/sw-register";
import { Toaster } from "@/components/ui/sonner";
import "@/styles.css";

const APP_NAME = "Axiom Tech";
const DESCRIPTION = "Inventory, POS and sales management for tech shops.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || `https://${process.env.ROOT_DOMAIN || "axiom.appbrainer.tech"}`),
  title: { default: APP_NAME, template: "%s · Axiom Tech" },
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  applicationName: APP_NAME,
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  openGraph: { title: APP_NAME, description: DESCRIPTION, type: "website", images: ["/axiom-mark.svg"] },
  twitter: { card: "summary", title: APP_NAME, description: DESCRIPTION, images: ["/axiom-mark.svg"] },
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

/**
 * Per-shop theme: read once per request from this shop's own settings. Falls
 * back to the default (Axiom Teal) when unset, or when the shop database is
 * not reachable (e.g. the sign-in page of a shop that is still provisioning).
 */
async function shopThemeClass(): Promise<string> {
  try {
    const rows = await db.execute(
      sql`select value from store_settings where key = 'appearance_theme' limit 1`,
    );
    const v = (rows.rows?.[0] as { value?: unknown } | undefined)?.value;
    return themeClass(typeof v === "string" ? v : null);
  } catch {
    return "";
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const htmlClass = await shopThemeClass();
  return (
    <html lang="en" className={htmlClass}>
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" type="image/svg+xml" href="/axiom-mark.svg" />
        
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Hind+Siliguri:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

      </head>
      <body>
        <Providers>
          {children}
          <Toaster />
          <SwRegister />
        </Providers>
      </body>
    </html>
  );
}
