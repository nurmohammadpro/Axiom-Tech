"use client";

import { Fragment, useRef } from "react";
import { Plus, X } from "lucide-react";
import { luhnValid, normalizeImei } from "@/lib/imei";

export interface UnitRow {
  id: number;
  imei1: string;
  imei2: string;
  serial: string;
  batteryHealth: string;
}

let nextUnitId = 1;

export function createEmptyUnit(): UnitRow {
  return { id: nextUnitId++, imei1: "", imei2: "", serial: "", batteryHealth: "" };
}

export function unitRowsToReceive(rows: UnitRow[]) {
  return rows.map((u) => {
    const imei1 = normalizeImei(u.imei1);
    const imei2 = normalizeImei(u.imei2);
    const serial = u.serial.trim();
    const batteryHealth = parseInt(u.batteryHealth, 10);
    return {
      ...(imei1 ? { imei1 } : {}),
      ...(imei2 ? { imei2 } : {}),
      ...(serial ? { serialNumber: serial } : {}),
      ...(Number.isInteger(batteryHealth) ? { batteryHealth } : {}),
      barcode: imei1 || imei2 || serial,
    };
  });
}

export function unitsMissingIdentifier(rows: UnitRow[]): number[] {
  return rows
    .map((r, i) =>
      normalizeImei(r.imei1) || normalizeImei(r.imei2) || r.serial.trim() ? -1 : i + 1,
    )
    .filter((n) => n > 0);
}

export function invalidImeiUnits(rows: UnitRow[]): string[] {
  const bad: string[] = [];
  rows.forEach((r, i) => {
    for (const field of ["imei1", "imei2"] as const) {
      const v = normalizeImei(r[field]);
      if (v && (v.length !== 15 || !luhnValid(v))) bad.push(`unit ${i + 1} (${field})`);
    }
  });
  return bad;
}

export function parseBatchPaste(text: string): UnitRow[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t]/).map((s) => s.trim());
      return {
        id: nextUnitId++,
        imei1: parts[0] || "",
        imei2: parts[1] || "",
        serial: parts[2] || "",
        batteryHealth: parts[3] || "",
      };
    });
}

const inputCls =
  "w-full border border-border bg-background px-2 py-1 font-mono text-sm outline-none focus:border-foreground";

export function UnitGrid({ rows, onChange }: { rows: UnitRow[]; onChange: (rows: UnitRow[]) => void }) {
  const addRow = () => onChange([...rows, createEmptyUnit()]);
  const update = (id: number, field: "imei1" | "imei2" | "serial" | "batteryHealth", value: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id: number) => onChange(rows.filter((r) => r.id !== id));

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      onChange([
        ...rows,
        ...lines.map((l) => ({ id: nextUnitId++, imei1: l, imei2: "", serial: "", batteryHealth: "" })),
      ]);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,100px)_auto] gap-2">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">IMEI 1</label>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">IMEI 2</label>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Serial Number</label>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Battery %</label>
        <span />
        {rows.map((r) => (
          <Fragment key={r.id}>
            <input value={r.imei1} onChange={(e) => update(r.id, "imei1", e.target.value)} onPaste={handlePaste} placeholder="IMEI 1" className={inputCls} />
            <input value={r.imei2} onChange={(e) => update(r.id, "imei2", e.target.value)} placeholder="IMEI 2 (optional)" className={inputCls} />
            <input value={r.serial} onChange={(e) => update(r.id, "serial", e.target.value)} placeholder="Serial (optional)" className={inputCls} />
            <input type="number" min={0} max={100} value={r.batteryHealth} onChange={(e) => update(r.id, "batteryHealth", e.target.value)} placeholder="0-100" className={inputCls} />
            <button type="button" onClick={() => removeRow(r.id)} className="text-muted-foreground hover:text-sale" aria-label="Remove unit">
              <X size={13} />
            </button>
          </Fragment>
        ))}
      </div>
      <button type="button" onClick={addRow} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Plus size={12} /> Add unit
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        Each unit needs at least one identifier (IMEI 1, IMEI 2, or Serial Number). Paste multiple lines to batch-add. IMEIs must be valid 15-digit numbers.
      </p>
    </div>
  );
}

export function UnitGridReadonly({ rows }: { rows: UnitRow[] }) {
  if (rows.length === 0) return <span className="text-xs text-muted-foreground">No units</span>;
  return (
    <div className="max-h-40 overflow-y-auto text-xs font-mono">
      {rows.map((r) => (
        <div key={r.id} className="flex gap-3 border-b border-border py-0.5">
          {r.imei1 && <span>{r.imei1}</span>}
          {r.serial && <span className="text-muted-foreground">SN: {r.serial}</span>}
          {r.batteryHealth && <span className="text-muted-foreground">{r.batteryHealth}%</span>}
        </div>
      ))}
    </div>
  );
}
