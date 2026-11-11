"use client";

import { useEffect, useRef, useState, useMemo, Fragment, type ReactNode } from "react";

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
  /** Rows per page; omit for no pagination (all rows render). */
  pageSize?: number;
  /** Row selection: renders checkboxes and reports the selected row keys. */
  selectable?: boolean;
  selectedIds?: Set<string | number>;
  selectionKey?: string;
  onSelectionChange?: (selected: Set<string | number>) => void;
  /** Toolbar shown when rows are selected (Delete, Export, …). */
  selectionToolbar?: (selectedCount: number) => ReactNode;
}

export function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  defaultSortColumn,
  defaultSortDirection = "asc",
  emptyMessage = "No data available",
  pageSize,
  selectable = false,
  selectedIds,
  selectionKey,
  onSelectionChange,
  selectionToolbar,
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

  // ── Column settings popover (Data Table v3) ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!settingsRef.current?.contains(target) && !settingsButtonRef.current?.contains(target))
        setSettingsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  // ── Row selection ──
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const selectedSet = selectedIds ?? selected;
  const setSelectedSet = onSelectionChange ?? setSelected;

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

  // ── Column visibility ──
  const visibleColumns = columns.filter((c) => !hiddenColumns.has(c.key));
  const spanCount = visibleColumns.length + (selectable ? 1 : 0);

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

  const [page, setPage] = useState(1);

  const pageCount = pageSize ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const pagedData = pageSize
    ? sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)
    : sortedData;

  // Reset to page 1 when the dataset changes size (new data arrives).
  useEffect(() => {
    setPage(1);
  }, [data.length, pageSize]);

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

  // ── Row selection helpers ──
  function rowIdentity(row: T): string | number {
    return rowKey ? rowKey(row) : selectionKey ? (row as any)[selectionKey] : JSON.stringify(row).slice(0, 40);
  }
  function isSelected(row: T): boolean {
    return selectedSet.has(rowIdentity(row));
  }
  function toggleRow(row: T) {
    const id = rowIdentity(row);
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSet(next);
  }
  function allSelected(): boolean {
    return sortedData.length > 0 && sortedData.every((r) => selectedSet.has(rowIdentity(r)));
  }
  function toggleAll() {
    if (allSelected()) {
      const next = new Set(selectedSet);
      sortedData.forEach((r) => next.delete(rowIdentity(r)));
      setSelectedSet(next);
    } else {
      const next = new Set(selectedSet);
      sortedData.forEach((r) => next.add(rowIdentity(r)));
      setSelectedSet(next);
    }
  }
  function clearSelection() {
    setSelectedSet(new Set());
  }

  return (
    <div>
      {/* Toolbar: selection info + column settings (Data Table v3 pattern) */}
      {(selectable || selectionToolbar) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-h-[32px] items-center gap-2 text-sm">
            {selectable && selectedSet.size > 0 && (
              <>
                <span className="font-semibold">{selectedSet.size} selected</span>
                {selectionToolbar?.(selectedSet.size)}
                <button
                  onClick={clearSelection}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Clear
                </button>
              </>
            )}
          </div>
          <div className="relative flex items-center gap-2">
            {columns.some((c) => hiddenColumns.has(c.key)) && (
              <button
                onClick={() => setHiddenColumns(new Set())}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Reset hidden columns
              </button>
            )}
            <button
              ref={settingsButtonRef}
              onClick={() => setSettingsOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface"
              aria-label="Table settings"
            >
              Columns
            </button>
          </div>
        </div>
      )}

      {/* Column settings popover */}
      {settingsOpen && (
        <div ref={settingsRef} className="mb-2 w-56 rounded-md border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold">Visible columns</div>
          <div className="space-y-1.5">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(c.key)}
                  onChange={(e) => {
                    const next = new Set(hiddenColumns);
                    if (e.target.checked) next.delete(c.key);
                    else next.add(c.key);
                    setHiddenColumns(next);
                  }}
                  className="size-3.5 accent-[var(--color-brand-primary)]"
                />
                {c.header}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-widest text-muted-foreground">
              {selectable && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected()}
                    onChange={toggleAll}
                    className="size-4 accent-[var(--color-brand-primary)]"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
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
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={spanCount} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedData.map((row, rowIndex) => {
                const key = rowKey ? rowKey(row) : rowIndex;
                const isExpanded = expandedRows.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => onRowClick?.(row)}
                      className={`border-b border-border last:border-b-0 hover:bg-surface ${isSelected(row) ? "bg-[var(--table-row-selected,#eff6ff)]" : ""} ${rowClassName?.(row) ?? ""}`}
                    >
                      {selectable && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected(row)}
                            onChange={() => toggleRow(row)}
                            className="size-4 accent-[var(--color-brand-primary)]"
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {visibleColumns.map((column) => (
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
                        <td colSpan={spanCount} className="px-3 py-2">
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
        {pageSize && sortedData.length > 0 && (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>
              {(safePage - 1) * pageSize + 1}–{(safePage - 1) * pageSize + pagedData.length} of{" "}
              {sortedData.length}
            </span>
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={() => setPage(1)}
                className="h-7 border border-border bg-background px-1 text-xs"
                aria-label="Rows per page"
              >
                <option value={pageSize}>{pageSize}</option>
              </select>
              <button
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                disabled={safePage <= 1}
                className="border border-border px-2 py-1 hover:bg-surface disabled:opacity-40"
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="text-foreground">
                {safePage} / {pageCount}
              </span>
              <button
                onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
                disabled={safePage >= pageCount}
                className="border border-border px-2 py-1 hover:bg-surface disabled:opacity-40"
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
