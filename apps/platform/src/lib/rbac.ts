export type Role = "super_admin" | "billing" | "support";

export type Permission =
  | "tenant:create"
  | "tenant:payment"
  | "tenant:suspend"
  | "tenant:extend_trial"
  | "tenant:change_plan"
  | "tenant:cancel"
  | "plans:edit";

const MATRIX: Record<Role, readonly Permission[]> = {
  super_admin: ["tenant:create", "tenant:payment", "tenant:suspend", "tenant:extend_trial", "tenant:change_plan", "tenant:cancel", "plans:edit"],
  billing: ["tenant:create", "tenant:payment", "tenant:suspend", "tenant:extend_trial", "tenant:change_plan"],
  support: ["tenant:extend_trial"],
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[role].includes(p);
}
