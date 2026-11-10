"use client";

/**
 * FilterChips — the app's default chip-style filter (matches the Overview
 * range selector): a bordered container with a filled chip for the active
 * value and muted chips for the rest.
 *
 * Items are the parameters; pass counts to show a small tally per chip.
 */

export interface FilterChipItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

export function FilterChips<K extends string = string>({
  items,
  active,
  onChange,
  className = "",
}: {
  items: readonly FilterChipItem<K>[];
  active: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      className={
        "flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-background/70 p-1 shadow-sm " +
        className
      }
    >
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
              (isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface hover:text-foreground")
            }
          >
            {item.label}
            {typeof item.count === "number" && (
              <span className={"ml-1.5 " + (isActive ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
