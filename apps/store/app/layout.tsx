import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Providers } from "@/lib/providers";
import { Toaster } from "@/components/ui/sonner";
import "@/styles.css";

const APP_NAME = "Axiom Tech";
const DESCRIPTION = "Inventory, POS and sales management for tech shops.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || `https://${process.env.ROOT_DOMAIN || "axiom.appbrainer.tech"}`),
  title: APP_NAME,
  description: DESCRIPTION,
  openGraph: { title: APP_NAME, description: DESCRIPTION, type: "website", images: ["/axiom-mark.svg"] },
  twitter: { card: "summary", title: APP_NAME, description: DESCRIPTION, images: ["/axiom-mark.svg"] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" type="image/svg+xml" href="/axiom-mark.svg" />
        
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/*
          This app ships NO service worker. A previous app on this port registered one,
          and it can serve stale cached bundles that break hydration and API calls.
          Run this purge as early as possible (before hydration): unregister every
          service worker, wipe all caches, and reload once to escape its control.
        */}
        <Script
          id="sw-cleanup"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){if(!('serviceWorker' in navigator)){return}if(window.__swCleanupDone){return}window.__swCleanupDone=true;var hadController=!!navigator.serviceWorker.controller;if('caches' in window){caches.keys().then(function(keys){keys.forEach(function(k){caches.delete(k).catch(function(){})})}).catch(function(){})}navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()});if(hadController&&!sessionStorage.getItem('sw-cleaned')){sessionStorage.setItem('sw-cleaned','1');window.location.reload()}}).catch(function(){})})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
