"use client";

import * as React from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusNextField } from "@/lib/focus-navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface SearchOption {
  value: string;
  label: string;
  /** Extra searchable terms (e.g. phone, email) that are matched but not displayed. */
  keywords?: string[];
}

interface SearchSelectProps {
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** After picking an option, move focus to the next field (Enter-driven forms). */
  autoAdvance?: boolean;
  /** When set, shows an always-visible "add new" action below the list (e.g. quick-create). */
  onAddNew?: () => void;
  /** Label for the add-new action. */
  addNewLabel?: string;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  autoAdvance = false,
  onAddNew,
  addNewLabel = "Add new…",
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const advanceRef = React.useRef(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          onKeyDown={(e) => {
            // Enter/Space opens the dropdown from keyboard (Enter-driven forms).
            if (!open && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
            !selected && "text-muted-foreground",
          )}
        >
          <span>{selected ? selected.label : placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-40 p-0"
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
        <Command>
          <CommandInput
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt, idx) => (
                <CommandItem
                  key={`${opt.value}-${idx}`}
                  value={opt.label}
                  keywords={opt.keywords}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                    if (autoAdvance) advanceRef.current = true;
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {/* Sits outside <Command> so cmdk filtering never hides it while typing. */}
        {onAddNew && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddNew();
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            {addNewLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
