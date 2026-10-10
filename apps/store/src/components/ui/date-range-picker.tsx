"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  format,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  value: { from?: Date; to?: Date } | undefined;
  onChange: (value: { from?: Date; to?: Date } | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick date range",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);

  const displayValue = value?.from
    ? value.to
      ? `${format(value.from, "MMM d, yyyy")} - ${format(value.to, "MMM d, yyyy")}`
      : format(value.from, "MMM d, yyyy")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue}
          <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value?.from && value.to ? { from: value.from, to: value.to } : undefined}
          onSelect={(range) => onChange(range ? { from: range.from, to: range.to } : undefined)}
          numberOfMonths={2}
          disabled={(date) => date > new Date()}
          initialFocus
        />
        <div className="flex items-center gap-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(undefined)}
            className="flex-1"
          >
            Clear
          </Button>
          <Button size="sm" onClick={() => setOpen(false)} className="flex-1">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Quick date presets
export const datePresets = [
  {
    label: "Today",
    value: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    label: "Yesterday",
    value: () => {
      const yesterday = subDays(new Date(), 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    },
  },
  {
    label: "Last 7 days",
    value: () => ({ from: subDays(new Date(), 7), to: new Date() }),
  },
  {
    label: "Last 30 days",
    value: () => ({ from: subDays(new Date(), 30), to: new Date() }),
  },
  {
    label: "This month",
    value: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    label: "Last month",
    value: () => {
      const now = new Date();
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    },
  },
];
