/**
 * Tenancy configuration.
 *  - TENANCY_MODE=single (default): one database from DATABASE_URL, no platform gate (local dev, tests).
 *  - TENANCY_MODE=multi: every request host is a shop; the platform gate decides access and
 *    returns that shop's database.
 */
export type TenancyMode = "single" | "multi";

export function tenancyMode(): TenancyMode {
  return process.env.TENANCY_MODE === "multi" ? "multi" : "single";
}

export const SINGLE_TENANT_ID = "single";
/** Request header set ONLY by proxy.ts after the gate passed. Any client-supplied value is overwritten/removed. */
export const TENANT_HEADER = "x-axiom-tenant";
/** Seconds (epoch). Sessions issued before this are revoked. Set by proxy.ts alongside TENANT_HEADER. */
export const VALID_AFTER_HEADER = "x-axiom-valid-after";
