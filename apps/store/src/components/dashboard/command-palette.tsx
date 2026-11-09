"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { Package, ShoppingCart, Users, Truck, FileText, Receipt } from "lucide-react";

const TYPE_META: Record<string, { icon: typeof Package; label: string; shortcut: string }> = {
  product: { icon: Package, label: "Products", shortcut: "P" },
  order: { icon: FileText, label: "Orders", shortcut: "O" },
  sale: { icon: Receipt, label: "POS Sales", shortcut: "S" },
  customer: { icon: Users, label: "Customers", shortcut: "C" },
  supplier: { icon: Truck, label: "Suppliers", shortcut: "U" },
  purchase_order: { icon: ShoppingCart, label: "Purchase Orders", shortcut: "PO" },
};

interface SearchResult {
  id: string;
  label: string;
  subtitle: string;
  type: string;
  href: string;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search orders, products, customers…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search…</CommandEmpty>
        ) : loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
        ) : results.length === 0 ? (
          <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
        ) : (
          Object.entries(grouped).map(([type, items]) => {
            const meta = TYPE_META[type] ?? { icon: Package, label: type, shortcut: "" };
            const Icon = meta.icon;
            return (
              <CommandGroup key={type} heading={meta.label}>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      onOpenChange(false);
                      router.push(item.href);
                    }}
                  >
                    <Icon size={14} className="mr-2 shrink-0 opacity-50" />
                    <span className="truncate">{item.label}</span>
                    {item.subtitle && (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    )}
                    <CommandShortcut>{meta.shortcut}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Hook to register Cmd+K and expose open state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return { open, setOpen };
}
