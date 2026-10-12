export type Role = "super_admin" | "billing" | "support";

export type Permission =
  | "tenant:create"
  | "tenant:payment"
  | "tenant:suspend"
  | "tenant:extend_trial"
  | "tenant:change_plan"
  | "tenant:cancel"
  | "tenant:provision"
  | "tenant:reset_owner"
  | "plans:edit";

const MATRIX: Record<Role, readonly Permission[]> = {
  super_admin: ["tenant:create", "tenant:payment", "tenant:suspend", "tenant:extend_trial", "tenant:change_plan", "tenant:cancel", "tenant:provision", "tenant:reset_owner", "plans:edit"],
  billing: ["tenant:create", "tenant:payment", "tenant:suspend", "tenant:extend_trial", "tenant:change_plan", "tenant:provision"],
  support: ["tenant:extend_trial", "tenant:reset_owner"],
};

export function can(role: Role, p: Permission): boolean {
  return MATRIX[role].includes(p);
}
