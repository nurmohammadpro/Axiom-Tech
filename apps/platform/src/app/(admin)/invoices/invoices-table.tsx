"use client";

import Link from "next/link";
import { SortableTable } from "@/components/sortable-table";
import { Badge } from "../../ui";
import { fmtDate, daysUntil } from "@/lib/format";
import { formatInvoiceNumber, taka } from "@/lib/domain";

export interface InvoiceRow {
  id: string;
  tenantId: string;
  seq: number;
  createdAt: Date;
  shop: string;
  slug: string;
  description: string;
  amount: number;
  dueDate: Date | null;
  status: string;
}

/**
 * Client table for the invoices list. Lives in its own file because the page
 * is a server component and the columns use render functions.
 */
export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const now = new Date();
  return (
    <SortableTable<InvoiceRow>
      data={rows}
      rowKey={(r) => r.id}
      pageSize={25}
      emptyMessage={'No invoices. Use "Generate monthly invoices" for shops near their renewal date.'}
      columns={[
        {
          key: "createdAt",
          header: "Invoice",
          sortable: true,
          render: (v, r) => <span className="font-mono text-xs">{formatInvoiceNumber(r.seq, v)}</span>,
        },
        {
          key: "shop",
          header: "Shop",
          sortable: true,
          render: (v, r) => (
            <>
              <Link className="underline" href={`/tenants/${r.tenantId}`}>{v}</Link>
              <span className="ml-1 text-xs" style={{ color: "var(--muted-foreground)" }}>.{r.slug}</span>
            </>
          ),
        },
        { key: "description", header: "Description", sortable: true },
        { key: "amount", header: "Amount", sortable: true, render: (v) => taka(v) },
        {
          key: "dueDate",
          header: "Due date",
          sortable: true,
          render: (v, r) => {
            const overdue = r.status === "due" && v && v < now;
            return (
              <span style={overdue ? { color: "var(--bad)" } : undefined}>
                {fmtDate(v)}
                {overdue && v && ` (${Math.abs(daysUntil(v, now) ?? 0)}d late)`}
              </span>
            );
          },
        },
        {
          key: "status",
          header: "Status",
          sortable: true,
          render: (v, r) => {
            const overdue = r.status === "due" && r.dueDate && r.dueDate < now;
            return <Badge value={overdue ? "overdue" : v} />;
          },
        },
        {
          key: "view",
          header: "",
          render: (_v, r) => <Link className="underline" href={`/invoices/${r.id}`}>View</Link>,
        },
      ]}
    />
  );
}
