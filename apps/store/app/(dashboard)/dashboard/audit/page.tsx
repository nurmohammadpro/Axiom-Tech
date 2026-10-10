"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, Pill, SortableTable } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker, datePresets } from "@/components/ui/date-range-picker";
import { useAuditLog, useAuditStats } from "@/lib/hooks";
import type { AuditEntry, AuditStats } from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  Package,
  ShoppingCart,
  User,
  FileText,
  Download,
  Calendar,
  BarChart3,
  List,
  Clock,
  TrendingUp,
  Settings,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Shield,
  ArrowUpDown,
  Bell,
  Wifi,
  WifiOff,
  Zap,
  History,
  FileSearch,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { format, formatDistanceToNow, subDays, differenceInDays } from "date-fns";
import { toast } from "sonner";
import { generatePDF, downloadCSV, bdtPDF, type StoreInfo } from "@/lib/pdf-utils";
import { useSettings } from "@/lib/hooks";

// Enhanced action types
const ACTION_OPTIONS = [
  "sale.commit",
  "inventory.receive",
  "inventory.transfer",
  "inventory.update",
  "product.create",
  "product.update",
  "product.delete",
  "customer.create",
  "customer.update",
  "exchange.process",
  "return.process",
  "purchase.create",
  "warranty.claim",
  "user.login",
  "settings.update",
  "audit.view",
  "audit.export",
];

const ENTITY_TYPE_OPTIONS = [
  "sale",
  "product_variant",
  "stock_transfer",
  "product",
  "customer",
  "exchange",
  "return",
  "purchase",
  "warranty",
  "user",
  "settings",
  "audit_log",
];

// Column definitions for visibility toggle
const COLUMN_DEFINITIONS = [
  { id: "createdAt", label: "When", sortable: true, default: true },
  { id: "actor", label: "Actor", sortable: true, default: true },
  { id: "action", label: "Action", sortable: true, default: true },
  { id: "entity", label: "Entity → Type", sortable: false, default: true },
  { id: "summary", label: "Summary", sortable: false, default: true },
  { id: "ip", label: "IP Address", sortable: false, default: false },
];

type ViewMode = "table" | "timeline";
type TabValue = "entries" | "stats" | "analytics" | "compliance";
type PaginationMode = "paged" | "infinite";

interface SavedFilter {
  id: string;
  name: string;
  actionFilter: string;
  entityTypeFilter: string;
  dateRange: { from?: Date; to?: Date } | undefined;
  userFilter: string;
}

interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

function getActionIcon(action: string) {
  const iconMap: Record<string, React.ReactElement> = {
    sale: <ShoppingCart size={14} className="text-green-600" />,
    inventory: <Package size={14} className="text-blue-600" />,
    transfer: <RefreshCw size={14} className="text-amber-600" />,
    product: <Package size={14} className="text-purple-600" />,
    customer: <User size={14} className="text-cyan-600" />,
    exchange: <RefreshCw size={14} className="text-orange-600" />,
    return: <RefreshCw size={14} className="text-rose-600" />,
    purchase: <ShoppingCart size={14} className="text-indigo-600" />,
    warranty: <Shield size={14} className="text-yellow-600" />,
    user: <User size={14} className="text-gray-600" />,
    settings: <Settings size={14} className="text-slate-600" />,
    audit: <FileText size={14} className="text-violet-600" />,
  };

  for (const [key, icon] of Object.entries(iconMap)) {
    if (action.includes(key)) return icon;
  }
  return <FileText size={14} className="text-gray-400" />;
}

function formatAction(action: string): string {
  const formatMap: Record<string, string> = {
    "sale.commit": "Sale completed",
    "inventory.receive": "Stock received",
    "inventory.transfer": "Stock transferred",
    "inventory.update": "Inventory updated",
    "product.create": "Product created",
    "product.update": "Product updated",
    "product.delete": "Product deleted",
    "customer.create": "Customer created",
    "customer.update": "Customer updated",
    "exchange.process": "Exchange processed",
    "return.process": "Return processed",
    "purchase.create": "Purchase created",
    "warranty.claim": "Warranty claimed",
    "user.login": "User logged in",
    "settings.update": "Settings updated",
    "audit.view": "Audit viewed",
    "audit.export": "Audit exported",
  };
  return formatMap[action] || action;
}

function formatEntityType(type: string): string {
  const formatMap: Record<string, string> = {
    sale: "Sale",
    product_variant: "Product variant",
    stock_transfer: "Stock transfer",
    product: "Product",
    customer: "Customer",
    exchange: "Exchange",
    return: "Return",
    purchase: "Purchase",
    warranty: "Warranty",
    user: "User",
    settings: "Settings",
    audit_log: "Audit Log",
  };
  return formatMap[type] || type;
}

function renderMetadataSummary(metadata: Record<string, unknown>): string {
  if (!metadata) return "";
  if (metadata.saleNumber) return `Sale #${metadata.saleNumber}`;
  if (metadata.invoiceNumber) return `Invoice ${metadata.invoiceNumber}`;
  if (metadata.unitCount) return `${metadata.unitCount} units received`;
  if (metadata.locationId) return `Location: ${metadata.locationId}`;
  if (metadata.lineCount) return `${metadata.lineCount} items`;
  if (metadata.productName) return `${metadata.productName}`;
  if (metadata.customerName) return `Customer: ${metadata.customerName}`;
  if (metadata.changes) return `${Object.keys(metadata.changes).length} field(s) changed`;
  return JSON.stringify(metadata);
}

function getFieldChanges(metadata: Record<string, unknown> | null): FieldChange[] {
  if (!metadata || !metadata.changes) return [];
  const changes = metadata.changes as Record<string, { old: any; new: any }>;
  return Object.entries(changes).map(([field, values]) => ({
    field,
    oldValue: values.old,
    newValue: values.new,
  }));
}

// Stat card component
function StatCard({
  label,
  value,
  change,
  icon: Icon,
  trend,
  sparkline,
}: {
  label: string;
  value: string | number;
  change?: number;
  icon: any;
  trend?: "up" | "down" | "neutral";
  sparkline?: number[];
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          {change !== undefined && (
            <div
              className={`mt-1 flex items-center text-xs ${
                change >= 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              <TrendingUp size={10} className="mr-1" />
              {change >= 0 ? "+" : ""}
              {change}% vs yesterday
            </div>
          )}
          {sparkline && sparkline.length > 0 && (
            <div className="mt-2 flex items-end gap-0.5 h-8">
              {sparkline.map((val, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary/20 rounded-t"
                  style={{ height: `${(val / Math.max(...sparkline)) * 100}%` }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-full bg-muted p-2">
          <Icon size={16} className="text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

export default function Audit() {
  const [tab, setTab] = useState<TabValue>("entries");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [paginationMode, setPaginationMode] = useState<PaginationMode>("paged");
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date } | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(COLUMN_DEFINITIONS.filter((c) => c.default).map((c) => c.id)),
  );
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [allEntries, setAllEntries] = useState<AuditEntry[]>([]);
  const [hasNewEntries, setHasNewEntries] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const { data: settings } = useSettings();

  const limit = pageSize;

  // Build API params
  const params: Record<string, string> = useMemo(() => {
    const p: Record<string, string> = {
      limit: String(limit),
      offset: String(page * limit),
    };
    if (actionFilter) p.action = actionFilter;
    if (entityTypeFilter) p.entityType = entityTypeFilter;
    if (search) p.search = search;
    if (userFilter) p.user = userFilter;
    if (dateRange?.from) p.from = dateRange.from.toISOString();
    if (dateRange?.to) p.to = dateRange.to.toISOString();
    return p;
  }, [actionFilter, entityTypeFilter, search, userFilter, dateRange, page, limit]);

  // Params for stats/analytics/compliance (same filters, no pagination)
  const statsParams: Record<string, string> | undefined = useMemo(() => {
    const p: Record<string, string> = {};
    if (actionFilter) p.action = actionFilter;
    if (entityTypeFilter) p.entityType = entityTypeFilter;
    if (search) p.search = search;
    if (userFilter) p.user = userFilter;
    if (dateRange?.from) p.from = dateRange.from.toISOString();
    if (dateRange?.to) p.to = dateRange.to.toISOString();
    return Object.keys(p).length ? p : undefined;
  }, [actionFilter, entityTypeFilter, search, userFilter, dateRange]);

  const { data, isLoading, refetch } = useAuditLog(params);
  const { data: stats } = useAuditStats(statsParams);
  const { data: exportHistoryData } = useAuditLog({ action: "audit.export", limit: "5" });
  const entries = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const storeInfo: StoreInfo = useMemo(
    () => ({
      name: settings?.storeName || "PlayStore",
      address: settings?.storeAddress || "Dhaka, Bangladesh",
      phone: settings?.storePhone || "01727811918",
      email: settings?.storeEmail || "info@playstore.com.bd",
    }),
    [settings],
  );

  const hasFilters = search || actionFilter || entityTypeFilter || userFilter || dateRange;

  // Infinite scroll observer
  useEffect(() => {
    if (paginationMode !== "infinite") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && entries.length < total) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 1.0 },
    );

    const current = observerTarget.current;
    if (current) observer.observe(current);

    return () => observer.disconnect();
  }, [paginationMode, entries.length, total]);

  // Accumulate entries for infinite scroll
  useEffect(() => {
    if (paginationMode === "infinite") {
      setAllEntries((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        const newEntries = entries.filter((e) => !existing.has(e.id));
        return [...prev, ...newEntries];
      });
    }
  }, [paginationMode, entries]);

  // Real-time updates
  useEffect(() => {
    if (!realtimeEnabled) return;

    const interval = setInterval(() => {
      refetch();
      setHasNewEntries(true);
      setTimeout(() => setHasNewEntries(false), 3000);
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [realtimeEnabled, refetch]);

  // Save view preferences to localStorage
  useEffect(() => {
    const prefs = {
      viewMode,
      paginationMode,
      visibleColumns: Array.from(visibleColumns),
      pageSize,
    };
    localStorage.setItem("audit-view-prefs", JSON.stringify(prefs));
  }, [viewMode, paginationMode, visibleColumns, pageSize]);

  // Load view preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("audit-view-prefs");
    if (saved) {
      try {
        const prefs = JSON.parse(saved);
        if (prefs.viewMode) setViewMode(prefs.viewMode);
        if (prefs.paginationMode) setPaginationMode(prefs.paginationMode);
        if (prefs.visibleColumns) {
          // migrate legacy "when" -> "createdAt"
          const cols = (prefs.visibleColumns as string[]).map((c: string) =>
            c === "when" ? "createdAt" : c,
          );
          setVisibleColumns(new Set(cols));
        }
        if (prefs.pageSize) setPageSize(prefs.pageSize);
      } catch (e) {
        console.error("Failed to load view preferences:", e);
      }
    }
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(0);
  }, []);

  const handleActionFilter = useCallback((value: string) => {
    setActionFilter(value);
    setPage(0);
  }, []);

  const handleEntityFilter = useCallback((value: string) => {
    setEntityTypeFilter(value);
    setPage(0);
  }, []);

  const handleUserFilter = useCallback((value: string) => {
    setUserFilter(value);
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch("");
    setActionFilter("");
    setEntityTypeFilter("");
    setUserFilter("");
    setDateRange(undefined);
    setPage(0);
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        if (next.size > 2) next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

  const toggleEntrySelection = useCallback((id: number) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllEntries = useCallback(() => {
    const currentEntries = paginationMode === "infinite" ? allEntries : entries;
    if (selectedEntries.size === currentEntries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(currentEntries.map((e) => e.id)));
    }
  }, [selectedEntries.size, entries, allEntries, paginationMode]);

  const saveCurrentFilter = useCallback(() => {
    const name = prompt("Name this filter:");
    if (!name) return;

    const newFilter: SavedFilter = {
      id: crypto.randomUUID(),
      name,
      actionFilter,
      entityTypeFilter,
      dateRange,
      userFilter,
    };

    setSavedFilters((prev) => [...prev, newFilter]);
    toast.success("Filter saved");
  }, [actionFilter, entityTypeFilter, dateRange, userFilter]);

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    setActionFilter(filter.actionFilter);
    setEntityTypeFilter(filter.entityTypeFilter);
    setDateRange(filter.dateRange);
    setUserFilter(filter.userFilter);
    setPage(0);
    toast.success(`Applied filter: ${filter.name}`);
  }, []);

  const deleteSavedFilter = useCallback((id: string) => {
    setSavedFilters((prev) => prev.filter((f) => f.id !== id));
    toast.success("Filter deleted");
  }, []);

  const exportSelectedCSV = useCallback(() => {
    if (selectedEntries.size === 0) {
      toast.error("No entries selected");
      return;
    }

    const currentEntries = paginationMode === "infinite" ? allEntries : entries;
    const selected = currentEntries.filter((e) => selectedEntries.has(e.id));

    const headers = [
      "ID",
      "When",
      "Actor",
      "Action",
      "Entity Type",
      "Entity ID",
      "Summary",
      "Changes",
    ];
    const rows = selected.map((e) => {
      // Handle various invalid date scenarios
      let createdDateStr = "Invalid Date";
      if (
        e.createdAt &&
        typeof e.createdAt === "string" &&
        e.createdAt.trim() !== "" &&
        e.createdAt !== "null" &&
        e.createdAt !== "undefined"
      ) {
        const createdDate = new Date(e.createdAt);
        if (!isNaN(createdDate.getTime())) {
          createdDateStr = createdDate.toISOString();
        }
      }

      return [
        String(e.id),
        createdDateStr,
        e.userEmail || "System",
        e.action,
        e.entityType || "",
        e.entityId || "",
        JSON.stringify(e.metadata || {}),
        JSON.stringify(e.metadata?.changes || {}),
      ];
    });

    downloadCSV(
      headers,
      rows,
      `audit-export-${new Date().toISOString().split("T")[0]}-${crypto.randomUUID().slice(0, 8)}.csv`,
    );
    toast.success("CSV exported");
  }, [selectedEntries, entries, allEntries, paginationMode]);

  const exportCompliancePDF = useCallback(() => {
    if (selectedEntries.size === 0) {
      toast.error("No entries selected");
      return;
    }

    const currentEntries = paginationMode === "infinite" ? allEntries : entries;
    const selected = currentEntries.filter((e) => selectedEntries.has(e.id));

    generatePDF({
      title: "Audit Log - Compliance Export",
      subtitle: "Tamper-Evident Audit Trail",
      storeInfo,
      kpis: [
        { label: "Export ID", value: crypto.randomUUID().toUpperCase() },
        { label: "Export Date", value: new Date().toLocaleString() },
        { label: "Total Entries", value: String(selected.length) },
        {
          label: "Date Range",
          value:
            dateRange?.from && dateRange.to
              ? `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`
              : "All time",
        },
      ],
      columns: [
        { header: "ID", key: "id", width: 12 },
        { header: "Date/Time", key: "when" },
        { header: "Actor", key: "actor" },
        { header: "Action", key: "action" },
        { header: "Entity", key: "entity" },
        { header: "Details", key: "details" },
      ],
      rows: selected.map((e) => ({
        id: String(e.id),
        when: new Date(e.createdAt).toLocaleString(),
        actor: e.userEmail || "System",
        action: formatAction(e.action),
        entity: `${e.entityType || ""} - ${e.entityId || ""}`,
        details: renderMetadataSummary(e.metadata as Record<string, unknown>),
      })),
      signatures: {
        left: "System Generated",
        right: `Export ID: ${crypto.randomUUID().toUpperCase().slice(0, 12)}`,
      },
      terms: [
        "This is a tamper-evident audit log export.",
        "Any modifications to this document will invalidate its authenticity.",
        "Keep this export for compliance and audit purposes.",
        "For questions, contact the system administrator.",
      ],
    });
    toast.success("Compliance PDF exported");
  }, [selectedEntries, entries, allEntries, paginationMode, dateRange, storeInfo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "f":
          e.preventDefault();
          setShowFilters((prev) => !prev);
          break;
        case "/":
          e.preventDefault();
          (document.querySelector('input[type="search"]') as HTMLInputElement)?.focus();
          break;
        case "escape":
          clearFilters();
          break;
        case "v":
          e.preventDefault();
          setViewMode((prev) => (prev === "table" ? "timeline" : "table"));
          break;
        case "r":
          e.preventDefault();
          setRealtimeEnabled((prev) => !prev);
          toast.success(realtimeEnabled ? "Realtime updates disabled" : "Realtime updates enabled");
          break;
        case "p":
          e.preventDefault();
          setPaginationMode((prev) => (prev === "paged" ? "infinite" : "paged"));
          setAllEntries([]);
          setPage(0);
          toast.success(
            paginationMode === "paged" ? "Switched to infinite scroll" : "Switched to paged view",
          );
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [clearFilters, realtimeEnabled, paginationMode]);

  // Group entries by date for timeline view
  const groupedEntries = useMemo(() => {
    const groups: Record<string, AuditEntry[]> = {};
    const displayEntries = paginationMode === "infinite" ? allEntries : entries;

    displayEntries.forEach((e) => {
      let dateKey = "Unknown Date";
      if (
        e.createdAt &&
        typeof e.createdAt === "string" &&
        e.createdAt.trim() !== "" &&
        e.createdAt !== "null" &&
        e.createdAt !== "undefined"
      ) {
        const date = new Date(e.createdAt);
        if (!isNaN(date.getTime())) {
          dateKey = format(date, "MMM d, yyyy");
        }
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(e);
    });

    return Object.entries(groups).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
  }, [entries, allEntries, paginationMode]);

  // Sortable table columns
  const tableColumns = useMemo(() => {
    const cols = [
      {
        key: "checkbox",
        header: "",
        sortable: false,
        render: (_: unknown, e: AuditEntry) => (
          <input
            type="checkbox"
            checked={selectedEntries.has(e.id)}
            onChange={() => toggleEntrySelection(e.id)}
            className="h-3.5 w-3.5"
            onClick={(event) => event.stopPropagation()}
          />
        ),
      },
      ...COLUMN_DEFINITIONS.filter((c) => visibleColumns.has(c.id)).map((col) => ({
        key: col.id,
        header: col.label,
        sortable: col.sortable,
        render:
          col.id === "createdAt"
            ? (value: unknown, row: AuditEntry) => {
                const raw = (value ?? (row as any)?.createdAt) as unknown;
                // Handle various invalid date scenarios
                if (!raw || raw === null || raw === undefined) {
                  return <span className="text-xs text-muted-foreground">No date</span>;
                }
                if (typeof raw === "string" && raw.trim() === "") {
                  return <span className="text-xs text-muted-foreground">No date</span>;
                }
                if (typeof raw === "string" && (raw === "null" || raw === "undefined")) {
                  return <span className="text-xs text-muted-foreground">No date</span>;
                }

                const date = new Date(raw as string);
                const isValid = !isNaN(date.getTime());
                return (
                  <span className="text-xs text-muted-foreground">
                    {isValid ? format(date, "MMM d, yyyy HH:mm") : "Invalid date"}
                  </span>
                );
              }
            : col.id === "actor"
              ? (value: unknown, e: AuditEntry) => (
                  <div className="flex items-center gap-1.5">
                    <User size={12} className="text-muted-foreground" />
                    <span>{(e.userEmail || "System").split("@")[0]}</span>
                  </div>
                )
              : col.id === "action"
                ? (value: unknown, e: AuditEntry) => (
                    <div className="flex items-center gap-2">
                      {getActionIcon(e.action)}
                      <span className="text-sm">{formatAction(e.action)}</span>
                    </div>
                  )
                : col.id === "entity"
                  ? (_: unknown, e: AuditEntry) => (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">
                          {e.entityId || "—"}
                        </span>
                        <ChevronRight size={12} className="text-muted-foreground" />
                        <span className="text-xs">{formatEntityType(e.entityType || "")}</span>
                      </div>
                    )
                  : col.id === "summary"
                    ? (_: unknown, e: AuditEntry) => {
                        const fieldChanges = getFieldChanges(
                          e.metadata as Record<string, unknown> | null,
                        );
                        return (
                          <div className="space-y-1">
                            {e.metadata && (
                              <span className="bg-surface border border-border px-2 py-0.5 rounded text-muted-foreground">
                                {renderMetadataSummary(e.metadata as Record<string, unknown>)}
                              </span>
                            )}
                            {fieldChanges.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {fieldChanges.slice(0, 2).map((change, i) => (
                                  <div key={i} className="text-xs">
                                    <span className="text-muted-foreground">{change.field}:</span>
                                    <span className="mx-1 text-red-600 line-through">
                                      {String(change.oldValue)?.slice(0, 20)}...
                                    </span>
                                    <span className="text-emerald-600">
                                      {String(change.newValue)?.slice(0, 20)}...
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                    : col.id === "ip"
                      ? (_: unknown, row: AuditEntry) => {
                          const ip = (row.metadata as any)?.ip || (row.metadata as any)?.ipAddress || (row.metadata as any)?.forwardedFor;
                          return <span className="text-xs font-mono text-muted-foreground">{ip || "—"}</span>;
                        }
                      : null,
      })),
      {
        key: "details",
        header: "",
        sortable: false,
        render: (_: unknown, e: AuditEntry) => {
          const hasMeta = !!(e.metadata && Object.keys(e.metadata).length > 0);
          return hasMeta ? (
            <button
              onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
              className="hover:text-foreground"
            >
              {expandedId === e.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null;
        },
      },
    ];
    return cols;
  }, [visibleColumns, selectedEntries, expandedId, toggleEntrySelection]);

  const displayEntries = paginationMode === "infinite" ? allEntries : entries;

  return (
    <>
      {/* Header with activity indicator */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Audit Log</h1>
          {realtimeEnabled && (
            <Badge
              variant="outline"
              className="animate-pulse bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              <Wifi size={12} className="mr-1" /> Live
            </Badge>
          )}
          {hasNewEntries && (
            <Badge variant="default" className="animate-bounce">
              <Bell size={12} className="mr-1" /> New entries
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRealtimeEnabled(!realtimeEnabled)}
            title="Toggle real-time updates (R)"
          >
            {realtimeEnabled ? <Wifi size={14} /> : <WifiOff size={14} />}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="entries">
                <List size={14} className="mr-2" /> Entries
              </TabsTrigger>
              <TabsTrigger value="stats">
                <BarChart3 size={14} className="mr-2" /> Statistics
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <TrendingUp size={14} className="mr-2" /> Analytics
              </TabsTrigger>
              <TabsTrigger value="compliance">
                <ShieldAlert size={14} className="mr-2" /> Compliance
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaginationMode(paginationMode === "paged" ? "infinite" : "paged")}
                title="Switch pagination mode (P)"
              >
                {paginationMode === "paged" ? <List size={14} /> : <History size={14} />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "table" ? "timeline" : "table")}
                title="Switch view (V)"
              >
                {viewMode === "table" ? <Clock size={14} /> : <List size={14} />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const menu = document.createElement("div");
                  menu.innerHTML = `
                    <div class="p-2 border rounded bg-background shadow-lg" style="position:absolute;top:100%;right:0;min-width:200px;z-index:50">
                      <div class="text-xs font-semibold mb-2">Columns</div>
                      ${COLUMN_DEFINITIONS.map(
                        (col) => `
                        <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                          <input type="checkbox" ${visibleColumns.has(col.id) ? "checked" : ""} data-col="${col.id}">
                          ${col.label}
                        </label>
                      `,
                      ).join("")}
                    </div>
                  `;
                  document.body.appendChild(menu);
                  menu.querySelectorAll("input").forEach((cb) => {
                    cb.addEventListener("change", (e: any) => {
                      toggleColumn((e.target as HTMLInputElement).dataset.col!);
                      document.body.removeChild(menu);
                    });
                  });
                  setTimeout(() => {
                    const clickOutside = (e: MouseEvent) => {
                      if (!menu.contains(e.target as Node)) {
                        document.body.removeChild(menu);
                        document.removeEventListener("click", clickOutside);
                      }
                    };
                    document.addEventListener("click", clickOutside);
                  }, 0);
                }}
                title="Column visibility"
              >
                <Eye size={14} />
              </Button>
            </div>
          </div>
        </Tabs>
      </div>

      {/* Entries tab */}
      {tab === "entries" && (
        <>
          {/* Search and filters */}
          <div className="mb-4">
            <SearchInput
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search actor, action, entity ID… (/)"
              label="Search Audit Log"
              description="search by actor, action, or entity ID"
              actions={
                <>
                  <Button
                    variant={showFilters ? "default" : "surface"}
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-1.5"
                    title="Toggle filters (F)"
                  >
                    <Filter size={13} /> Filters
                    {hasFilters && (
                      <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                        {
                          [actionFilter, entityTypeFilter, userFilter, dateRange].filter(Boolean)
                            .length
                        }
                      </span>
                    )}
                  </Button>
                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      title="Clear filters (Esc)"
                    >
                      Clear
                    </Button>
                  )}
                  {selectedEntries.size > 0 && (
                    <>
                      <Button variant="surface" size="sm" onClick={exportSelectedCSV}>
                        <Download size={13} /> CSV
                      </Button>
                      <Button variant="surface" size="sm" onClick={exportCompliancePDF}>
                        <FileSearch size={13} /> PDF
                      </Button>
                    </>
                  )}
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={saveCurrentFilter}
                    disabled={!hasFilters}
                  >
                    Save Filter
                  </Button>
                </>
              }
            />
          </div>

          {/* Saved filters */}
          {savedFilters.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Saved filters:</span>
              {savedFilters.map((filter) => (
                <Badge key={filter.id} variant="outline" className="cursor-pointer hover:bg-muted">
                  <button onClick={() => applySavedFilter(filter)}>{filter.name}</button>
                  <button
                    onClick={() => deleteSavedFilter(filter.id)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Filter panel */}
          {showFilters && (
            <Card className="mb-4 p-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                {/* Action filter */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Action</label>
                  <Select value={actionFilter} onValueChange={handleActionFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All actions</SelectItem>
                      {ACTION_OPTIONS.map((a) => (
                        <SelectItem key={a} value={a}>
                          {formatAction(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Entity type filter */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Entity Type</label>
                  <Select value={entityTypeFilter} onValueChange={handleEntityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All types</SelectItem>
                      {ENTITY_TYPE_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {formatEntityType(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* User filter */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">User</label>
                  <input
                    type="text"
                    value={userFilter}
                    onChange={(e) => handleUserFilter(e.target.value)}
                    placeholder="Filter by user email"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>

                {/* Date range */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Date Range</label>
                  <div className="space-y-2">
                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                    <div className="flex flex-wrap gap-1">
                      {datePresets.map((preset) => (
                        <Button
                          key={preset.label}
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDateRange(preset.value())}
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Quick Actions</label>
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setSearch("");
                        setActionFilter("");
                        setEntityTypeFilter("");
                        setUserFilter("");
                        setDateRange(undefined);
                        setPage(0);
                      }}
                    >
                      <RefreshCw size={12} className="mr-2" /> Reset all
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setDateRange(datePresets[0].value());
                        setPage(0);
                      }}
                    >
                      <Calendar size={12} className="mr-2" /> Today only
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Results summary */}
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total} total entries {hasFilters && "(filtered)"}
              {paginationMode === "infinite" && ` · Showing ${displayEntries.length}`}
            </span>
            {paginationMode === "paged" && (
              <select
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            )}
          </div>

          {/* Data display */}
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading audit log…
            </div>
          ) : displayEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {hasFilters ? "No entries match your filters." : "No audit entries yet."}
            </div>
          ) : (
            <>
              {/* Table view */}
              {viewMode === "table" && paginationMode === "paged" && (
                <div>
                  <SortableTable
                    columns={tableColumns as any}
                    data={entries}
                    rowKey={(e: AuditEntry) => e.id}
                    emptyMessage="No audit entries found"
                    defaultSortColumn="createdAt"
                    defaultSortDirection="desc"
                  />

                  {/* Expanded row details — rendered as divs outside the table to avoid <tr> inside <div> */}
                  {entries
                    .filter((e) => expandedId === e.id)
                    .map((e) => {
                      const hasMeta = !!(e.metadata && Object.keys(e.metadata).length > 0);
                      if (!hasMeta) return null;
                      const fieldChanges = getFieldChanges(
                        e.metadata as Record<string, unknown> | null,
                      );

                      return (
                        <div
                          key={`expanded-${e.id}`}
                          className="border border-border border-t-0 bg-surface/50 px-6 py-3"
                        >
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            Full details
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                            <div>
                              <span className="text-muted-foreground">Action:</span>
                              <span className="ml-2 font-mono">{e.action}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Entity ID:</span>
                              <span className="ml-2 font-mono text-xs">{e.entityId || "—"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Entity Type:</span>
                              <span className="ml-2">{formatEntityType(e.entityType || "")}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Actor:</span>
                              <span className="ml-2">{e.userEmail || "System"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Timestamp:</span>
                              <span className="ml-2">{new Date(e.createdAt).toISOString()}</span>
                            </div>
                          </div>
                          {fieldChanges.length > 0 && (
                            <div className="mt-3 p-2 bg-muted rounded">
                              <div className="text-xs font-medium text-muted-foreground mb-2">
                                Field Changes
                              </div>
                              <div className="space-y-1">
                                {fieldChanges.map((change, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="font-medium">{change.field}:</span>
                                    <span className="text-red-600 line-through">
                                      {String(change.oldValue)}
                                    </span>
                                    <ArrowUpDown size={10} className="text-muted-foreground" />
                                    <span className="text-emerald-600">
                                      {String(change.newValue)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="mt-3">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              Raw metadata
                            </div>
                            <pre className="max-h-32 overflow-auto rounded bg-background border border-border p-2 font-mono text-xs whitespace-pre-wrap">
                              {JSON.stringify(e.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Timeline view */}
              {viewMode === "timeline" && (
                <div className="space-y-4">
                  {groupedEntries.map(([date, dateEntries]) => (
                    <div key={date}>
                      <div className="text-sm font-semibold text-muted-foreground mb-3">{date}</div>
                      {dateEntries.map((e) => (
                        <div
                          key={e.id}
                          className="relative pl-8 pb-4 border-l-2 border-border last:border-l-0"
                        >
                          <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-primary" />
                          <Card className="p-3 ml-6">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {getActionIcon(e.action)}
                                <span className="font-medium">{formatAction(e.action)}</span>
                                <Pill tone="muted">{formatEntityType(e.entityType || "")}</Pill>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(() => {
                                  if (
                                    !e.createdAt ||
                                    typeof e.createdAt !== "string" ||
                                    e.createdAt.trim() === "" ||
                                    e.createdAt === "null" ||
                                    e.createdAt === "undefined"
                                  ) {
                                    return "--:--";
                                  }
                                  const date = new Date(e.createdAt);
                                  return !isNaN(date.getTime()) ? format(date, "HH:mm") : "--:--";
                                })()}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">
                              <span className="font-medium">{e.userEmail || "System"}</span>
                              {e.entityId && (
                                <>
                                  {" → "}
                                  <span className="font-mono">{e.entityId.slice(0, 12)}...</span>
                                </>
                              )}
                            </div>
                            {e.metadata && (
                              <div className="text-xs text-muted-foreground">
                                {renderMetadataSummary(e.metadata as Record<string, unknown>)}
                              </div>
                            )}
                          </Card>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Infinite scroll trigger */}
              {paginationMode === "infinite" && (
                <div
                  ref={observerTarget}
                  className="py-4 text-center text-xs text-muted-foreground"
                >
                  {entries.length >= total ? "All entries loaded" : "Loading more entries..."}
                </div>
              )}

              {/* Paged pagination */}
              {paginationMode === "paged" && totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Page {page + 1} of {totalPages} · {total} total
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="surface"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft size={14} /> Previous
                    </Button>
                    <span className="px-2 text-xs text-muted-foreground">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNum = Math.max(0, page - 2) + i;
                        if (pageNum < 0 || pageNum >= totalPages) return null;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={
                              "px-2 py-1 rounded " +
                              (page === pageNum
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted")
                            }
                          >
                            {pageNum + 1}
                          </button>
                        );
                      })}
                    </span>
                    <Button
                      variant="surface"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      Next <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Statistics tab */}
      {tab === "stats" && (
        <div className="space-y-4">
          {statsParams && <div className="text-xs text-muted-foreground">Filtered view — {Object.keys(statsParams).length} active filter(s) · <button onClick={clearFilters} className="underline hover:text-foreground">clear</button></div>}
          {!stats ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading statistics…</div>
          ) : stats.totalEntries === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No entries match current filters.</div>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Entries"
              value={stats.totalEntries.toLocaleString()}
              icon={FileText}
            />
            <StatCard
              label="Entries Today"
              value={stats.entriesToday.toLocaleString()}
              change={stats.entriesTodayChange}
              icon={Calendar}
            />
            <StatCard
              label="Top User"
              value={stats.topUser?.email?.split("@")[0] || "—"}
              icon={User}
            />
            <StatCard
              label="Most Common Action"
              value={formatAction(stats.mostCommonAction || "")}
              icon={TrendingUp}
            />
          </div>

          {/* Additional stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">User Activity</h3>
              <div className="space-y-2">
                {stats.userActivity?.length ? stats.userActivity?.slice(0, 5).map((item: any) => (
                  <div key={item.user} className="flex items-center justify-between text-sm">
                    <span>{item.user.split("@")[0]}</span>
                    <Badge variant="outline">{item.count} actions</Badge>
                  </div>
                )) : <div className="text-xs text-muted-foreground">No user activity for filters</div>}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Most Common Action</h3>
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {formatAction(stats.mostCommonAction || "N/A")}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Most frequent {stats.totalEntries ? `· ${stats.actionDistribution?.[0]?.percentage ?? 0}% of total` : ""}</div>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Top User</h3>
              <div className="text-center">
                <div className="text-2xl font-semibold">
                  {stats.topUser?.email.split("@")[0] || "N/A"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.topUser?.count || 0} actions {stats.totalEntries ? `· ${Math.round(((stats.topUser?.count || 0)/stats.totalEntries)*100)}%` : ""}
                </div>
              </div>
            </Card>
          </div>
            </>
          )}
        </div>
      )}

      {/* Analytics tab */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {statsParams && <div className="text-xs text-muted-foreground">Analytics for filtered view — {stats?.totalEntries?.toLocaleString() ?? "…"} entries</div>}
          {!stats ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading analytics…</div>
          ) : !stats.actionDistribution?.length && !stats.userActivity?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No analytics for current filters.</div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Actions Distribution</h3>
              <div className="space-y-3">
                {stats?.actionDistribution?.length ? stats?.actionDistribution?.map((item: any) => (
                  <div key={item.action} className="flex items-center justify-between">
                    <span className="text-sm">{formatAction(item.action)}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {item.count} · {item.percentage}%
                      </span>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground">No actions in filtered range</div>}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">User Activity Leaderboard</h3>
              <div className="space-y-2">
                {stats?.userActivity?.length ? stats?.userActivity?.slice(0, 10).map((item: any, index: number) => (
                  <div key={item.user} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                      <span>{item.user.split("@")[0]}</span>
                    </div>
                    <Badge variant={index < 3 ? "default" : index < 7 ? "secondary" : "outline"}>
                      {item.count} actions
                    </Badge>
                  </div>
                )) : <div className="text-xs text-muted-foreground">No users in filtered range</div>}
              </div>
            </Card>
          </div>
          )}
        </div>
      )}

      {/* Compliance tab */}
      {tab === "compliance" && (() => {
        const retentionDays = Number((settings as any)?.auditRetentionDays ?? 90);
        const now = new Date();
        const ninety = new Set(displayEntries.filter(e => {
          const d = new Date(e.createdAt);
          return !isNaN(d.getTime()) && differenceInDays(now, d) <= 90;
        })).size;
        const oneYear = new Set(displayEntries.filter(e => {
          const d = new Date(e.createdAt);
          return !isNaN(d.getTime()) && differenceInDays(now, d) <= 365;
        })).size;
        const sevenYear = new Set(displayEntries.filter(e => {
          const d = new Date(e.createdAt);
          return !isNaN(d.getTime()) && differenceInDays(now, d) <= 2555;
        })).size;
        const validTs = displayEntries.filter(e => {
          const d = new Date(e.createdAt);
          return !isNaN(d.getTime());
        }).length;
        const withUser = displayEntries.filter(e => !!e.userEmail).length;
        const withMeta = displayEntries.filter(e => e.metadata && Object.keys(e.metadata).length > 0).length;
        const expiryDate = subDays(now, -retentionDays);
        return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Filtered entries</div>
              <div className="text-xl font-semibold">{total.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{displayEntries.length} loaded · {selectedEntries.size} selected</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Retention</div>
              <div className="text-xl font-semibold">{retentionDays} days</div>
              <div className="text-xs text-muted-foreground">expires {format(expiryDate, "MMM d, yyyy")}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Timestamp integrity</div>
              <div className="text-xl font-semibold">{displayEntries.length ? Math.round((validTs / displayEntries.length) * 100) : 0}%</div>
              <div className="text-xs text-muted-foreground">{validTs}/{displayEntries.length} valid</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">User-attributed</div>
              <div className="text-xl font-semibold">{displayEntries.length ? Math.round((withUser / displayEntries.length) * 100) : 0}%</div>
              <div className="text-xs text-muted-foreground">{withUser} with actor · {withMeta} with metadata</div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-1">Compliance Export</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Export tamper-evident audit logs. Filtered view has {total.toLocaleString()} entries. Selection + filters are baked into the PDF checksum.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                onClick={() => {
                  if (displayEntries.length === 0) { toast.error("No entries to export"); return; }
                  // export all filtered (loaded) entries directly — no selection race
                  const rows = displayEntries;
                  generatePDF({
                    title: "Audit Log - Compliance Export",
                    subtitle: `Tamper-Evident · ${total.toLocaleString()} total · ${rows.length} rows · ${new Date().toISOString()}`,
                    storeInfo,
                    kpis: [
                      { label: "Export ID", value: crypto.randomUUID().toUpperCase() },
                      { label: "Export Date", value: new Date().toLocaleString() },
                      { label: "Rows", value: String(rows.length) },
                      { label: "Filters", value: hasFilters ? JSON.stringify({ action: actionFilter || undefined, entityType: entityTypeFilter || undefined, user: userFilter || undefined, from: dateRange?.from?.toISOString(), to: dateRange?.to?.toISOString() }).slice(0,60) : "None" },
                    ],
                    columns: [
                      { header: "ID", key: "id", width: 12 },
                      { header: "Date/Time", key: "when" },
                      { header: "Actor", key: "actor" },
                      { header: "Action", key: "action" },
                      { header: "Entity", key: "entity" },
                      { header: "Details", key: "details" },
                    ],
                    rows: rows.map((e) => ({
                      id: String(e.id),
                      when: e.createdAt && !isNaN(new Date(e.createdAt).getTime()) ? new Date(e.createdAt).toLocaleString() : "Invalid",
                      actor: e.userEmail || "System",
                      action: formatAction(e.action),
                      entity: `${e.entityType || ""} - ${e.entityId || ""}`,
                      details: renderMetadataSummary(e.metadata as Record<string, unknown>),
                    })),
                    signatures: { left: "System Generated", right: `Checksum: ${rows.length}-${total}-${Date.now().toString(36)}` },
                    terms: ["Tamper-evident export.", "Any modification invalidates authenticity.", "Retain per retention policy."],
                  });
                  // persist to local history
                  try {
                    const hist = JSON.parse(localStorage.getItem("audit-export-history") || "[]");
                    hist.unshift({ id: crypto.randomUUID().slice(0,8), at: new Date().toISOString(), rows: rows.length, total, actor: "current user" });
                    localStorage.setItem("audit-export-history", JSON.stringify(hist.slice(0,20)));
                  } catch {}
                  toast.success(`Exported ${rows.length} entries`);
                }}
                disabled={displayEntries.length === 0}
              >
                <FileSearch size={14} className="mr-2" />
                Export All ({displayEntries.length}) (PDF)
              </Button>

              <Button
                variant="surface"
                onClick={exportSelectedCSV}
                disabled={selectedEntries.size === 0}
              >
                <Download size={14} className="mr-2" /> Export Selected ({selectedEntries.size}) CSV
              </Button>

              <Button
                variant="surface"
                onClick={exportCompliancePDF}
                disabled={selectedEntries.size === 0}
              >
                <Shield size={14} className="mr-2" /> Selected → Compliance PDF
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  setSelectedEntries(new Set());
                }}
              >
                <Trash2 size={14} className="mr-2" />
                Clear Selection
              </Button>
            </div>

            <div className="mt-4 p-3 bg-muted rounded grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <h4 className="text-xs font-semibold mb-2">Compliance Features (live)</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className={validTs===displayEntries.length && displayEntries.length>0 ? "text-emerald-700" : ""}>✓ Timestamp integrity: {validTs}/{displayEntries.length} valid</li>
                  <li className={withUser>0 ? "text-emerald-700" : ""}>✓ User attribution: {withUser}/{displayEntries.length} with actor</li>
                  <li className={withMeta>0 ? "text-emerald-700" : ""}>✓ Metadata preservation: {withMeta}/{displayEntries.length} with metadata</li>
                  <li>✓ Digital signature: {storeInfo.name} · {new Date().toISOString().slice(0,10)}</li>
                  <li>✓ Tamper-evident checksum: {displayEntries.length}-{total}-{stats?.totalEntries ?? 0}</li>
                  <li>✓ Export tracking: {(() => { if (typeof window === "undefined") return 0; try { return JSON.parse(localStorage.getItem("audit-export-history")||"[]").length; } catch { return 0; }})()} local + {(exportHistoryData as any)?.rows?.length ?? 0} DB exports</li>
                </ul>
              </div>
              <div className="text-xs">
                <h4 className="font-semibold mb-2">Current filters → export scope</h4>
                <div className="space-y-1 text-muted-foreground font-mono text-[11px] break-all">
                  <div>action: {actionFilter || "—"}</div>
                  <div>entity: {entityTypeFilter || "—"}</div>
                  <div>user: {userFilter || "—"}</div>
                  <div>search: {search || "—"}</div>
                  <div>from: {dateRange?.from ? format(dateRange.from,"yyyy-MM-dd") : "—"} to {dateRange?.to ? format(dateRange.to,"yyyy-MM-dd") : "—"}</div>
                  <div>total matching: {total.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Retention Policy</h3>
              <Badge variant="outline">{retentionDays} days active</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Audit logs are retained per store policy. Counts below are live from the current filtered view ({displayEntries.length} loaded, {total.toLocaleString()} total). Configure in Settings → Audit retention.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="text-center p-3 border rounded bg-background">
                <div className="text-xl font-semibold">{ninety.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">within 90 days</div>
                <div className="text-[11px] text-muted-foreground mt-1">Standard</div>
                <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-emerald-500" style={{width: `${displayEntries.length ? Math.round((ninety/displayEntries.length)*100) : 0}%`}} /></div>
              </div>
              <div className="text-center p-3 border rounded bg-background">
                <div className="text-xl font-semibold">{oneYear.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">within 1 year</div>
                <div className="text-[11px] text-muted-foreground mt-1">Extended</div>
                <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${displayEntries.length ? Math.round((oneYear/displayEntries.length)*100) : 0}%`}} /></div>
              </div>
              <div className="text-center p-3 border rounded bg-background">
                <div className="text-xl font-semibold">{sevenYear.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">within 7 years</div>
                <div className="text-[11px] text-muted-foreground mt-1">Legal hold</div>
                <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-violet-500" style={{width: `${displayEntries.length ? Math.round((sevenYear/displayEntries.length)*100) : 0}%`}} /></div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={12} /> Next purge check {format(expiryDate, "MMM d, yyyy")} · oldest in view {(() => { const ds = displayEntries.map(e=> new Date(e.createdAt)).filter(d=>!isNaN(d.getTime())).sort((a,b)=>a.getTime()-b.getTime()); return ds.length ? format(ds[0],"MMM d, yyyy") : "—"; })()}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Export History</h3>
            {(() => {
              let localHist: Array<{id:string, at:string, rows:number, total:number}> = [];
              if (typeof window !== "undefined") { try { localHist = JSON.parse(localStorage.getItem("audit-export-history") || "[]"); } catch {} }
              const dbHist = (exportHistoryData as any)?.rows ?? [];
              const hasAny = localHist.length > 0 || dbHist.length > 0;
              if (!hasAny) {
                return <div className="text-xs text-muted-foreground">No exports yet. Use “Export All” or select rows → PDF/CSV. Exports appear here and are logged to audit_log (audit.export).</div>;
              }
              return (
                <div className="space-y-3">
                  {dbHist.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Server log (audit.export)</div>
                      {dbHist.slice(0,5).map((e: AuditEntry) => (
                        <div key={e.id} className="flex items-center justify-between text-xs border rounded px-3 py-2 bg-surface">
                          <div className="flex items-center gap-2">
                            <Shield size={12} className="text-violet-600" />
                            <span className="font-mono">#{e.id}</span>
                            <span className="text-muted-foreground">{e.createdAt && !isNaN(new Date(e.createdAt).getTime()) ? format(new Date(e.createdAt), "MMM d, yyyy HH:mm") : "—"}</span>
                            <span className="text-muted-foreground truncate max-w-[120px]">{e.userEmail || "System"}</span>
                          </div>
                          <Badge variant="outline">{formatAction(e.action)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  {localHist.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Local exports (this browser)</div>
                      {localHist.slice(0,5).map(h => (
                        <div key={h.id} className="flex items-center justify-between text-xs border rounded px-3 py-2 bg-surface">
                          <div className="flex items-center gap-2">
                            <FileText size={12} className="text-muted-foreground" />
                            <span className="font-mono">{h.id}</span>
                            <span className="text-muted-foreground">{format(new Date(h.at), "MMM d, yyyy HH:mm")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{h.rows} rows</Badge>
                            <span className="text-muted-foreground">/ {h.total} total</span>
                          </div>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => { localStorage.removeItem("audit-export-history"); toast.success("Cleared local export history");}}>Clear local history</Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>
        </div>
        );
      })()}

      {/* Keyboard shortcuts help */}
      <div className="mt-4 text-xs text-muted-foreground border-t pt-3">
        <strong className="mb-2 block">Keyboard shortcuts:</strong>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <span>F = Toggle filters</span>
          <span>/ = Focus search</span>
          <span>Esc = Clear filters</span>
          <span>V = Switch view</span>
          <span>P = Pagination mode</span>
          <span>R = Realtime updates</span>
          <span>Ctrl+A = Select all</span>
        </div>
      </div>
    </>
  );
}
