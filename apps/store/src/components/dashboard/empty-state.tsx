import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared empty state: icon + title + hint + optional action. Used wherever a
 * list or panel has nothing to show, so empty screens look intentional.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground">
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="max-w-sm text-xs text-muted-foreground">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
