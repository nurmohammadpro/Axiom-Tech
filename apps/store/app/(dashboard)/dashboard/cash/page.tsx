"use client";

import { useState, useMemo } from "react";
import { Card, Stat, Table, Pill } from "@/components/dashboard/dashboard-shell";
import {
  useCashRegisters,
  useCashStats,
  useOpenCashRegister,
  useCloseCashRegister,
  useSessionScope,
  useSettings,
} from "@/lib/hooks";
import { bdt } from "@/lib/utils";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import {
  Banknote,
  CreditCard,
  Smartphone,
  XCircle,
  ArrowRight,
  Store,
  Globe,
  Download,
} from "lucide-react";
import { toast } from "sonner";

function formatMethod(method: string) {
  if (method === "bkash" || method === "nagad" || method === "mfs" || method === "mobile")
    return "MFS";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

export default function Cash() {
  const { data: registers = [] } = useCashRegisters();
  const { data: stats } = useCashStats();
  const { data: me } = useSessionScope();
  const openMut = useOpenCashRegister();
  const closeMut = useCloseCashRegister();

  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openName, setOpenName] = useState("Main Register");
  const [openBal, setOpenBal] = useState("");
  const [closeBal, setCloseBal] = useState("");
  const { data: settings } = useSettings();

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "PlayStore",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "01727811918",
      email: settings?.storeEmail || "info@playstore.com.bd",
    }),
    [settings],
  );

  const openRegister = stats?.openRegister ?? null;

  const handleOpen = async () => {
    if (!openName.trim()) return;
    await openMut.mutateAsync({
      name: openName.trim(),
      openingBal: Math.round(parseFloat(openBal || "0")),
      openedBy: me?.id,
    });
    setShowOpenModal(false);
    setOpenBal("");
  };

  const handleClose = async () => {
    if (!openRegister) return;
    await closeMut.mutateAsync({
      id: openRegister.id,
      closingBal: Math.round(parseFloat(closeBal || "0")),
    });
    setShowCloseModal(false);
    setCloseBal("");
  };

  return (
    <>
      {/* Stat Cards — Owner Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Gross sales today"
          value={stats ? bdt(stats.grandTotal) : "—"}
          hint="all payment methods"
          href="/dashboard/reports"
        />
        <Stat
          label="Cash in drawer"
          value={stats ? bdt(stats.cashInDrawer) : "—"}
          hint={openRegister ? `Register: ${openRegister.name}` : "No register open"}
          href="/dashboard/cash"
        />
        <Stat
          label="Card sales today"
          value={stats ? bdt(stats.totalCard) : "—"}
          hint="POS + Online"
          href="/dashboard/reports"
        />
        <Stat
          label="MFS sales today"
          value={stats ? bdt(stats.totalMFS) : "—"}
          hint="bKash / Nagad / etc."
          href="/dashboard/reports"
        />
      </div>

      {/* Payment Breakdown + Channel Split */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Payment Method Split */}
        <Card className="p-4">
          <div className="text-sm font-medium">Sales by payment method</div>
          <div className="text-xs text-muted-foreground">Today&apos;s confirmed payments</div>
          <div className="mt-4 space-y-3">
            {stats ? (
              [
                { label: "Cash", amount: stats.totalCash, icon: Banknote, color: "bg-emerald-500" },
                { label: "Card", amount: stats.totalCard, icon: CreditCard, color: "bg-blue-500" },
                { label: "MFS", amount: stats.totalMFS, icon: Smartphone, color: "bg-purple-500" },
              ].map((m) => {
                const pct = stats.grandTotal > 0 ? (m.amount / stats.grandTotal) * 100 : 0;
                return (
                  <div key={m.label}>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${m.color}`} />
                        <m.icon size={14} className="text-muted-foreground" />
                        <span>{m.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                        <span className="font-medium">{bdt(m.amount)}</span>
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full ${m.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground">Loading...</div>
            )}
          </div>
        </Card>

        {/* Channel Split */}
        <Card className="p-4">
          <div className="text-sm font-medium">Cash by channel</div>
          <div className="text-xs text-muted-foreground">POS vs Online cash collections</div>
          <div className="mt-4 space-y-4">
            {/* POS Warehouses */}
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Store size={14} className="text-muted-foreground" />
                POS (Warehouses)
                <span className="ml-auto font-medium">{stats ? bdt(stats.cashPOS) : "—"}</span>
              </div>
              {stats?.warehouses && stats.warehouses.length > 0 ? (
                <div className="mt-2 ml-6 space-y-1.5">
                  {stats.warehouses.map((wh) => (
                    <div key={wh.location} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {wh.location}
                      </div>
                      <span className="font-medium">{bdt(wh.cashTotal)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 ml-6 text-xs text-muted-foreground">No warehouse data</div>
              )}
            </div>

            {/* Online */}
            <div className="border-t border-border pt-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe size={14} className="text-muted-foreground" />
                Online (COD / Pay-at-store)
                <span className="ml-auto font-medium">{stats ? bdt(stats.cashOnline) : "—"}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Register Movements + End of Day */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Register Movements Table */}
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Register movements</div>
            <div className="flex items-center gap-2">
              {registers.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      generatePDF({
                        title: "Cash Report",
                        storeInfo,
                        kpis: [
                          { label: "Grand Total", value: stats ? bdtPDF(stats.grandTotal) : "—" },
                          {
                            label: "Cash in Drawer",
                            value: stats ? bdtPDF(stats.cashInDrawer) : "—",
                          },
                          { label: "Card Sales", value: stats ? bdtPDF(stats.totalCard) : "—" },
                          { label: "MFS Sales", value: stats ? bdtPDF(stats.totalMFS) : "—" },
                        ],
                        details: {
                          left: {
                            title: "Payment Breakdown",
                            rows: [
                              { label: "Cash", value: stats ? bdtPDF(stats.totalCash) : "—" },
                              { label: "Card", value: stats ? bdtPDF(stats.totalCard) : "—" },
                              { label: "MFS", value: stats ? bdtPDF(stats.totalMFS) : "—" },
                            ],
                          },
                          right: {
                            title: "Channel Split",
                            rows: [
                              { label: "POS Cash", value: stats ? bdtPDF(stats.cashPOS) : "—" },
                              {
                                label: "Online Cash",
                                value: stats ? bdtPDF(stats.cashOnline) : "—",
                              },
                            ],
                          },
                        },
                        columns: [
                          { header: "Name", key: "name" },
                          { header: "Opened By", key: "openedBy" },
                          { header: "Opening Bal", key: "opening", width: 22, align: "right" },
                          { header: "Closing Bal", key: "closing", width: 22, align: "right" },
                          { header: "Status", key: "status", width: 18 },
                          { header: "Opened", key: "opened", width: 22 },
                          { header: "Closed", key: "closed", width: 22 },
                        ],
                        rows: registers.map((r) => ({
                          name: r.name,
                          openedBy: r.openedByName || "—",
                          opening: bdtPDF(r.openingBal),
                          closing: r.closingBal != null ? bdtPDF(r.closingBal) : "—",
                          status: r.closedAt ? "Closed" : "Open",
                          opened: r.openedAt
                            ? new Date(r.openedAt).toLocaleDateString("en-BD")
                            : "—",
                          closed: r.closedAt
                            ? new Date(r.closedAt).toLocaleDateString("en-BD")
                            : "—",
                        })),
                      });
                      toast.success("PDF exported");
                    }}
                    className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                  >
                    <Download size={12} /> PDF
                  </button>
                  <button
                    onClick={() => {
                      downloadCSV(
                        [
                          "Name",
                          "Opened By",
                          "Opening Bal",
                          "Closing Bal",
                          "Status",
                          "Opened",
                          "Closed",
                        ],
                        registers.map((r) => [
                          r.name,
                          r.openedByName || "",
                          r.openingBal,
                          r.closingBal ?? "",
                          r.closedAt ? "Closed" : "Open",
                          r.openedAt ? new Date(r.openedAt).toLocaleDateString("en-BD") : "",
                          r.closedAt ? new Date(r.closedAt).toLocaleDateString("en-BD") : "",
                        ]),
                        `cash-report-${new Date().toISOString().split("T")[0]}.csv`,
                      );
                      toast.success("CSV exported");
                    }}
                    className="flex items-center gap-1 border border-border bg-background px-2.5 py-1 text-xs hover:bg-surface"
                  >
                    <Download size={12} /> CSV
                  </button>
                </>
              )}
              {!openRegister && (
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="rounded border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-surface"
                >
                  Open Register
                </button>
              )}
            </div>
          </div>
          {registers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No register sessions yet. Open a register to start tracking.
            </div>
          ) : (
            <Table
              columns={[
                "Name",
                "Opened by",
                "Opening Bal",
                "Closing Bal",
                "Status",
                "Opened",
                "Closed",
              ]}
              rows={registers.map((r) => [
                <span key="n" className="font-medium">
                  {r.name}
                </span>,
                r.openedByName || "—",
                bdt(r.openingBal),
                r.closingBal != null ? bdt(r.closingBal) : "—",
                <Pill key="s" tone={r.status === "open" ? "success" : "muted"}>
                  {r.status === "open" ? "Open" : "Closed"}
                </Pill>,
                r.openedAt ? new Date(r.openedAt).toLocaleString() : "—",
                r.closedAt ? new Date(r.closedAt).toLocaleString() : "—",
              ])}
            />
          )}
        </Card>

        {/* End of Day Count */}
        <Card className="p-4">
          <div className="text-sm font-medium">End of day</div>
          {openRegister ? (
            <div className="mt-4 space-y-3">
              <div className="rounded border border-border bg-surface p-3">
                <div className="text-xs text-muted-foreground">Open register</div>
                <div className="mt-1 font-medium">{openRegister.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Opening: {bdt(openRegister.openingBal)}
                </div>
                {openRegister.openedAt && (
                  <div className="text-xs text-muted-foreground">
                    Opened: {new Date(openRegister.openedAt).toLocaleString()}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Cash in drawer:{" "}
                <span className="font-medium text-foreground">{bdt(stats?.cashInDrawer ?? 0)}</span>
              </div>
              <button
                onClick={() => setShowCloseModal(true)}
                className="w-full rounded border border-border bg-background py-2 text-xs font-medium hover:bg-surface"
              >
                Close Register
              </button>
            </div>
          ) : (
            <div className="mt-4 text-sm text-muted-foreground">
              No register open. Click &quot;Open Register&quot; to start the day.
            </div>
          )}
        </Card>
      </div>

      {/* Open Register Modal */}
      {showOpenModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowOpenModal(false)}
        >
          <div
            className="mx-4 w-full max-w-sm border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-medium">Open Register</div>
              <button
                onClick={() => setShowOpenModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Register name</label>
                <input
                  value={openName}
                  onChange={(e) => setOpenName(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Opening balance (BDT)
                </label>
                <input
                  type="number"
                  value={openBal}
                  onChange={(e) => setOpenBal(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleOpen}
                disabled={openMut.isPending || !openName.trim()}
                className="w-full rounded border border-border bg-background py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {openMut.isPending ? "Opening..." : "Open Register"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register Modal */}
      {showCloseModal && openRegister && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="mx-4 w-full max-w-sm border border-border bg-background shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-medium">Close Register</div>
              <button
                onClick={() => setShowCloseModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded border border-border bg-surface p-3 text-xs">
                <div className="text-muted-foreground">Register</div>
                <div className="font-medium">{openRegister.name}</div>
                <div className="mt-1 text-muted-foreground">
                  Opening balance: {bdt(openRegister.openingBal)}
                </div>
                <div className="text-muted-foreground">
                  Expected in drawer: {bdt(stats?.cashInDrawer ?? 0)}
                </div>
                {!!stats?.cashExpenses && (
                  <div className="text-muted-foreground">
                    Expenses paid from drawer: {bdt(stats.cashExpenses)}
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Actual closing balance (BDT)
                </label>
                <input
                  type="number"
                  value={closeBal}
                  onChange={(e) => setCloseBal(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              {closeBal && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Difference: </span>
                  <span
                    className={
                      Math.round(parseFloat(closeBal || "0")) === (stats?.cashInDrawer ?? 0)
                        ? "text-emerald-600"
                        : "text-sale"
                    }
                  >
                    {bdt(Math.round(parseFloat(closeBal || "0")) - (stats?.cashInDrawer ?? 0))}
                  </span>
                </div>
              )}
              <button
                onClick={handleClose}
                disabled={closeMut.isPending}
                className="w-full rounded border border-border bg-background py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                {closeMut.isPending ? "Closing..." : "Close Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
