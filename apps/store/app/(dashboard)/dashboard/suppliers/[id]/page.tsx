"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stat } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { bdt } from "@/lib/utils";
import {
  generatePDF,
  downloadCSV,
  bdtPDF,
  generateIdentityPDF,
  type StoreInfo,
} from "@/lib/pdf-utils";
import { useSettings } from "@/lib/hooks";
import { ArrowLeft, Phone, Mail, MapPin, Plus, Download, Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { SortableTable } from "@/components/dashboard/sortable-table";

interface Supplier {
  id: string;
  name: string;
  type: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  openingBalance: number | null;
  isActive: boolean;
  nidNumber: number | null;
  dob: string | null;
  nidImages: string[];
  totalPurchases: number;
  totalPaid: number;
  balance: number;
  createdAt: string;
}

interface Payment {
  id: string;
  supplierId: string;
  purchaseOrderId: string | null;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  bkash: "bKash",
  nagad: "Nagad",
};

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function printIdentity(supplier: Supplier, storeInfo: StoreInfo) {
  const div = document.createElement("div");
  div.id = "print-area";
  div.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:auto;z-index:9999;background:#fff;padding:0.5in;box-sizing:border-box;";

  const style = document.createElement("style");
  style.textContent = `
    @media print {
      body > *:not(#print-area) { display:none !important; }
      #print-area { display:block !important; }
      @page { margin:0.5in; }
      .id-sheet { font-family: Helvetica, Arial, sans-serif; color:#111; max-width:7in; }
      .id-sheet .store { font-size:17px; font-weight:700; margin:0; }
      .id-sheet .store-line { font-size:11px; color:#666; margin:1px 0 14px; }
      .id-sheet .sheet-title { font-size:15px; font-weight:700; margin:0; }
      .id-sheet .sheet-sub { font-size:11px; color:#666; margin:0 0 12px; }
      .id-sheet table { width:100%; border-collapse:collapse; font-size:12px; }
      .id-sheet td { padding:5px 8px; border:1px solid #ddd; vertical-align:top; }
      .id-sheet td.label { width:32%; background:#f6f6f6; color:#555; font-weight:600; }
      .id-sheet .imgs { display:flex; gap:12px; margin-top:16px; }
      .id-sheet .imgs .cap { font-size:10px; color:#666; text-align:center; margin-top:4px; }
      .id-sheet .imgs img { width:2.9in; height:auto; border:1px solid #ccc; }
      .id-sheet .none { border:1px dashed #bbb; color:#888; padding:24px; text-align:center; margin-top:16px; font-size:12px; }
      .id-sheet .generated { font-size:10px; color:#888; margin-top:20px; }
    }
  `;
  div.appendChild(style);

  const rows: [string, string][] = [
    ["Supplier Name", supplier.name],
    ["Supplier Type", supplier.type.charAt(0).toUpperCase() + supplier.type.slice(1)],
    ["NID Number", supplier.nidNumber ? String(supplier.nidNumber) : "—"],
    ["Date of Birth", supplier.dob ? new Date(supplier.dob).toLocaleDateString("en-BD") : "—"],
    ["Contact Person", supplier.contactPerson || "—"],
    ["Phone", supplier.phone || "—"],
    ["Email", supplier.email || "—"],
    ["Address", [supplier.address, supplier.city].filter(Boolean).join(", ") || "—"],
  ];

  const imgsHtml =
    supplier.nidImages.length > 0
      ? `<div class="imgs">${supplier.nidImages
          .map(
            (u, i) =>
              `<div><img src="${esc(u)}" alt="NID ${i === 0 ? "front" : "back"}"/><div class="cap">NID ${i === 0 ? "FRONT" : "BACK"}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="none">No NID image on file</div>`;

  const sheet = document.createElement("div");
  sheet.className = "id-sheet";
  sheet.innerHTML = `
    <h1 class="store">${esc(storeInfo.name || "Store")}</h1>
    <div class="store-line">${esc([storeInfo.address, storeInfo.phone, storeInfo.email].filter(Boolean).join("  |  "))}</div>
    <h2 class="sheet-title">Supplier Identity Record</h2>
    <div class="sheet-sub">For verification purposes</div>
    <table>
      ${rows.map(([l, v]) => `<tr><td class="label">${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}
    </table>
    ${imgsHtml}
    <div class="generated">Generated on ${esc(new Date().toLocaleDateString("en-BD"))}</div>
  `;
  div.appendChild(sheet);

  document.body.appendChild(div);
  window.print();
  document.body.removeChild(div);
}

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: supplier, isLoading } = useQuery<Supplier>({
    queryKey: ["dashboard", "suppliers", id],
    queryFn: () => fetch(`/api/dashboard/suppliers/${id}`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["dashboard", "suppliers", id, "payments"],
    queryFn: () => fetch(`/api/dashboard/suppliers/${id}/payments`).then((r) => r.json()),
    enabled: !!id,
  });

  const [showPayForm, setShowPayForm] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { data: settings } = useSettings();

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "Your Shop",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "",
      email: settings?.storeEmail || "",
    }),
    [settings],
  );

  async function handleIdentityPdf() {
    if (!supplier) return;
    setPdfLoading(true);
    try {
      const images = await Promise.all(
        supplier.nidImages.map(async (url) => ({ url: await toDataUrl(url) })),
      );
      await generateIdentityPDF({ storeInfo, supplier, images });
      toast.success("Identity PDF exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export identity PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!supplier) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Supplier not found.</div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/dashboard/purchases" className="hover:underline">
              Purchases
            </Link>
            <span>/</span>
            <span>Suppliers</span>
            <span>/</span>
            <span className="text-foreground">{supplier.name}</span>
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground">
            {supplier.type.charAt(0).toUpperCase() + supplier.type.slice(1)} supplier · Since{" "}
            {new Date(supplier.createdAt).toLocaleDateString("en-BD")}
          </p>
        </div>
        <div className="flex gap-2">
          {payments.length > 0 && (
            <>
              <button
                onClick={() => {
                  generatePDF({
                    title: `Supplier Ledger — ${supplier.name}`,
                    storeInfo,
                    details: {
                      left: {
                        title: "Supplier Info",
                        rows: [
                          { label: "Name", value: supplier.name },
                          { label: "Type", value: supplier.type },
                          { label: "Contact", value: supplier.contactPerson || "—" },
                          { label: "Phone", value: supplier.phone || "—" },
                        ],
                      },
                      right: {
                        title: "Account Summary",
                        rows: [
                          { label: "Balance", value: bdtPDF(supplier.balance) },
                          { label: "Total Purchases", value: bdtPDF(supplier.totalPurchases) },
                          { label: "Total Paid", value: bdtPDF(supplier.totalPaid) },
                          { label: "Opening Balance", value: bdtPDF(supplier.openingBalance || 0) },
                        ],
                      },
                    },
                    columns: [
                      { header: "Date", key: "date", width: 22 },
                      { header: "Method", key: "method", width: 22 },
                      { header: "Amount", key: "amount", width: 24, align: "right" },
                      { header: "Linked PO", key: "po", width: 20 },
                      { header: "Reference", key: "reference" },
                      { header: "Notes", key: "notes" },
                    ],
                    rows: payments.map((p) => ({
                      date: new Date(p.createdAt).toLocaleDateString("en-BD"),
                      method: methodLabels[p.paymentMethod] || p.paymentMethod,
                      amount: bdtPDF(p.amount),
                      po: p.purchaseOrderId || "—",
                      reference: p.reference || "—",
                      notes: p.notes || "—",
                    })),
                    grandTotal: { label: "Total Paid", value: bdtPDF(supplier.totalPaid) },
                  });
                  toast.success("PDF exported");
                }}
                className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
              >
                <Download size={12} /> PDF
              </button>
              <button
                onClick={() => {
                  downloadCSV(
                    ["Date", "Method", "Amount", "Linked PO", "Reference", "Notes"],
                    payments.map((p) => [
                      new Date(p.createdAt).toLocaleDateString("en-BD"),
                      methodLabels[p.paymentMethod] || p.paymentMethod,
                      p.amount,
                      p.purchaseOrderId || "",
                      p.reference || "",
                      p.notes || "",
                    ]),
                    `supplier-ledger-${supplier.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`,
                  );
                  toast.success("CSV exported");
                }}
                className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
              >
                <Download size={12} /> CSV
              </button>
            </>
          )}
          <button
            onClick={() => printIdentity(supplier, storeInfo)}
            className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
          >
            <Printer size={12} /> Print
          </button>
          <button
            onClick={handleIdentityPdf}
            disabled={pdfLoading}
            className="rounded-md flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface disabled:opacity-60"
          >
            <FileText size={12} /> {pdfLoading ? "Preparing…" : "Identity PDF"}
          </button>
          <Link href="/dashboard/purchases">
            <Button variant="surface">
              <ArrowLeft size={13} /> Back
            </Button>
          </Link>
          <Button variant="default" onClick={() => setShowPayForm(true)}>
            <Plus size={13} /> Record Payment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Balance"
          value={bdt(supplier.balance)}
          hint={
            supplier.balance > 0
              ? "Owed to supplier"
              : supplier.balance < 0
                ? "Credit from supplier"
                : "Settled"
          }
        />
        <Stat label="Total Purchases" value={bdt(supplier.totalPurchases)} />
        <Stat label="Total Paid" value={bdt(supplier.totalPaid)} />
        <Stat label="Opening Balance" value={bdt(supplier.openingBalance || 0)} />
      </div>

      {/* Contact Card */}
      <div className="mt-4 border border-border bg-background p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Contact Information
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          {supplier.contactPerson && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{supplier.contactPerson}</span>
            </div>
          )}
          {supplier.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone size={13} /> {supplier.phone}
            </div>
          )}
          {supplier.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail size={13} /> {supplier.email}
            </div>
          )}
          {(supplier.address || supplier.city) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin size={13} /> {[supplier.address, supplier.city].filter(Boolean).join(", ")}
            </div>
          )}
        </div>
        {supplier.notes && <p className="mt-2 text-xs text-muted-foreground">{supplier.notes}</p>}
      </div>

      {/* Identity & NID */}
      <div className="mt-4 border border-border bg-background p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Identity & NID
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="mb-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              NID Number
            </div>
            <div className="font-mono tabular-nums">{supplier.nidNumber ?? "—"}</div>
          </div>
          <div>
            <div className="mb-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
              Date of Birth
            </div>
            <div>{supplier.dob ? new Date(supplier.dob).toLocaleDateString("en-BD") : "—"}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
            NID Document
          </div>
          {supplier.nidImages.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {supplier.nidImages.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="block text-left"
                >
                  <img
                    src={url}
                    alt={`NID ${i === 0 ? "front" : "back"}`}
                    className="h-24 w-40 border border-border object-cover hover:opacity-90"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    NID {i === 0 ? "Front" : "Back"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No NID uploaded.</p>
          )}
        </div>
      </div>

      {/* Payment History */}
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Payment History
        </h3>
        <SortableTable
          columns={[
            {
              key: "createdAt",
              header: "Date",
              sortable: true,
              className: "text-xs text-muted-foreground",
              render: (v: string) => new Date(v).toLocaleDateString("en-BD"),
            },
            {
              key: "paymentMethod",
              header: "Method",
              render: (v: string) => (
                <span className="rounded-md inline-flex items-center border border-border px-1.5 py-0.5 text-[11px]">
                  {methodLabels[v] || v}
                </span>
              ),
            },
            {
              key: "amount",
              header: "Amount",
              sortable: true,
              className: "font-medium",
              render: (v: number) => bdt(v),
            },
            {
              key: "purchaseOrderId",
              header: "Linked PO",
              className: "text-muted-foreground",
              render: (v: string | null) => v || "—",
            },
            {
              key: "reference",
              header: "Reference",
              className: "text-muted-foreground",
              render: (v: string | null) => v || "—",
            },
            {
              key: "notes",
              header: "Notes",
              className: "text-muted-foreground",
              render: (v: string | null) => v || "—",
            },
          ]}
          data={payments.map((p) => ({ ...p }))}
          rowKey={(p) => p.id}
          pageSize={25}
          emptyMessage="No payments recorded yet."
        />
      </div>

      {/* Record Payment Modal */}
      {showPayForm && (
        <RecordPaymentForm
          supplierId={id}
          onClose={() => setShowPayForm(false)}
          onSaved={() => {
            setShowPayForm(false);
            void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers", id] });
            void qc.invalidateQueries({ queryKey: ["dashboard", "suppliers", id, "payments"] });
          }}
        />
      )}

      {/* NID image lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="sr-only">NID document</DialogTitle>
          {lightbox && <img src={lightbox} alt="NID document" className="w-full rounded-sm" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecordPaymentForm({
  supplierId,
  onClose,
  onSaved,
}: {
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${supplierId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          paymentDate,
          paymentMethod,
          reference: reference || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success("Payment recorded");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-border bg-background p-4"
      >
        <div className="mb-3 text-sm font-medium">Record Payment</div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Amount (৳) *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50000"
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Payment Method
            </label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="bkash">bKash</SelectItem>
                <SelectItem value="nagad">Nagad</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Reference
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque #, transaction ID…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
              Notes
            </label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="surface" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={saving}>
            {saving ? "Saving…" : "Record"}
          </Button>
        </div>
      </form>
    </div>
  );
}
