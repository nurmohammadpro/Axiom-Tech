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
        <div className="mb-4 p-4 border border-border rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{label}</span>
            {description && (
              <span className="text-xs text-muted-foreground">— {description}</span>
            )}
          </div>
          <div className="flex gap-2">
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
