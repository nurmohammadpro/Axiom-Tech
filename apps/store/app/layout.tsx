import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Providers } from "@/lib/providers";
import { Toaster } from "@/components/ui/sonner";
import "@/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://playstore.appbrainer.tech"),
  title: "Play Store — iPhone, Samsung, Pixel, MacBook & accessories on sale",
  description:
    "Shop the latest iPhone, Samsung Galaxy, Google Pixel, MacBook, headphones, watches, VR and chargers. Sale prices, official warranty, same-day dispatch.",
  openGraph: {
    title: "Play Store — iPhone, Samsung, Pixel, MacBook & accessories on sale",
    description:
      "Shop the latest iPhone, Samsung Galaxy, Google Pixel, MacBook, headphones, watches, VR and chargers. Sale prices, official warranty, same-day dispatch.",
    type: "website",
    images: ["/pslogo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Play Store — iPhone, Samsung, Pixel, MacBook & accessories on sale",
    description:
      "Shop the latest iPhone, Samsung Galaxy, Google Pixel, MacBook, headphones, watches, VR and chargers. Sale prices, official warranty, same-day dispatch.",
    images: ["/pslogo.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="icon" type="image/png" href="/pslogo.png" />
        <link rel="apple-touch-icon" href="/pslogo.png" />
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
