/**
 * Next.js instrumentation hook: runs once per server process start.
 * Fails fast in production when required secrets are missing, and warns about
 * the optional ones whose absence disables a subsystem silently (cron, Neon
 * provisioning). Development stays warning-only so local runs work.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const prod = process.env.NODE_ENV === "production";
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!process.env.PLATFORM_AUTH_SECRET) {
    (prod ? problems : warnings).push("PLATFORM_AUTH_SECRET is not set (admin sessions cannot be signed)");
  }
  if (!process.env.SECRETS_KEY) {
    (prod ? problems : warnings).push("SECRETS_KEY is not set (shop DB URLs cannot be encrypted/decrypted)");
  }
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");

  if (!process.env.GATE_SECRET) warnings.push("GATE_SECRET is not set (store apps cannot call /api/gate)");
  if (!process.env.CRON_SECRET) warnings.push("CRON_SECRET is not set (expiry/invoice cron routes reject every call)");
  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    warnings.push("NEON_API_KEY/NEON_PROJECT_ID not set (shop provisioning disabled)");
  }

  if (warnings.length > 0) {
    console.warn("[axiom-platform] configuration warnings:\n  " + warnings.join("\n  "));
  }
  if (problems.length > 0) {
    throw new Error("[axiom-platform] missing required environment:\n  " + problems.join("\n  "));
  }
}
