"use client";

import { useState, useMemo, Fragment, type ReactNode } from "react";

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (value: any, row: T, index: number) => ReactNode;
}

interface SortableTableProps<T> {
  columns: Column<T>[];
  data: T[];
  defaultSortColumn?: string;
  defaultSortDirection?: "asc" | "desc";
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  rowKey?: (row: T) => string | number;
  detailRow?: (row: T, isExpanded: boolean) => ReactNode;
  expandedKeys?: Set<string | number>;
  onToggleExpand?: (key: string | number, expanded: boolean) => void;
}

export function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  defaultSortColumn,
  defaultSortDirection = "asc",
  emptyMessage = "No data available",
  onRowClick,
  rowClassName,
  rowKey,
  detailRow,
  expandedKeys,
  onToggleExpand,
}: SortableTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(defaultSortColumn || null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    defaultSortColumn ? defaultSortDirection : null,
  );
  const [internalExpandedRows, setInternalExpandedRows] = useState<Set<string | number>>(new Set());

  const expandedRows = expandedKeys ?? internalExpandedRows;
  const setExpandedRows = onToggleExpand
    ? (key: string | number, expanded: boolean) => onToggleExpand(key, expanded)
    : (key: string | number, expanded: boolean) => {
        setInternalExpandedRows((prev) => {
          const next = new Set(prev);
          if (expanded) next.add(key);
          else next.delete(key);
          return next;
        });
      };

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === "asc" ? comparison : -comparison;
      }

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      if (aValue instanceof Date && bValue instanceof Date) {
        const comparison = aValue.getTime() - bValue.getTime();
        return sortDirection === "asc" ? comparison : -comparison;
      }

      const aStr = String(aValue);
      const bStr = String(bValue);
      const comparison = aStr.localeCompare(bStr);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = (columnKey: string) => {
    const column = columns.find((col) => col.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection("asc");
    }
  };

  const getSortIndicator = (columnKey: string) => {
    const isActive = sortColumn === columnKey;
    const arrowUp =
      isActive && sortDirection === "asc" ? "text-foreground" : "text-muted-foreground/40";
    const arrowDown =
      isActive && sortDirection === "desc" ? "text-foreground" : "text-muted-foreground/40";
    return (
      <span className="ml-1 inline-flex flex-col leading-[8px] text-[7px]">
        <span className={arrowUp}>▲</span>
        <span className={arrowDown}>▼</span>
      </span>
    );
  };

  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-3 py-2 font-medium ${column.className ?? ""} ${
                  column.sortable
                    ? "cursor-pointer select-none hover:text-foreground transition-colors"
                    : ""
                }`}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <span className="inline-flex items-center">
                  {column.header}
                  {column.sortable && getSortIndicator(column.key)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => {
              const key = rowKey ? rowKey(row) : rowIndex;
              const isExpanded = expandedRows.has(key);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-border last:border-b-0 hover:bg-surface ${rowClassName?.(row) ?? ""}`}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2 align-middle ${column.className ?? ""}`}
                      >
                        {column.render
                          ? column.render(row[column.key], row, rowIndex)
                          : (row[column.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                  {detailRow && isExpanded && (
                    <tr className="bg-muted/30">
                      <td colSpan={columns.length} className="px-3 py-2">
                        {detailRow(row, isExpanded)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
