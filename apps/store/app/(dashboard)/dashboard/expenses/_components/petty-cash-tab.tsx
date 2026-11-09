"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, Pill, Stat } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { sessionToken } from "@/lib/api";
import { bdt } from "@/lib/utils";

interface Fund {
  id: number;
  fundName: string;
  currentBalance: number; // poisha
  openingBalance: number;
  lowThreshold: number; // poisha
  locationId: string | null;
}

interface FundTxn {
  id: number;
  type: string; // replenishment | withdrawal | expense
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  createdByName: string | null;
}

function txnPill(type: string) {
  const map: Record<string, { label: string; tone: "success" | "danger" | "info" }> = {
    replenishment: { label: "Top-up", tone: "success" },
    withdrawal: { label: "Withdrawal", tone: "danger" },
    expense: { label: "Expense", tone: "info" },
  };
  const t = map[type] ?? { label: type, tone: "info" as const };
  return <Pill tone={t.tone}>{t.label}</Pill>;
}

/**
 * Petty-cash fund: the drawer float for small day-to-day spending. Cash
 * expenses saved from the New Expense tab deduct from this fund
 * automatically; top-ups and withdrawals are recorded here.
 */
export function PettyCashTab({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  // create-fund form
  const [fundName, setFundName] = useState("Petty Cash");
  const [openingTaka, setOpeningTaka] = useState("");
  const [thresholdTaka, setThresholdTaka] = useState("5000");

  const { data, isLoading } = useQuery<{ fund: Fund | null; transactions: FundTxn[] }>({
    queryKey: ["petty-cash"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/expenses/petty-cash", {
        headers: { "x-session-token": sessionToken() },
      });
      if (!res.ok) throw new Error("Failed to load petty cash");
      return res.json();
    },
  });

  const post = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/expenses/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken() },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || `HTTP ${res.status}`);
        return false;
      }
      toast.success(successMsg);
      queryClient.invalidateQueries({ queryKey: ["petty-cash"] });
      return true;
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading petty cash...</div>
    );
  }

  const fund = data?.fund ?? null;
  const transactions = data?.transactions ?? [];

  // ── No fund yet: owner opens one ────────────────────────────────────────
  if (!fund) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h3 className="text-sm font-medium">Open a petty-cash fund</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A small float for day-to-day spending. Cash expenses saved in the New Expense tab deduct
          from it automatically.{isOwner ? "" : " Ask the store owner to set this up."}
        </p>
        {isOwner && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground">Fund name</label>
              <Input
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground">Opening balance (BDT)</label>
                <Input
                  type="number"
                  min="0"
                  value={openingTaka}
                  onChange={(e) => setOpeningTaka(e.target.value)}
                  placeholder="0"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Low-balance alert (BDT)</label>
                <Input
                  type="number"
                  min="0"
                  value={thresholdTaka}
                  onChange={(e) => setThresholdTaka(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <Button
              disabled={busy || !fundName.trim()}
              onClick={async () => {
                const ok = await post(
                  {
                    action: "create-fund",
                    fundName: fundName.trim(),
                    amount: Math.round(Number(openingTaka || 0) * 100),
                    lowThreshold: Math.round(Number(thresholdTaka || 0) * 100),
                  },
                  "Petty-cash fund created",
                );
                if (ok) setOpeningTaka("");
              }}
            >
              Create Fund
            </Button>
          </div>
        )}
      </Card>
    );
  }

  // ── Fund exists: balance, movements, ledger ─────────────────────────────
  const isLow = fund.currentBalance < fund.lowThreshold;

  const move = async (action: "replenish" | "withdrawal") => {
    const taka = Number(amount);
    if (!taka || taka <= 0) return toast.error("Enter a positive amount");
    const ok = await post(
      { action, amount: Math.round(taka * 100), description },
      action === "replenish" ? "Fund topped up" : "Cash withdrawn",
    );
    if (ok) {
      setAmount("");
      setDescription("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label={fund.fundName} value={bdt(fund.currentBalance)} hint="current balance" />
        <Stat
          label="Low-balance alert"
          value={bdt(fund.lowThreshold)}
          hint={isLow ? "balance is LOW" : "balance healthy"}
        />
        <Stat
          label="Movements shown"
          value={String(transactions.length)}
          hint="latest ledger entries"
        />
      </div>

      {isLow && (
        <Card className="border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          Balance is below the {bdt(fund.lowThreshold)} threshold — top up soon.
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-medium">Record a movement</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Amount (BDT)</label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="h-9 w-32"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className="text-[10px] text-muted-foreground">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cash added from sales"
              className="h-9"
            />
          </div>
          <Button variant="outline" disabled={busy} onClick={() => move("replenish")}>
            Top Up
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirmWithdraw(true)}>
            Withdraw
          </Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
                <th className="px-3 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-surface">
                  <td className="px-3 py-2.5">
                    {new Date(t.createdAt).toLocaleDateString("en-BD")}
                  </td>
                  <td className="px-3 py-2.5">{txnPill(t.type)}</td>
                  <td className="px-3 py-2.5">{t.description}</td>
                  <td
                    className={
                      "px-3 py-2.5 text-right font-medium " +
                      (t.type === "replenishment" ? "text-emerald-600" : "")
                    }
                  >
                    {t.type === "replenishment" ? "+" : "−"}
                    {bdt(t.amount)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{bdt(t.balanceAfter)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {t.createdByName || "—"}
                  </td>
                </tr>
              ))}
              {!transactions.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No movements yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title="Withdraw cash"
        description={`Remove ${bdt(Math.round(Number(amount || 0) * 100))} from ${fund.fundName}?`}
        confirmLabel="Withdraw"
        variant="destructive"
        onConfirm={() => {
          setConfirmWithdraw(false);
          move("withdrawal");
        }}
      />
    </div>
  );
}
