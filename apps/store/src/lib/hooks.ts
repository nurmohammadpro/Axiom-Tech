import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import type { Category, Product as MockProduct } from "@/data/products";

/** Convert API product fields to mock-data format pages expect */
function toMockProduct(p: api.Product) {
  return {
    ...p,
    brand: p.brand as Category,
    category: p.category as MockProduct["category"],
    price: p.price,
    originalPrice: p.originalPrice,
    color: p.textColor || "#1d1d1f",
    bg: p.bgColor || "#f2f2f4",
  } as MockProduct;
}

// -- Storefront --

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => api.getBrands().then((rows) => rows.map((b) => b.slug)),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api.getCategories(),
  });
}

export function useProducts(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => api.getProducts(params).then((rows) => rows.map(toMockProduct)),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["product", id],
    queryFn: () => api.getProduct(id).then(toMockProduct),
    enabled: !!id,
  });
}

// -- Orders (client portal) --

export function useOrders(userId?: string) {
  return useQuery({
    queryKey: ["orders", userId],
    queryFn: () => api.getOrders(userId!),
    enabled: !!userId,
  });
}

export function useOrder(id?: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api.getOrder(id!),
    enabled: !!id,
  });
}

// -- Profile / Account --

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => api.getProfile(userId!),
    enabled: !!userId,
  });
}

export function useAddresses(userId?: string) {
  return useQuery({
    queryKey: ["addresses", userId],
    queryFn: () => api.getAddresses(userId!),
    enabled: !!userId,
  });
}

// -- Dashboard --

export function useDashboardStats(range: api.DashboardRange = "30d") {
  return useQuery({
    queryKey: ["dashboard", "stats", range],
    queryFn: () => api.getDashboardStats(range),
  });
}

export function useDashboardOrders(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["dashboard", "orders", params],
    queryFn: () => api.getDashboardOrders(params),
  });
}

export function useDashboardProducts(search?: string) {
  return useQuery({
    queryKey: ["dashboard", "products", search],
    queryFn: () => api.getDashboardProducts(search),
  });
}

export function useCustomers(search?: string, channel?: string) {
  return useQuery({
    queryKey: ["dashboard", "customers", search, channel],
    queryFn: () => api.getCustomers(search, channel),
  });
}

export function useInventory() {
  return useQuery({
    queryKey: ["dashboard", "inventory"],
    queryFn: api.getInventory,
  });
}

export function useStaff() {
  return useQuery({
    queryKey: ["dashboard", "staff"],
    queryFn: api.getStaff,
  });
}

export function useAuditLog(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["dashboard", "audit-log", params],
    queryFn: () => api.getAuditLog(params),
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ["dashboard", "campaigns"],
    queryFn: api.getCampaigns,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "campaigns"] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard", "campaigns"] }),
  });
}

export function useCashRegisters() {
  return useQuery({
    queryKey: ["dashboard", "cash-registers"],
    queryFn: api.getCashRegisters,
  });
}

export function useCashStats() {
  return useQuery({
    queryKey: ["dashboard", "cash-stats"],
    queryFn: api.getCashStats,
  });
}

export function useOpenCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.openCashRegister,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "cash-registers"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "cash-stats"] });
    },
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.closeCashRegister,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "cash-registers"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "cash-stats"] });
    },
  });
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["dashboard", "procurement"],
    queryFn: api.getPurchaseOrders,
  });
}

export function useReturns() {
  return useQuery({
    queryKey: ["dashboard", "returns"],
    queryFn: api.getReturns,
  });
}

export function useCustomerReturns(userId?: string) {
  return useQuery({
    queryKey: ["portal", "returns", userId],
    queryFn: () => api.getCustomerReturns(userId!),
    enabled: !!userId,
  });
}

export function useWarranties(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.page !== undefined) qs.set("page", String(params.page));
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: ["warranties", "list", params],
    queryFn: () => fetch("/api/warranties" + (query ? `?${query}` : "")).then((r) => r.json()),
  });
}

export function useWarrantyPolicies() {
  return useQuery({
    queryKey: ["warranties", "policies"],
    queryFn: () => fetch("/api/warranties/policies").then((r) => r.json()),
  });
}

export function useWarrantyClaims(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  if (params?.page !== undefined) qs.set("page", String(params.page));
  if (params?.limit !== undefined) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return useQuery({
    queryKey: ["warranties", "claims", params],
    queryFn: () =>
      fetch("/api/warranties/claims" + (query ? `?${query}` : "")).then((r) => r.json()),
  });
}

export function useWarrantyStats() {
  return useQuery({
    queryKey: ["warranties", "stats"],
    queryFn: async () => {
      const [policies, claims] = await Promise.all([
        fetch("/api/warranties/policies").then((r) => r.json()),
        fetch("/api/warranties/claims").then((r) => r.json()),
      ]);

      const rows = claims.rows ?? claims;
      const openClaims = rows.filter(
        (c: any) => c.status === "requested" || c.status === "diagnosing",
      ).length;
      const resolvedClaims = rows.filter((c: any) => c.status === "resolved").length;

      return {
        openClaims,
        resolvedClaims,
        totalPolicies: policies.length,
        activePolicies: policies.filter((p: any) => p.active).length,
      };
    },
  });
}

export function useWarrantyValidation(identifier?: string) {
  return useQuery({
    queryKey: ["warranties", "validate", identifier],
    queryFn: () => fetch(`/api/warranties/validate?identifier=${identifier}`).then((r) => r.json()),
    enabled: !!identifier,
  });
}

export function useCreateWarrantyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      unitId: string;
      issueDescription: string;
      customerId?: string;
      warrantyId?: string;
      intakeCondition?: string;
    }) =>
      fetch("/api/warranties/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", "claims"] });
      qc.invalidateQueries({ queryKey: ["warranties", "list"] });
      qc.invalidateQueries({ queryKey: ["warranties", "stats"] });
    },
  });
}

export function useUpdateWarrantyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      status?: string;
      diagnosis?: string;
      resolution?: string;
      cost?: number;
      assignedTo?: string;
    }) =>
      fetch(`/api/warranties/claims/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warranties", "claims"] });
      qc.invalidateQueries({ queryKey: ["warranties", "list"] });
      qc.invalidateQueries({ queryKey: ["warranties", "stats"] });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["dashboard", "settings"],
    queryFn: api.getSettings,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "settings"] });
    },
  });
}

export function useReports(params?: { from?: string | null; to?: string | null }) {
  return useQuery({
    queryKey: ["dashboard", "reports", params?.from ?? null, params?.to ?? null],
    queryFn: () => api.getReports(params),
  });
}

export function useLeaveTypes() {
  return useQuery({ queryKey: ["hr", "leave-types"], queryFn: api.getLeaveTypes });
}

export function useLeaves() {
  return useQuery({ queryKey: ["hr", "leaves"], queryFn: api.getLeaves });
}

export function usePayrollRuns() {
  return useQuery({ queryKey: ["hr", "payroll"], queryFn: api.getPayrollRuns });
}

export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: ["hr", "payroll", id],
    queryFn: () => api.getPayrollRun(id as string),
    enabled: !!id,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ["dashboard", "locations"],
    queryFn: api.getLocations,
  });
}

export function useStockTransfers() {
  return useQuery({
    queryKey: ["inventory", "transfers"],
    queryFn: api.getStockTransfers,
  });
}

/** Current user's role + warehouse scope (from /api/auth/me). */
export function useSessionScope() {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUserId(localStorage.getItem("userId"));
    setReady(true);
  }, []);

  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe(userId!),
    enabled: ready && !!userId,
    staleTime: 60_000,
  });
}

// -- Expenses --

export function useExpenses(params?: Record<string, string>) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : "";
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: () =>
      fetch(`/api/dashboard/expenses${params ? "?" + new URLSearchParams(params) : ""}`, {
        headers: { "x-session-token": token || "" },
      }).then((r) => r.json()),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => api.getExpenseCategories(),
  });
}

export function useDailyExpenses(params?: Record<string, string>) {
  const token = typeof window !== "undefined" ? localStorage.getItem("sessionToken") : "";
  return useQuery({
    queryKey: ["daily-expenses", params],
    queryFn: () =>
      fetch(`/api/dashboard/expenses/daily${params ? "?" + new URLSearchParams(params) : ""}`, {
        headers: { "x-session-token": token || "" },
      }).then((r) => r.json()),
  });
}
export function useAuditStats(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["dashboard", "audit-stats", params],
    queryFn: () => api.getAuditStats(params),
  });
}
