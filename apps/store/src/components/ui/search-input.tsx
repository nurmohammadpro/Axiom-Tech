"use client";

import { forwardRef, type ReactNode } from "react";
import { Search } from "lucide-react";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder, label, description, actions, className = "", children, ...props }, ref) => {
    // One bordered field: icon + input + actions share a single 6px-radius
    // bar (GitHub/Vercel style). Nested buttons render ghost inside the bar.
    const input = (
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70 ${className}`}
        {...props}
      />
    );

    if (label) {
      return (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-2">
            <Search size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
            {description && (
              <span className="text-xs text-muted-foreground">— {description}</span>
            )}
          </div>
          {/* Wrap on narrow screens so fixed-width actions (scan box, location
              select) never force the whole bar wider than the viewport. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 focus-within:border-primary [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-foreground hover:[&_button]:bg-surface">
            <Search size={14} className="shrink-0 text-muted-foreground" />
            {input}
            {actions}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:border-primary [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-foreground hover:[&_button]:bg-surface">
        <Search size={14} className="shrink-0 text-muted-foreground" />
        {input}
        {children}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
