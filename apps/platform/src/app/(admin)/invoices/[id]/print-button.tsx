"use client";

export function PrintButton({ label = "Print receipt" }: { label?: string }) {
  return (
    <button className="btn no-print" type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
