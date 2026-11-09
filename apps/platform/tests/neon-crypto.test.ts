import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { NeonApiProvider, NeonError, directFromPooled, shopDbNames } from "@/lib/neon";
import { sanitizeError } from "@/lib/provision";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/shop-seed-data";
import { generateTempPassword } from "@/lib/shop-seed";

process.env.SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

describe("secrets at rest", () => {
  test("round trips and never stores plaintext", () => {
    const url = "postgresql://shop_a:pw@ep-x-pooler.neon.tech/shop_a?sslmode=require";
    const enc = encryptSecret(url);
    expect(enc).not.toContain("shop_a");
    expect(decryptSecret(enc)).toBe(url);
    expect(encryptSecret(url)).not.toBe(enc); // random IV
  });

  test("tampering, truncation and wrong key are rejected", () => {
    const enc = encryptSecret("secret");
    const parts = enc.split(".");
    const flipped = [...parts.slice(0, 3), Buffer.from("tampered").toString("base64url")].join(".");
    expect(() => decryptSecret(flipped)).toThrow();
    expect(() => decryptSecret("garbage")).toThrow("Malformed");
    const prev = process.env.SECRETS_KEY;
    process.env.SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(enc)).toThrow();
    process.env.SECRETS_KEY = Buffer.alloc(16, 1).toString("base64");
    expect(() => encryptSecret("x")).toThrow("32 bytes");
    delete process.env.SECRETS_KEY;
    expect(() => encryptSecret("x")).toThrow("SECRETS_KEY is required");
    process.env.SECRETS_KEY = prev;
  });
});

describe("helpers", () => {
  test("direct host is derived from the pooled host", () => {
    expect(directFromPooled("postgresql://u:p@ep-a-b-123-pooler.c-4.ap-southeast-1.aws.neon.tech/db?sslmode=require")).toBe(
      "postgresql://u:p@ep-a-b-123.c-4.ap-southeast-1.aws.neon.tech/db?sslmode=require",
    );
    expect(directFromPooled("postgres://u:p@localhost:5432/db")).toBe("postgres://u:p@localhost:5432/db");
  });

  test("shop database names", () => {
    expect(shopDbNames("nur-mobile")).toEqual({ databaseName: "shop_nur_mobile", roleName: "shop_nur_mobile" });
  });

  test("errors are scrubbed of connection strings and tokens", () => {
    const msg = sanitizeError(new Error("connect failed postgresql://u:secretpw@host/db?x=1 token npg_AbC123"));
    expect(msg).not.toContain("secretpw");
    expect(msg).not.toContain("npg_AbC123");
    expect(msg).toContain("[redacted-url]");
  });

  test("temp passwords are 14 chars from the safe alphabet and differ", () => {
    const a = generateTempPassword();
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
    expect(generateTempPassword()).not.toBe(a);
  });

  test("expense category defaults match the store app seed", () => {
    const file = fs.readFileSync(path.resolve(process.cwd(), "../store/src/db/seed-expense-categories.ts"), "utf8");
    const storeCodes = [...file.matchAll(/code:\s*"([^"]+)"/g)].map((m) => m[1]).sort();
    expect((DEFAULT_EXPENSE_CATEGORIES.map((c) => c.code) as string[]).sort()).toEqual(storeCodes);
    expect(storeCodes.length).toBe(26);
  });
});

interface Call { method: string; path: string; body?: any; auth?: string }

function makeFetch(opts: { uriPassword?: boolean; rolePassword?: string; roleOpStatus?: string; roleStatus?: number; stuck?: boolean; resetPassword?: string } = {}) {
  const calls: Call[] = [];
  let polls = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  const fetchImpl = (async (input: any, init: any) => {
    const u = new URL(String(input));
    const p = u.pathname.replace("/api/v2", "") + u.search;
    calls.push({ method: init.method, path: p, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization });
    if (init.method === "GET" && p === "/projects/proj-1/branches") return json({ branches: [{ id: "br-2" }, { id: "br-main", default: true }] });
    if (init.method === "POST" && p.endsWith("/roles")) {
      if (opts.roleStatus) return json({ message: "role already exists" }, opts.roleStatus);
      return json({ role: { name: "x", password: opts.rolePassword }, operations: [{ id: "op-role", status: opts.roleOpStatus ?? "running" }] });
    }
    if (init.method === "POST" && p.endsWith("/reset_password")) {
      return json({ role: { name: "x", password: opts.resetPassword }, operations: [{ id: "op-role", status: "finished" }] });
    }
    if (init.method === "GET" && p.endsWith("/operations/op-role")) {
      polls++;
      return json({ operation: { status: opts.stuck ? "running" : polls < 2 ? "running" : "finished" } });
    }
    if (init.method === "POST" && p.endsWith("/databases")) return json({ operations: [{ id: "op-db", status: "finished" }] });
    if (init.method === "GET" && p.startsWith("/projects/proj-1/connection_uri")) {
      const pooled = u.searchParams.get("pooled") === "true";
      const cred = opts.uriPassword === false ? "shop_nur_mobile" : "shop_nur_mobile:secretpw";
      return json({ uri: `postgresql://${cred}@ep-abc${pooled ? "-pooler" : ""}.c-4.ap-southeast-1.aws.neon.tech/shop_nur_mobile?sslmode=require` });
    }
    if (init.method === "DELETE" && p.includes("/databases/")) return json({ message: "not found" }, 404);
    if (init.method === "DELETE" && p.includes("/roles/")) return json({ operations: [{ id: "op-x", status: "finished" }] });
    return json({ message: "unexpected " + p }, 500);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl, polls: () => polls };
}

const cfg = (fetchImpl: typeof fetch, extra: object = {}) => ({ apiKey: "key-123", projectId: "proj-1", fetchImpl, pollMs: 1, ...extra });

describe("Neon API provider (mocked HTTP)", () => {
  test("creates role then database on the default branch and returns both URLs", async () => {
    const m = makeFetch();
    const p = new NeonApiProvider(cfg(m.fetchImpl));
    const r = await p.createShopDatabase("nur-mobile");
    expect(r.databaseName).toBe("shop_nur_mobile");
    expect(r.pooledUrl).toContain("-pooler");
    expect(r.directUrl).not.toContain("-pooler");
    expect(r.pooledUrl).toContain("secretpw");

    const order = m.calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);
    expect(order.indexOf("POST /projects/proj-1/branches/br-main/roles")).toBeLessThan(order.indexOf("POST /projects/proj-1/branches/br-main/databases"));
    expect(m.calls.every((c) => c.auth === "Bearer key-123")).toBe(true);
    expect(m.calls.find((c) => c.path.endsWith("/roles"))!.body).toEqual({ role: { name: "shop_nur_mobile" } });
    expect(m.calls.find((c) => c.path.endsWith("/databases"))!.body).toEqual({ database: { name: "shop_nur_mobile", owner_name: "shop_nur_mobile" } });
    expect(m.polls()).toBe(2); // waited for the running role operation

    await p.createShopDatabase("second");
    expect(m.calls.filter((c) => c.path === "/projects/proj-1/branches").length).toBe(1); // branch cached
  });

  test("uses the role password when the URI has none, and fails clearly when neither has one", async () => {
    const withFallback = makeFetch({ uriPassword: false, rolePassword: "rolepw" });
    const r = await new NeonApiProvider(cfg(withFallback.fetchImpl)).createShopDatabase("nur-mobile");
    expect(r.pooledUrl).toContain("rolepw");
    const none = makeFetch({ uriPassword: false });
    await expect(new NeonApiProvider(cfg(none.fetchImpl)).createShopDatabase("nur-mobile")).rejects.toThrow("without a password");
  });

  test("an existing role from a crashed run is adopted via password reset", async () => {
    const conflict = makeFetch({ roleStatus: 409 as never, resetPassword: "resetpw", uriPassword: false });
    const r = await new NeonApiProvider(cfg(conflict.fetchImpl)).createShopDatabase("x-shop");
    expect(r.pooledUrl).toContain("resetpw");
    const order = conflict.calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);
    expect(order.some((o) => o.endsWith("/reset_password"))).toBe(true);
    expect(order.findIndex((o) => o.endsWith("/roles"))).toBeLessThan(order.findIndex((o) => o.endsWith("/reset_password")));
  });

  test("API errors, failed operations and timeouts surface as NeonError", async () => {
    const boom = makeFetch({ roleStatus: 500 as never });
    const err = await new NeonApiProvider(cfg(boom.fetchImpl)).createShopDatabase("x-shop").catch((e) => e);
    expect(err).toBeInstanceOf(NeonError);
    expect(err.status).toBe(500);

    const failed = makeFetch({ roleOpStatus: "failed" });
    await expect(new NeonApiProvider(cfg(failed.fetchImpl)).createShopDatabase("x-shop")).rejects.toThrow("failed");

    const stuck = makeFetch({ stuck: true });
    await expect(new NeonApiProvider(cfg(stuck.fetchImpl, { timeoutMs: 30 })).createShopDatabase("x-shop")).rejects.toThrow("Timed out");
  });

  test("drop tolerates already-missing objects", async () => {
    const m = makeFetch();
    await new NeonApiProvider(cfg(m.fetchImpl, { branchId: "br-main" })).dropShopDatabase("shop_nur_mobile", "shop_nur_mobile");
    expect(m.calls.map((c) => c.method)).toEqual(["DELETE", "DELETE"]);
  });
});
