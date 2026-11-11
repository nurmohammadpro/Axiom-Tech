"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, FileDown, Printer, RotateCcw, ScanLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { bdt } from "@/lib/utils";
import { generateReceiptPDF, printReceipt, type ReceiptData } from "@/lib/receipt";
import { buildReturnReceiptData } from "@/lib/return-receipt";

/**
 * Counter flow for in-store returns: search a sale by IMEI / serial / unit
 * barcode / receipt barcode / invoice / sale number, preview it, pay a custom
 * refund instantly, re-price the returned unit for resale, and finish with a
 * printable return receipt (device details + cash back + signature line).
 */

interface LookupUnit {
  id: string;
  status: string;
  currentPrice: number | null;
  acquisitionCost: number | null;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  conditionGrade: string | null;
  batteryHealth: number | null;
  locationId: string | null;
}

interface LookupLine {
  id: number;
  variantId: number | null;
  productId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  imei1: string | null;
  imei2: string | null;
  serial: string | null;
  warranty: { startsAt: string | null; expiresAt: string | null };
  unit: LookupUnit | null;
  returned: { id: string; status: string } | null;
}

interface LookupResult {
  found: boolean;
  reason?: string;
  source?: "sale" | "exchange";
  exchange?: {
    id: string;
    invoiceNumber: string | null;
    barcodeValue: string | null;
    locationId: string | null;
    unitId: string | null;
  };
  sale?: {
    id: string;
    saleNumber: string | null;
    invoiceNumber: string | null;
    barcodeValue: string | null;
    createdAt: string;
    channel: string;
    storeId: string | null;
    customerName: string | null;
    customerPhone: string | null;
    totals: { grandTotal: number; paid: number };
    payments: { method: string; amount: number }[];
  };
  lines?: LookupLine[];
}

const REASONS = [
  "wrong_item",
  "defective",
  "damaged",
  "no_longer_needed",
  "not_as_described",
  "ordered_by_mistake",
  "other",
];

const CONDITIONS = ["new", "opened", "used", "damaged", "defective"];

const FINAL_STATUSES = ["refunded", "completed"];

/** Minimal shape of an existing returns row the page hands in for editing. */
export interface EditableReturn {
  id: string;
  saleId: string | null;
  saleLineId: number | null;
  status: string | null;
  refundAmount: number | null;
  refundMethod: string | null;
  reason: string | null;
  condition: string | null;
  adminNotes: string | null;
}

/** Legacy rows store free-text methods ("Cash", "Mobile Banking", …). */
const normalizeMethod = (raw: string | null): string => {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("card")) return "card";
  if (m.includes("bkash") || m.includes("nagad") || m.includes("mobile")) return "mobile";
  return "cash";
};

export function InStoreReturnModal({
  onClose,
  onCreated,
  settings,
  existingReturn,
}: {
  onClose: () => void;
  onCreated: () => void;
  settings?: Record<string, any> | null;
  existingReturn?: EditableReturn | null;
}) {
  const isEdit = Boolean(existingReturn);
  // Legacy RMAs (pending/processing/…) are finished by this edit — restock +
  // instant refund run server-side; final returns only get field edits.
  const completing =
    isEdit && !FINAL_STATUSES.includes((existingReturn?.status ?? "").toLowerCase());

  const [phase, setPhase] = useState<"search" | "form" | "done">("search");
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [editLoading, setEditLoading] = useState(isEdit);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState("0");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [condition, setCondition] = useState("used");
  const [reason, setReason] = useState("other");
  const [adminNotes, setAdminNotes] = useState("");
  const [repricing, setRepricing] = useState({
    costCode: "",
    acquisitionCost: "",
    dCode: "",
    sellCode: "",
    currentPrice: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit) inputRef.current?.focus();
  }, [isEdit]);

  // Edit mode: preload the return's sale and jump straight to the form with
  // everything prefilled from the stored return row + the unit's live codes.
  useEffect(() => {
    const saleId = existingReturn?.saleId;
    if (!saleId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/returns/lookup?saleId=${encodeURIComponent(saleId)}`,
        );
        const data: LookupResult = await res.json();
        if (cancelled) return;
        if (!data.found) {
          setError(data.reason || "Could not load the sale for this return");
          setEditLoading(false);
          return;
        }
        setResult(data);
        const target = (data.lines ?? []).find((l) => l.id === existingReturn?.saleLineId);
        if (!target) {
          setError("The sold item for this return was not found on its sale");
          setEditLoading(false);
          return;
        }
        setSelectedLineId(target.id);
        setRefundAmount(
          String(existingReturn?.refundAmount ?? Math.max(0, Math.round(target.lineTotal))),
        );
        setRefundMethod(normalizeMethod(existingReturn?.refundMethod ?? null));
        setCondition(
          CONDITIONS.includes(existingReturn?.condition ?? "")
            ? (existingReturn?.condition as string)
            : "used",
        );
        setReason(
          REASONS.includes(existingReturn?.reason ?? "")
            ? (existingReturn?.reason as string)
            : "other",
        );
        setAdminNotes(existingReturn?.adminNotes ?? "");
        setRepricing({
          costCode: target.unit?.costCode ?? "",
          acquisitionCost:
            target.unit?.acquisitionCost != null ? String(target.unit.acquisitionCost) : "",
          dCode: target.unit?.dCode ?? "",
          sellCode: target.unit?.sellCode ?? "",
          currentPrice: target.unit?.currentPrice != null ? String(target.unit.currentPrice) : "",
        });
        setPhase("form");
      } catch {
        if (!cancelled) setError("Could not load this return's sale — close and try again");
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [existingReturn]);

  const sale = result?.found ? (result.sale ?? null) : null;
  const lines = result?.found ? (result.lines ?? []) : [];
  const isExchange = Boolean(result?.exchange);
  const eligibleLines = lines.filter((l) => !l.returned);
  const selectedLine = lines.find((l) => l.id === selectedLineId) ?? null;

  const runSearch = async () => {
    const q = term.trim();
    if (!q) {
      setError("Enter an IMEI, serial, receipt barcode, invoice or sale number");
      return;
    }
    setSearching(true);
    setError(null);
    setResult(null);
    setSelectedLineId(null);
    try {
      const res = await fetch(`/api/dashboard/returns/lookup?q=${encodeURIComponent(q)}`);
      const data: LookupResult = await res.json();
      setResult(data);
      if (data.found) {
        const eligible = (data.lines ?? []).filter((l) => !l.returned);
        if (eligible.length === 1) {
          selectLine(eligible[0]);
        } else if (eligible.length === 0) {
          setError("Every item on this sale already has a return.");
        }
      }
    } catch {
      setError("Sale lookup failed — try again");
    } finally {
      setSearching(false);
    }
  };

  function selectLine(line: LookupLine) {
    setSelectedLineId(line.id);
    setRefundAmount(String(Math.max(0, Math.round(line.lineTotal))));
    setRepricing({
      costCode: line.unit?.costCode ?? "",
      acquisitionCost: line.unit?.acquisitionCost != null ? String(line.unit.acquisitionCost) : "",
      dCode: line.unit?.dCode ?? "",
      sellCode: line.unit?.sellCode ?? "",
      currentPrice: line.unit?.currentPrice != null ? String(line.unit.currentPrice) : "",
    });
  }

  const submit = async () => {
    if (!sale || !selectedLine) return;
    const refund = Math.round(Number(refundAmount));
    if (!Number.isFinite(refund) || refund < 0) {
      setError("Refund amount must be a number ≥ 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const repricingBody = selectedLine.unit
        ? {
            costCode: repricing.costCode,
            acquisitionCost: repricing.acquisitionCost,
            dCode: repricing.dCode,
            sellCode: repricing.sellCode,
            currentPrice: repricing.currentPrice,
          }
        : undefined;
      const res = await fetch(
        isExchange ? "/api/dashboard/returns/exchange" : "/api/dashboard/returns/in-store",
        isEdit
          ? {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: existingReturn!.id,
                refundAmount: refund,
                refundMethod,
                reason,
                condition,
                adminNotes: adminNotes.trim(),
                ...(repricingBody ? { repricing: repricingBody } : {}),
              }),
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                isExchange
                  ? {
                      exchangeOrderId: result!.exchange!.id,
                      refundAmount: refund,
                      refundMethod,
                      reason,
                      condition,
                      adminNotes: adminNotes.trim() || undefined,
                      ...(repricingBody ? { repricing: repricingBody } : {}),
                    }
                  : {
                      saleId: sale.id,
                      saleLineId: selectedLine.id,
                      refundAmount: refund,
                      refundMethod,
                      reason,
                      condition,
                      adminNotes: adminNotes.trim() || undefined,
                      ...(repricingBody ? { repricing: repricingBody } : {}),
                    },
              ),
            },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to complete the return");
        return;
      }
      // A field edit on an already-final return just saves — no receipt.
      if (isEdit && !data.completed) {
        toast.success(`Return ${existingReturn!.id} updated`);
        onCreated();
        onClose();
        return;
      }
      const returnId: string = isEdit ? existingReturn!.id : data.id;
      setReceipt(
        buildReturnReceiptData({
          returnId,
          createdAt: new Date(),
          sale: {
            saleNumber: sale.saleNumber,
            invoiceNumber: sale.invoiceNumber,
            createdAt: sale.createdAt,
            customerName: sale.customerName,
            customerPhone: sale.customerPhone,
          },
          line: {
            productName: selectedLine.productName,
            variantName: selectedLine.variantName,
            quantity: selectedLine.quantity,
            unitPrice: selectedLine.unitPrice,
            lineTotal: selectedLine.lineTotal,
            imei1: selectedLine.imei1,
            imei2: selectedLine.imei2,
            serial: selectedLine.serial,
          },
          condition,
          reason: reason.replace(/_/g, " "),
          refundAmount: refund,
          refundMethod,
          settings,
        }),
      );
      setPhase("done");
      onCreated();
    } catch {
      setError(
        isEdit
          ? "Failed to update the return — try again"
          : "Failed to complete the return — try again",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const lineName = (line: LookupLine) =>
    [line.productName, line.variantName].filter(Boolean).join(" ") || line.sku || "Item";

  const warrantyLabel = (line: LookupLine) => {
    if (!line.warranty?.expiresAt) return null;
    const exp = new Date(line.warranty.expiresAt);
    const days = Math.ceil((exp.getTime() - Date.now()) / 86_400_000);
    return days > 0 ? `Warranty ${days}d left` : "Warranty expired";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-border bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface">
              <RotateCcw size={16} className="text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {isEdit ? `Edit Return ${existingReturn?.id}` : "New In-store Return"}
              </div>
              <div className="text-xs text-muted-foreground">
                {isEdit
                  ? completing
                    ? "Not finished yet — completing it refunds the customer and restocks the device instantly"
                    : "Update refund details or re-price the unit for resale"
                  : "Search the sale, refund instantly, re-price the unit for resale"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XCircle size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* ── Search ── */}
          {phase === "search" && editLoading && (
            <div className="py-8 text-center text-xs text-muted-foreground">Loading return…</div>
          )}

          {phase === "search" && !editLoading && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  IMEI, serial, unit barcode, receipt barcode, invoice or sale number
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanLine
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      ref={inputRef}
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runSearch();
                        }
                      }}
                      placeholder="e.g. 354550163375252 or SL-… "
                      className="w-full rounded border border-border bg-surface py-2 pl-9 pr-3 text-sm font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void runSearch()}
                    disabled={searching}
                    className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {searching ? "Searching…" : "Search"}
                  </button>
                </div>
              </div>

              {result && !result.found && (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {result.reason || "No sale found."}
                </div>
              )}

              {sale && (
                <div className="space-y-3">
                  {/* Sale preview */}
                  <div className="border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
                      <div className="text-xs">
                        <span className="font-medium">
                          {sale.customerName || "Walk-in Customer"}
                        </span>
                        {sale.customerPhone && (
                          <span className="ml-2 text-muted-foreground">{sale.customerPhone}</span>
                        )}
                        {isExchange && (
                          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                            Exchange
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sale.saleNumber || sale.invoiceNumber} ·{" "}
                        {new Date(sale.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {lines.map((line) => {
                        const disabled = Boolean(line.returned);
                        return (
                          <button
                            key={line.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectLine(line)}
                            className={
                              "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left " +
                              (disabled ? "cursor-not-allowed opacity-50" : "hover:bg-surface") +
                              (selectedLineId === line.id ? " bg-primary/5" : "")
                            }
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                  {lineName(line)}
                                </span>
                                {line.returned && (
                                  <span className="shrink-0 rounded bg-sale/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sale">
                                    Already returned
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {[
                                  line.imei1 && `IMEI ${line.imei1}`,
                                  line.imei2 && `IMEI ${line.imei2}`,
                                  line.serial && `S/N ${line.serial}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                Sold {new Date(sale.createdAt).toLocaleDateString()}
                                {line.unit?.conditionGrade ? ` · ${line.unit.conditionGrade}` : ""}
                                {warrantyLabel(line) ? ` · ${warrantyLabel(line)}` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-sm font-medium">{bdt(line.lineTotal)}</div>
                              <div className="text-xs text-muted-foreground">
                                Qty {line.quantity}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
                      Paid {bdt(sale.totals.paid)}
                      {sale.payments.length > 0 &&
                        ` · ${sale.payments.map((p) => p.method).join(", ")}`}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!selectedLineId}
                      onClick={() => setPhase("form")}
                      className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Continue with return →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Form ── */}
          {phase === "form" && sale && selectedLine && (
            <>
              <div className="rounded-lg flex items-center justify-between border border-border bg-surface px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{lineName(selectedLine)}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {selectedLine.imei1 || selectedLine.serial || "—"}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  Sold for {bdt(selectedLine.lineTotal)}
                  {!isEdit && (
                    <button
                      type="button"
                      onClick={() => setPhase("search")}
                      className="ml-2 text-primary hover:underline"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium">
                    Refund Amount (৳) — paid instantly
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Default: what the customer paid ({bdt(selectedLine.lineTotal)})
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Refund Method</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="mobile">Mobile (bKash/Nagad)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedLine.unit && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-xs font-medium">
                      Re-price this unit for resale
                    </label>
                    <span className="text-xs text-muted-foreground">Applies to this unit only</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    {(
                      [
                        ["costCode", "Cost Code"],
                        ["acquisitionCost", "Cost Price"],
                        ["dCode", "D-Code"],
                        ["sellCode", "Sell Code"],
                        ["currentPrice", "Sell Price"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-[11px] text-muted-foreground">
                          {label}
                        </label>
                        <input
                          value={repricing[key]}
                          onChange={(e) =>
                            setRepricing((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          inputMode={
                            key.includes("Cost") || key === "currentPrice" ? "decimal" : "text"
                          }
                          className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium">Notes (optional)</label>
                <input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal note"
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-md border border-sale/40 bg-sale/10 px-3 py-2 text-xs text-sale">
              {error}
            </div>
          )}

          {/* ── Actions ── */}
          {phase === "form" && (
            <div className="flex justify-end gap-2">
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setPhase("search")}
                  disabled={submitting}
                  className="rounded border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-surface"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Completing…"
                  : isEdit && !completing
                    ? "Save Changes"
                    : `Complete Return — Pay ${bdt(Math.round(Number(refundAmount) || 0))}`}
              </button>
            </div>
          )}

          {phase === "done" && receipt && (
            <div className="space-y-4 py-2 text-center">
              <CheckCircle size={36} className="mx-auto text-green-600" />
              <div>
                <div className="text-sm font-semibold">
                  Return {receipt.returnInfo?.returnId} completed
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {bdt(receipt.returnInfo?.refundAmount ?? 0)} paid to {receipt.customer.name} via{" "}
                  {receipt.returnInfo?.refundMethod}. The unit is back in stock and sellable.
                </div>
              </div>
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => printReceipt(receipt)}
                  className="flex items-center gap-1.5 rounded border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <Printer size={14} /> Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void generateReceiptPDF(receipt);
                    toast.success("PDF downloaded");
                  }}
                  className="flex items-center gap-1.5 rounded border border-border px-3 py-2 text-sm hover:bg-surface"
                >
                  <FileDown size={14} /> Download PDF
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
