/**
 * Creates and removes one database (plus an owning login role) per shop inside a single
 * Neon project/branch, through the Neon API v2. Each shop gets its own role, so a shop's
 * credentials can only reach that shop's database.
 */

export interface ShopDatabase {
  databaseName: string;
  roleName: string;
  /** Pooled (pgbouncer) URL for runtime. */
  pooledUrl: string;
  /** Direct URL for migrations. */
  directUrl: string;
}

export interface ShopDbProvider {
  createShopDatabase(slug: string): Promise<ShopDatabase>;
  dropShopDatabase(databaseName: string, roleName: string): Promise<void>;
}

export function shopDbNames(slug: string) {
  const base = `shop_${slug.replace(/-/g, "_")}`;
  return { databaseName: base, roleName: base };
}

/** Neon pooled hosts carry a `-pooler` suffix on the endpoint id; the direct host does not. */
export function directFromPooled(url: string): string {
  const u = new URL(url);
  u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
  return u.toString();
}

export interface NeonConfig {
  apiKey: string;
  projectId: string;
  /** Optional; defaults to the project's default branch. */
  branchId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

export class NeonError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "NeonError";
  }
}

export function neonConfigFromEnv(): NeonConfig {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) throw new NeonError("NEON_API_KEY and NEON_PROJECT_ID are required for provisioning");
  return { apiKey, projectId, branchId: process.env.NEON_BRANCH_ID || undefined, baseUrl: process.env.NEON_API_BASE_URL || undefined };
}

type Ops = { id: string; status?: string }[] | undefined;

export class NeonApiProvider implements ShopDbProvider {
  private branchId: string | undefined;
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly cfg: NeonConfig) {
    this.base = (cfg.baseUrl ?? "https://console.neon.tech/api/v2").replace(/\/$/, "");
    this.f = cfg.fetchImpl ?? fetch;
    this.branchId = cfg.branchId;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const msg = (json as { message?: string }).message ?? text.slice(0, 200);
      throw new NeonError(`Neon API ${method} ${path} failed (${res.status}): ${msg}`, res.status);
    }
    return json as T;
  }

  private async branch(): Promise<string> {
    if (this.branchId) return this.branchId;
    const r = await this.call<{ branches: { id: string; default?: boolean; primary?: boolean }[] }>("GET", `/projects/${this.cfg.projectId}/branches`);
    const def = r.branches.find((b) => b.default || b.primary) ?? r.branches[0];
    if (!def) throw new NeonError("Neon project has no branches");
    return (this.branchId = def.id);
  }

  private async waitOperations(ops: Ops) {
    const deadline = Date.now() + (this.cfg.timeoutMs ?? 60_000);
    for (const op of ops ?? []) {
      let status = op.status;
      while (status !== "finished") {
        if (status === "failed" || status === "cancelled" || status === "skipped") throw new NeonError(`Neon operation ${op.id} ${status}`);
        if (Date.now() > deadline) throw new NeonError(`Timed out waiting for Neon operation ${op.id}`);
        await new Promise((r) => setTimeout(r, this.cfg.pollMs ?? 500));
        status = (await this.call<{ operation: { status: string } }>("GET", `/projects/${this.cfg.projectId}/operations/${op.id}`)).operation.status;
      }
    }
  }

  private async uri(branchId: string, databaseName: string, roleName: string, pooled: boolean, rolePassword: string | undefined): Promise<string> {
    const q = new URLSearchParams({ branch_id: branchId, database_name: databaseName, role_name: roleName, pooled: String(pooled) });
    const { uri } = await this.call<{ uri: string }>("GET", `/projects/${this.cfg.projectId}/connection_uri?${q}`);
    const u = new URL(uri);
    if (!u.password) {
      // Fall back to the one-time password returned when the role was created.
      if (!rolePassword) throw new NeonError("Neon returned a connection URI without a password");
      u.password = rolePassword;
    }
    return u.toString();
  }

  async createShopDatabase(slug: string): Promise<ShopDatabase> {
    const { databaseName, roleName } = shopDbNames(slug);
    const p = this.cfg.projectId;
    const b = await this.branch();

    const role = await this.call<{ role?: { password?: string }; operations?: Ops }>("POST", `/projects/${p}/branches/${b}/roles`, { role: { name: roleName } });
    await this.waitOperations(role.operations);
    const db = await this.call<{ operations?: Ops }>("POST", `/projects/${p}/branches/${b}/databases`, {
      database: { name: databaseName, owner_name: roleName },
    });
    await this.waitOperations(db.operations);

    const pw = role.role?.password;
    const [pooledUrl, directUrl] = await Promise.all([
      this.uri(b, databaseName, roleName, true, pw),
      this.uri(b, databaseName, roleName, false, pw),
    ]);
    return { databaseName, roleName, pooledUrl, directUrl };
  }

  async dropShopDatabase(databaseName: string, roleName: string): Promise<void> {
    const p = this.cfg.projectId;
    const b = await this.branch();
    const ignore404 = async (fn: () => Promise<{ operations?: Ops }>) => {
      try {
        await this.waitOperations((await fn()).operations);
      } catch (e) {
        if (!(e instanceof NeonError && e.status === 404)) throw e;
      }
    };
    await ignore404(() => this.call("DELETE", `/projects/${p}/branches/${b}/databases/${encodeURIComponent(databaseName)}`));
    await ignore404(() => this.call("DELETE", `/projects/${p}/branches/${b}/roles/${encodeURIComponent(roleName)}`));
  }
}

export function getShopDbProvider(): ShopDbProvider {
  return new NeonApiProvider(neonConfigFromEnv());
}
