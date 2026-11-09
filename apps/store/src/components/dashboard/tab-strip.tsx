"use client";

import type { ReactNode } from "react";

export interface TabStripItem<K extends string = string> {
  key: K;
  label: ReactNode;
  icon?: React.ComponentType<{ size?: number }>;
}

/**
 * The app's default tab UI (matches the Expenses page): a horizontal strip
 * with an underline on the active tab. Container gets the bottom border;
 * each tab gets a 2px underline when active.
 */
export function TabStrip<K extends string = string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: readonly TabStripItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
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
