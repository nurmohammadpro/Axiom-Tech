import * as React from "react";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Always call hooks; the toggle only renders for password inputs.
    const [showPassword, setShowPassword] = React.useState(false);
    const isPassword = type === "password";

    const input = (
      <input
        type={isPassword && showPassword ? "text" : type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isPassword && "pr-10",
          className,
        )}
        ref={ref}
        {...props}
      />
    );

    if (!isPassword) return input;

    return (
      <div className="relative w-full">
        {input}
        <button
          type="button"
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((v) => !v)}
          className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
