"use client";

import Link from "next/link";
import { SortableTable } from "@/components/sortable-table";
import { Badge } from "../../ui";
import { fmtDate } from "@/lib/format";
import { RowActions } from "./row-actions";

export interface ShopRow {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  plan: string;
  status: string;
  provisionStatus: string;
  provisioned: boolean;
  activatedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * Client table for the shops list. Lives in its own file because the parent
 * page is a server component and the columns use render functions.
 */
export function ShopsTable({ rows, perms }: { rows: ShopRow[]; perms: { pay: boolean; suspend: boolean; cancel: boolean; reset: boolean } }) {
  return (
    <SortableTable<ShopRow>
      data={rows}
      rowKey={(r) => r.id}
      pageSize={25}
      emptyMessage="No shops found"
      columns={[
        {
          key: "name",
          header: "Shop",
          sortable: true,
          render: (_v, t) => (
            <>
              <Link href={`/tenants/${t.id}`} className="font-semibold underline">{t.name}</Link>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t.slug} · {t.ownerEmail}</div>
            </>
          ),
        },
        { key: "plan", header: "Plan", sortable: true },
        {
          key: "status",
          header: "Status",
          sortable: true,
          render: (_v, t) => <Badge value={t.status} />,
        },
        {
          key: "provisionStatus",
          header: "Setup",
          sortable: true,
          render: (_v, t) => <Badge value={t.provisionStatus} />,
        },
        {
          key: "trialEndsAt",
          header: "Trial ends",
          sortable: true,
          render: (_v, t) => (t.activatedAt ? "-" : fmtDate(t.trialEndsAt)),
        },
        {
          key: "currentPeriodEnd",
          header: "Paid until",
          sortable: true,
          render: (v) => fmtDate(v),
        },
        {
          key: "actions",
          header: "",
          render: (_v, t) => (
            <div className="text-right">
              <RowActions
                t={{
                  id: t.id,
                  slug: t.slug,
                  status: t.status,
                  activatedAt: Boolean(t.activatedAt),
                  provisioned: t.provisioned,
                }}
                perms={perms}
              />
            </div>
          ),
        },
      ]}
    />
  );
}
