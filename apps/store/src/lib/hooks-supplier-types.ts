import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SupplierType {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  tone: "info" | "success" | "warn" | "muted";
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useSupplierTypes() {
  return useQuery<SupplierType[]>({
    queryKey: ["dashboard", "supplier-types"],
    queryFn: async () => {
      const r = await fetch("/api/dashboard/supplier-types");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || "Failed to fetch supplier types");
      return Array.isArray(j) ? j : [];
    },
  });
}

export function useCreateSupplierType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<SupplierType, "id" | "createdAt" | "updatedAt">) => {
      const r = await fetch("/api/dashboard/supplier-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || "Failed to create");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "supplier-types"] });
    },
  });
}

export function useUpdateSupplierType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<SupplierType> }) => {
      const r = await fetch(`/api/dashboard/supplier-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || j.message || "Failed to update");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "supplier-types"] });
    },
  });
}

export function useDeleteSupplierType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/dashboard/supplier-types/${id}`, {
        method: "DELETE",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "Failed to delete");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", "supplier-types"] });
    },
  });
}
