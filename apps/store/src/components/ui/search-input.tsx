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
    const input = (
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`flex-1 border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/80 ${className}`}
        {...props}
      />
    );

    if (label) {
      return (
        <div className="mb-4 border border-border rounded-lg p-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Search size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
            {description && (
              <span className="text-xs text-muted-foreground">— {description}</span>
            )}
          </div>
          {/* Wrap on narrow screens so fixed-width actions (scan box, location
              select) never force the whole POS column wider than the viewport. */}
          <div className="flex flex-wrap gap-2">
            {input}
            {actions}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-muted-foreground" />
        {input}
        {children}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
