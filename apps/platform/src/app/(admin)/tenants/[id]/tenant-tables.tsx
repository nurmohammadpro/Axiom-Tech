"use client";

import { SortableTable } from "@/components/sortable-table";
import { Badge } from "../../../ui";
import { fmtDate } from "@/lib/format";
import { formatInvoiceNumber, taka } from "@/lib/domain";
import { methodLabel } from "@/lib/format";

export interface TenantInvoiceRow {
  id: string;
  seq: number;
  createdAt: Date;
  description: string;
  amount: number;
  status: string;
  paidAt: Date | null;
}

export interface TenantPaymentRow {
  id: string;
  receivedAt: Date;
  kind: string;
  amount: number;
  method: string;
  reference: string | null;
  months: number | null;
}

/**
 * Client tables for the shop detail page. They live in their own file because
 * the page is a server component and the columns use render functions.
 */
export function TenantInvoicesTable({ rows }: { rows: TenantInvoiceRow[] }) {
  return (
    <SortableTable<TenantInvoiceRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="No invoices yet"
      defaultSortColumn="createdAt"
      defaultSortDirection="desc"
      columns={[
        {
          key: "createdAt",
          header: "No.",
          sortable: true,
          render: (v, r) => formatInvoiceNumber(r.seq, v),
        },
        { key: "description", header: "Description", sortable: true },
        { key: "amount", header: "Amount", sortable: true, render: (v) => taka(v) },
        { key: "status", header: "Status", sortable: true, render: (v) => <Badge value={v} /> },
        { key: "paidAt", header: "Paid", sortable: true, render: (v) => fmtDate(v) },
      ]}
    />
  );
}

export function TenantPaymentsTable({ rows }: { rows: TenantPaymentRow[] }) {
  return (
    <SortableTable<TenantPaymentRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="No payments yet"
      defaultSortColumn="receivedAt"
      defaultSortDirection="desc"
      columns={[
        { key: "receivedAt", header: "Date", sortable: true, render: (v) => fmtDate(v) },
        { key: "kind", header: "Kind", sortable: true, render: (v) => <span className="capitalize">{v}</span> },
        { key: "amount", header: "Amount", sortable: true, render: (v) => taka(v) },
        { key: "method", header: "Method", sortable: true, render: (v) => methodLabel(v) },
        { key: "reference", header: "Reference", render: (v) => v ?? "-" },
        { key: "months", header: "Months", render: (v) => v || "-" },
      ]}
    />
  );
}
