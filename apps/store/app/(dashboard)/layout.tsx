"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider } from "@/lib/cart";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { useState } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <DashboardShell title="Dashboard">{children}</DashboardShell>
      </CartProvider>
    </QueryClientProvider>
  );
}
