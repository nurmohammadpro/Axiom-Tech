export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const TRIAL_DAYS = 7;
/** Days after a paid period ends before a shop is blocked. */
export const GRACE_DAYS = 3;

const RESERVED = new Set([
  "admin", "www", "api", "app", "mail", "smtp", "ftp", "status", "support", "billing",
  "dashboard", "static", "assets", "cdn", "ns1", "ns2", "axiom", "platform", "gate", "login", "signup",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;

export function validateSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new DomainError("Subdomain must be 3-30 characters: letters, numbers and hyphens, not starting or ending with a hyphen");
  }
  if (slug.includes("--")) throw new DomainError("Subdomain cannot contain consecutive hyphens");
  if (RESERVED.has(slug)) throw new DomainError(`"${slug}" is reserved`);
  return slug;
}

export function rootDomain(): string {
  return (process.env.ROOT_DOMAIN || "axiom.appbrainer.tech").toLowerCase();
}

/** Extract the shop slug from a request host, or null when it is not a shop host. */
export function slugFromHost(hostHeader: string, root = rootDomain()): string | null {
  const host = hostHeader.toLowerCase().split(":")[0].replace(/\.$/, "");
  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  return SLUG_RE.test(sub) ? sub : null;
}

export function formatInvoiceNumber(seq: number, createdAt: Date): string {
  return `AXT-${createdAt.getUTCFullYear()}-${String(seq).padStart(5, "0")}`;
}

export function taka(n: number): string {
  return `৳${n.toLocaleString("en-US")}`;
}

/** Bangladesh mobile number: accepts +880/880/0 prefixes, stores 01XXXXXXXXX. */
export function normalizePhone(raw: string): string {
  const p = raw.replace(/[\s-]/g, "");
  const m = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(p);
  if (!m) throw new DomainError("Enter a valid Bangladeshi mobile number, for example 01712345678");
  return `0${m[1]}`;
}
