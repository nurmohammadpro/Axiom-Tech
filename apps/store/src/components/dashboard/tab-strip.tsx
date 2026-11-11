"use client";

import type { ReactNode } from "react";

export interface TabStripItem<K extends string = string> {
  key: K;
  label: ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * The app's default tab UI (matches the Expenses page): a horizontal strip
 * with an underline on the active tab. Container gets the bottom border;
 * each tab gets a 2px underline when active.
 *
 * variant="rail" renders the same tabs as a vertical sidebar rail (settings
 * pages): a 220px-wide column list with a 2px left border on the active tab.
 */
export function TabStrip<K extends string = string>({
  tabs,
  active,
  onChange,
  className = "",
  variant = "underline",
}: {
  tabs: readonly TabStripItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
  variant?: "underline" | "rail";
}) {
  if (variant === "rail") {
    return (
      <nav className={"flex flex-col gap-0.5 " + className}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={
                "flex items-center gap-2 whitespace-nowrap rounded-md border-l-2 px-3 py-2 text-sm text-left transition-colors " +
                (isActive
                  ? "border-foreground bg-surface font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-surface/60 hover:text-foreground")
              }
            >
              {Icon && <Icon size={14} className="shrink-0" />}
              {t.label}
            </button>
          );
        })}
      </nav>
    );
  }
  return (
    <div className={"flex gap-1 overflow-x-auto border-b border-border " + className}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors " +
              (isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {Icon && <Icon size={14} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
