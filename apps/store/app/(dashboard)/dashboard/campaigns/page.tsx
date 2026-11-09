"use client";

import { useState } from "react";
import { Table, Pill, Card, Stat } from "@/components/dashboard/dashboard-shell";
import {
  useCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
} from "@/lib/hooks";
import type { Campaign } from "@/lib/api";
import { XCircle, Trash2 } from "lucide-react";

function CampaignModal({
  campaign,
  onClose,
  onSave,
  saving,
}: {
  campaign?: Campaign | null;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [discountPct, setDiscountPct] = useState(String(campaign?.discountPct ?? ""));
  const [startDate, setStartDate] = useState(
    campaign?.startDate ? new Date(campaign.startDate).toISOString().split("T")[0] : "",
  );
  const [endDate, setEndDate] = useState(
    campaign?.endDate ? new Date(campaign.endDate).toISOString().split("T")[0] : "",
  );
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);

  const handleSave = () => {
    if (!name.trim() || !startDate) return;
    onSave({
      ...(campaign ? { id: campaign.id } : {}),
      name: name.trim(),
      discountPct: discountPct ? Number(discountPct) : null,
      startDate: new Date(startDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      isActive,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="mx-4 w-full max-w-md border border-border bg-background shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-medium">{campaign ? "Edit Campaign" : "Create Campaign"}</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XCircle size={18} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Campaign name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Sale"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              placeholder="e.g. 15"
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">End date (optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              id="active"
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm">Active</label>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !startDate}
            className="w-full rounded border border-border bg-background py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
          >
            {saving ? "Saving..." : campaign ? "Update Campaign" : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { data: campaigns = [] } = useCampaigns();
  const createMut = useCreateCampaign();
  const updateMut = useUpdateCampaign();
  const deleteMut = useDeleteCampaign();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const activeCampaigns = campaigns.filter((c) => c.isActive);
  const upcomingCampaigns = campaigns.filter(
    (c) => c.startDate && new Date(c.startDate) > new Date(),
  );
  const avgDiscount =
    campaigns.filter((c) => c.discountPct).reduce((sum, c) => sum + (c.discountPct ?? 0), 0) /
    (campaigns.filter((c) => c.discountPct).length || 1);

  const handleSave = async (data: any) => {
    if (editing) {
      await updateMut.mutateAsync(data);
    } else {
      await createMut.mutateAsync(data);
    }
    setShowModal(false);
    setEditing(null);
  };

  const handleToggle = async (c: Campaign) => {
    await updateMut.mutateAsync({ id: c.id, isActive: !c.isActive });
  };

  const handleDelete = async (id: number) => {
    await deleteMut.mutateAsync(id);
    setConfirmDelete(null);
  };

  return (
    <>
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Active"
          value={String(activeCampaigns.length)}
          hint="running now"
          href="/dashboard/campaigns"
        />
        <Stat
          label="Avg. discount"
          value={campaigns.length ? `${avgDiscount.toFixed(0)}%` : "—"}
          hint="across all"
          href="/dashboard/campaigns"
        />
        <Stat
          label="Total campaigns"
          value={String(campaigns.length)}
          hint="all time"
          href="/dashboard/campaigns"
        />
        <Stat
          label="Upcoming"
          value={String(upcomingCampaigns.length)}
          hint="scheduled"
          href="/dashboard/campaigns"
        />
      </div>

      {/* Campaigns Table */}
      <div className="mt-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">All campaigns</div>
          <button
            onClick={() => {
              setEditing(null);
              setShowModal(true);
            }}
            className="rounded border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-surface"
          >
            Create Campaign
          </button>
        </div>
        {campaigns.length === 0 ? (
          <Card className="p-4">
            <div className="py-8 text-center text-sm text-muted-foreground">
              No campaigns yet. Create your first campaign to start tracking promotions.
            </div>
          </Card>
        ) : (
          <Table
            columns={["Name", "Discount", "Start", "End", "Status", "Actions"]}
            rows={campaigns.map((c) => [
              <span key="n" className="font-medium">{c.name}</span>,
              c.discountPct ? `${c.discountPct}% off` : "—",
              new Date(c.startDate).toLocaleDateString(),
              c.endDate ? new Date(c.endDate).toLocaleDateString() : "—",
              <Pill key="s" tone={c.isActive ? "success" : "muted"}>
                {c.isActive ? "Active" : "Inactive"}
              </Pill>,
              <div key="a" className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditing(c);
                    setShowModal(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggle(c)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {c.isActive ? "Deactivate" : "Activate"}
                </button>
                {confirmDelete === c.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-sale hover:underline"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(c.id)}
                    className="text-muted-foreground hover:text-sale"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>,
            ])}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <CampaignModal
          campaign={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSave={handleSave}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}
    </>
  );
}
