"use client";

import { SortableTable } from "@/components/sortable-table";
import { fmtDate, methodLabel } from "@/lib/format";
import { taka } from "@/lib/domain";

export interface InvoicePaymentRow {
  id: string;
  kind: string;
  amount: number;
  method: string;
  reference: string | null;
  receivedAt: Date;
}

/**
 * Client table for the shop payment history on the invoice detail page. It
 * lives in its own file because the page is a server component and the columns
 * use render functions.
 */
export function HistoryTable({ rows }: { rows: InvoicePaymentRow[] }) {
  return (
    <SortableTable<InvoicePaymentRow>
      data={rows}
      rowKey={(r) => r.id}
      emptyMessage="No payments yet"
      defaultSortColumn="receivedAt"
      defaultSortDirection="desc"
      columns={[
        { key: "kind", header: "Kind", sortable: true, render: (v) => <span className="capitalize">{v}</span> },
        { key: "amount", header: "Amount", sortable: true, render: (v) => taka(v) },
        { key: "method", header: "Method", sortable: true, render: (v) => methodLabel(v) },
        { key: "reference", header: "Reference", render: (v) => <span className="font-mono text-xs">{v ?? "-"}</span> },
        { key: "receivedAt", header: "Received", sortable: true, render: (v) => fmtDate(v) },
      ]}
    />
  );
}
