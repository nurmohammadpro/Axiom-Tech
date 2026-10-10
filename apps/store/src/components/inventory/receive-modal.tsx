"use client";

import { useState, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { bdt } from "@/lib/utils";
import { luhnValid, normalizeImei } from "@/lib/imei";
import {
  X,
  ClipboardPaste,
  Upload,
  Grid3X3,
  AlertCircle,
  Check,
  Trash2,
  ScanLine,
} from "lucide-react";
import { parseBarcode, type ParsedBarcode } from "@/lib/barcode-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface POLineItem {
  id: number;
  productId: string;
  variantId: number | null;
  productName: string;
  variantName: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  costPrice: number;
  sellPrice: number;
}

// Common spec labels for per-unit intake
const UNIT_SPEC_LABELS = ["RAM", "Storage", "Color"] as const;
type UnitSpecLabel = (typeof UNIT_SPEC_LABELS)[number];

interface UnitSpecs {
  RAM?: string;
  Storage?: string;
  Color?: string;
}

interface UnitEntry {
  id: number;
  imei1: string;
  imei2: string;
  serial: string;
  batteryHealth: string;
  conditionGrade: string;
  specs: UnitSpecs;
}

type ReceiveTab = "scan" | "inline" | "paste" | "csv";

// ---------------------------------------------------------------------------
// Receive Modal
// ---------------------------------------------------------------------------

let nextEntryId = 1;

export function ReceiveModal({
  poId,
  items,
  onClose,
  onReceived,
}: {
  poId: string;
  items: POLineItem[];
  onClose: () => void;
  onReceived: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<ReceiveTab>("inline");
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    items[0]?.variantId?.toString() ?? "",
  );
  const [units, setUnits] = useState<UnitEntry[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [lastParsed, setLastParsed] = useState<ParsedBarcode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Batch rate stamped on the units (and their FIFO batch). Defaults to the PO
  // line cost so receiving a purchase order needs no extra typing.
  const [batchUnitCost, setBatchUnitCost] = useState("");

  const selectedItem = items.find((i) => i.variantId?.toString() === selectedVariantId);
  const remainingQty = selectedItem ? selectedItem.qtyOrdered - selectedItem.qtyReceived : 0;

  useEffect(() => {
    setBatchUnitCost(selectedItem ? String(selectedItem.costPrice ?? "") : "");
  }, [selectedItem]);

  // Add unit to inline grid
  const addUnit = () => {
    setUnits((prev) => [
      ...prev,
      {
        id: nextEntryId++,
        imei1: "",
        imei2: "",
        serial: "",
        batteryHealth: "",
        conditionGrade: "",
        specs: { RAM: "", Storage: "", Color: "" },
      },
    ]);
  };

  // Remove unit
  const removeUnit = (id: number) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
  };

  // Update unit
  const updateUnit = (id: number, patch: Partial<UnitEntry>) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  // Parse pasted text (one IMEI per line or comma-separated)
  const parsePaste = useCallback(() => {
    const lines = pasteText
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const newUnits: UnitEntry[] = lines.map((line) => {
      const parts = line.split(/[\t|,;]+/).map((p) => p.trim());
      return {
        id: nextEntryId++,
        imei1: parts[0] ?? "",
        imei2: parts[1] ?? "",
        serial: parts[2] ?? "",
        batteryHealth: "",
        conditionGrade: "",
        specs: { RAM: "", Storage: "", Color: "" },
      };
    });

    setUnits((prev) => [...prev, ...newUnits]);
    setPasteText("");
    toast.success(`Parsed ${newUnits.length} units from paste`);
  }, [pasteText]);

  // Handle CSV file
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split("\n").filter((l) => l.trim());

      // Skip header if present
      const startIdx = lines[0]?.toLowerCase().includes("imei") ? 1 : 0;

      const newUnits: UnitEntry[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(/[,;\t]+/).map((p) => p.trim());
        if (parts.length >= 1 && parts[0]) {
          newUnits.push({
            id: nextEntryId++,
            imei1: parts[0] ?? "",
            imei2: parts[1] ?? "",
            serial: parts[2] ?? "",
            batteryHealth: parts[3] ?? "",
            conditionGrade: "",
            specs: { RAM: parts[4] ?? "", Storage: parts[5] ?? "", Color: parts[6] ?? "" },
          });
        }
      }

      setUnits((prev) => [...prev, ...newUnits]);
      toast.success(`Imported ${newUnits.length} units from CSV`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Handle quick scan - parse barcode and add unit
  const handleQuickScan = () => {
    const trimmed = scanInput.trim();
    if (!trimmed) return;

    const parsed = parseBarcode(trimmed);
    setLastParsed(parsed);

    // Add as new unit
    const newUnit: UnitEntry = {
      id: nextEntryId++,
      imei1: parsed.imei1 ?? "",
      imei2: parsed.imei2 ?? "",
      serial: parsed.serial ?? "",
      batteryHealth: "",
      conditionGrade: "",
      specs: { RAM: "", Storage: "", Color: "" },
    };

    setUnits((prev) => [...prev, newUnit]);
    setScanInput("");

    // Show toast with what was parsed
    if (parsed.imei1 && parsed.serial) {
      toast.success(`Added IMEI: ${parsed.imei1} + S/N: ${parsed.serial}`);
    } else if (parsed.imei1) {
      toast.success(`Added IMEI: ${parsed.imei1}`);
    } else if (parsed.serial) {
      toast.success(`Added S/N: ${parsed.serial}`);
    } else {
      toast.success("Added unit");
    }
  };

  // Validate units
  const validateUnits = (): string[] => {
    const errors: string[] = [];
    const imeis: string[] = [];

    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u.imei1 && !u.serial) {
        errors.push(`Unit ${i + 1}: needs IMEI or serial number`);
        continue;
      }
      if (u.imei1) {
        const normalized = normalizeImei(u.imei1);
        if (normalized.length !== 15 || !luhnValid(normalized)) {
          errors.push(`Unit ${i + 1}: IMEI ${u.imei1} is invalid`);
        }
        if (imeis.includes(normalized)) {
          errors.push(`Unit ${i + 1}: duplicate IMEI ${normalized}`);
        }
        imeis.push(normalized);
      }
    }

    return errors;
  };

  // Submit
  const handleReceive = async () => {
    if (!selectedVariantId || !selectedItem) {
      toast.error("Select a variant to receive");
      return;
    }

    if (units.length === 0) {
      toast.error("Add at least one unit");
      return;
    }

    const errors = validateUnits();
    if (errors.length > 0) {
      errors.forEach((e) => toast.error(e));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/stock/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              variantId: Number(selectedVariantId),
              units: units.map((u) => ({
                imei1: u.imei1 || undefined,
                imei2: u.imei2 || undefined,
                serialNumber: u.serial || undefined,
                batteryHealth: u.batteryHealth ? Number(u.batteryHealth) : undefined,
                conditionGrade: u.conditionGrade || undefined,
                specs: u.specs,
                acquisitionCost: batchUnitCost ? Number(batchUnitCost) : undefined,
              })),
            },
          ],
          purchaseOrderId: poId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to receive stock");
      }

      toast.success(`Received ${units.length} units`);
      void qc.invalidateQueries({ queryKey: ["dashboard", "procurement"] });
      onReceived();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to receive stock");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-background border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">Receive Stock</h3>
            <p className="text-sm text-muted-foreground">
              {selectedItem
                ? `${selectedItem.productName} — ${selectedItem.variantName} (${remainingQty} remaining)`
                : "Select a variant to receive"}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Variant selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Select Item</label>
            <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select item to receive" />
              </SelectTrigger>
              <SelectContent>
                {items
                  .filter((i) => i.variantId)
                  .map((i) => (
                    <SelectItem key={i.variantId} value={i.variantId!.toString()}>
                      {i.productName} — {i.variantName} ({i.qtyOrdered - i.qtyReceived} remaining)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Batch rate: stored on the batch and used for FIFO cost snapshotting */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Batch unit cost (৳)</label>
            <input
              type="number"
              value={batchUnitCost}
              onChange={(e) => setBatchUnitCost(e.target.value)}
              placeholder={selectedItem ? String(selectedItem.costPrice ?? "0") : "0"}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm text-right"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Rate this batch was bought at. Newer batches stay locked until older ones sell out.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(
              [
                { key: "scan", label: "Quick Scan", icon: ScanLine },
                { key: "inline", label: "Manual Entry", icon: Grid3X3 },
                { key: "paste", label: "Batch Paste", icon: ClipboardPaste },
                { key: "csv", label: "CSV Upload", icon: Upload },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors " +
                    (active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="min-h-[200px]">
            {/* Quick Scan */}
            {tab === "scan" && (
              <div className="space-y-4">
                <div className="bg-muted/50 p-3 rounded-lg text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Scan phone box barcode</p>
                  <p>
                    Works with ALL brands: Samsung, Apple, Oppo, Vivo, Xiaomi, Redmi, Poco, Infinix,
                    Tecno, Realme, OnePlus, etc.
                  </p>
                  <p className="mt-1">
                    Supports: Plain IMEI, IMEI + SN (tab/comma/pipe separated), JSON format
                  </p>
                  <p className="mt-1">
                    Example: <code className="bg-background px-1">353456789012345|ABC123</code>
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleQuickScan()}
                    placeholder="Scan or paste barcode here..."
                    autoFocus
                    className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm font-mono"
                  />
                  <Button onClick={handleQuickScan} disabled={!scanInput.trim()}>
                    <ScanLine size={14} /> Add
                  </Button>
                </div>

                {lastParsed && (
                  <div className="bg-muted/30 p-2 rounded text-xs">
                    <span className="text-muted-foreground">Last scan: </span>
                    {lastParsed.brand && (
                      <span className="font-medium text-foreground mr-2">{lastParsed.brand}</span>
                    )}
                    {lastParsed.imei1 && (
                      <span className="font-mono">IMEI: {lastParsed.imei1}</span>
                    )}
                    {lastParsed.imei2 && (
                      <span className="font-mono ml-2">IMEI2: {lastParsed.imei2}</span>
                    )}
                    {lastParsed.serial && (
                      <span className="font-mono ml-2">S/N: {lastParsed.serial}</span>
                    )}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">Parsed format support:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>
                      Plain IMEI: <code>353456789012345</code>
                    </li>
                    <li>
                      IMEI + SN: <code>353456789012345|ABC123</code> or{" "}
                      <code>353456789012345,ABC123</code>
                    </li>
                    <li>
                      JSON:{" "}
                      <code>
                        {"{"}"imei":"353456789012345","sn":"ABC123"{"}"}
                      </code>
                    </li>
                    <li>
                      Samsung: <code>S/N:ABC123 IMEI:353456789012345</code>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* Inline grid */}
            {tab === "inline" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {units.length} unit{units.length !== 1 ? "s" : ""} added
                  </span>
                  <Button size="sm" variant="ghost" onClick={addUnit}>
                    <X size={12} /> Add Row
                  </Button>
                </div>
                {units.length > 0 && (
                  <div className="space-y-1">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_80px_80px_80px_80px_32px] gap-2 text-xs text-muted-foreground">
                      <span>IMEI 1</span>
                      <span>IMEI 2</span>
                      <span>Serial</span>
                      <span>Battery %</span>
                      <span>Condition</span>
                      <span>RAM</span>
                      <span>Storage</span>
                      <span>Color</span>
                      <span></span>
                    </div>
                    {units.map((u) => (
                      <div key={u.id} className="grid grid-cols-[1fr_1fr_1fr_80px_80px_80px_80px_80px_32px] gap-2">
                        <input
                          type="text"
                          value={u.imei1}
                          onChange={(e) => updateUnit(u.id, { imei1: e.target.value })}
                          placeholder="IMEI 1"
                          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={u.imei2}
                          onChange={(e) => updateUnit(u.id, { imei2: e.target.value })}
                          placeholder="IMEI 2"
                          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                        />
                        <input
                          type="text"
                          value={u.serial}
                          onChange={(e) => updateUnit(u.id, { serial: e.target.value })}
                          placeholder="Serial"
                          className="rounded border border-border bg-background px-2 py-1 text-xs font-mono"
                        />
                        <input
                          type="number"
                          value={u.batteryHealth}
                          onChange={(e) => updateUnit(u.id, { batteryHealth: e.target.value })}
                          placeholder="%"
                          min={0}
                          max={100}
                          className="rounded border border-border bg-background px-2 py-1 text-xs text-right"
                        />
                        <Select
                          value={u.conditionGrade}
                          onValueChange={(v) => updateUnit(u.id, { conditionGrade: v })}
                        >
                          <SelectTrigger className="h-7 px-2 text-xs">
                            <SelectValue placeholder="Condition" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="New">New</SelectItem>
                            <SelectItem value="Aslike New (95-100)">Aslike New (95-100)</SelectItem>
                            <SelectItem value="Good (90-95)">Good (90-95)</SelectItem>
                            <SelectItem value="Average (85-90)">Average (85-90)</SelectItem>
                            <SelectItem value="Below Average (80-85)">Below Average (80-85)</SelectItem>
                            <SelectItem value="Bad (Issues)">Bad (Issues)</SelectItem>
                          </SelectContent>
                        </Select>
                        <input
                          type="text"
                          value={u.specs.RAM}
                          onChange={(e) => updateUnit(u.id, { specs: { ...u.specs, RAM: e.target.value } })}
                          placeholder="RAM"
                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={u.specs.Storage}
                          onChange={(e) => updateUnit(u.id, { specs: { ...u.specs, Storage: e.target.value } })}
                          placeholder="Storage"
                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                        <input
                          type="text"
                          value={u.specs.Color}
                          onChange={(e) => updateUnit(u.id, { specs: { ...u.specs, Color: e.target.value } })}
                          placeholder="Color"
                          className="rounded border border-border bg-background px-2 py-1 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeUnit(u.id)}
                          className="h-7 w-7 p-0"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {units.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Click &quot;Add Row&quot; to start entering IMEI/serial numbers
                  </div>
                )}
              </div>
            )}

            {/* Batch paste */}
            {tab === "paste" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Paste IMEIs one per line, or comma-separated. Format: IMEI1, IMEI2, Serial, Battery%, Condition, RAM, Storage, Color (all after Serial are optional).
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"353456789012345|353456789012346|ABC123|95|New|8GB|128GB|Black\n353456789012347|353456789012348|DEF456|88|Good (90-95)|6GB|64GB|Blue"}
                  rows={8}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono"
                />
                <Button size="sm" onClick={parsePaste} disabled={!pasteText.trim()}>
                  <ClipboardPaste size={14} /> Parse & Add
                </Button>
              </div>
            )}

            {/* CSV upload */}
            {tab === "csv" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Upload a CSV file with columns: imei1, imei2, serial, batteryHealth, conditionGrade, RAM, Storage, Color
                </p>
                <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-border rounded-lg">
                  <Upload size={24} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Drop CSV file or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    id="receive-csv"
                    onChange={handleCSV}
                  />
                  <label htmlFor="receive-csv" className="cursor-pointer">
                    <Button size="sm" variant="outline">
                      Choose File
                    </Button>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="text-sm text-muted-foreground">
            {units.length > 0 && (
              <>
                <Check size={14} className="inline mr-1" />
                {units.length} unit{units.length !== 1 ? "s" : ""} ready
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleReceive} disabled={submitting || units.length === 0}>
              {submitting
                ? "Receiving..."
                : `Receive ${units.length} Unit${units.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
