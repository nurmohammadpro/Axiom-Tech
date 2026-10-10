"use client";

import { useRef } from "react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { focusNextField } from "@/lib/focus-navigation";

/**
 * shadcn Select that moves focus to the next field after a value is chosen,
 * so the whole form can be driven with Enter.
 */
export function AdvanceSelect({
  value,
  onValueChange,
  placeholder,
  triggerClassName,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const advanceRef = useRef(false);
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        advanceRef.current = true;
        onValueChange(v);
      }}
    >
      <SelectTrigger
        ref={triggerRef}
        className={triggerClassName}
        onKeyDown={(e) => {
          // Enter on a trigger that already has a value skips the dropdown and
          // advances (no change to make). Empty triggers open so a value can be picked.
          if (e.key === "Enter" && value && triggerRef.current) {
            e.preventDefault();
            focusNextField(triggerRef.current);
          }
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        onCloseAutoFocus={(e) => {
          // Radix restores focus to the trigger on close; when a value was just
          // picked, redirect that focus to the next field instead.
          if (advanceRef.current) {
            advanceRef.current = false;
            e.preventDefault();
            if (triggerRef.current) focusNextField(triggerRef.current);
          }
        }}
      >
        {children}
      </SelectContent>
    </Select>
  );
}
