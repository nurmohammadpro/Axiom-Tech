"use client";

import Link from "next/link";
import { SortableTable } from "@/components/sortable-table";
import { fmtDate, daysUntil, methodLabel } from "@/lib/format";
import { taka } from "@/lib/domain";

export interface AdminTenantRow {
  id: string;
  name: string;
  date: Date | null;
}

export interface AdminPaymentRow {
  id: string;
  shop: string;
  shopId: string;
  kind: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: Date;
}

/**
 * Client tables for the admin dashboard. They live in their own file because
 * the page is a server component and the columns use render functions.
 */
export function TrialsEndingTable({ rows }: { rows: AdminTenantRow[] }) {
  return (
    <SortableTable<AdminTenantRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="None"
      columns={[
        {
          key: "name",
          header: "Shop",
          sortable: true,
          render: (v, r) => (
            <Link className="font-medium underline" href={`/tenants/${r.id}`}>{v}</Link>
          ),
        },
        {
          key: "date",
          header: "Trial ends",
          sortable: true,
          render: (v) => (
            <span style={{ color: "var(--muted-foreground)" }}>
              {fmtDate(v)} ({daysUntil(v)}d)
            </span>
          ),
        },
      ]}
    />
  );
}

export function RenewalsTable({ rows }: { rows: AdminTenantRow[] }) {
  return (
    <SortableTable<AdminTenantRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="None"
      columns={[
        {
          key: "name",
          header: "Shop",
          sortable: true,
          render: (v, r) => (
            <Link className="font-medium underline" href={`/tenants/${r.id}`}>{v}</Link>
          ),
        },
        {
          key: "date",
          header: "Paid until",
          sortable: true,
          render: (v) => <span style={{ color: "var(--muted-foreground)" }}>{fmtDate(v)}</span>,
        },
      ]}
    />
  );
}

export function RecentPaymentsTable({ rows }: { rows: AdminPaymentRow[] }) {
  return (
    <SortableTable<AdminPaymentRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="No payments yet"
      defaultSortColumn="receivedAt"
      defaultSortDirection="desc"
      columns={[
        {
          key: "shop",
          header: "Shop",
          sortable: true,
          render: (v, r) => <Link className="underline" href={`/tenants/${r.shopId}`}>{v}</Link>,
        },
        { key: "kind", header: "Kind", sortable: true, render: (v) => <span className="capitalize">{v}</span> },
        { key: "amount", header: "Amount", sortable: true, render: (v) => taka(v) },
        { key: "method", header: "Method", sortable: true, render: (v) => methodLabel(v) },
        { key: "reference", header: "Reference", render: (v) => v ?? "-" },
        { key: "receivedAt", header: "Date", sortable: true, render: (v) => fmtDate(v) },
      ]}
    />
  );
}
