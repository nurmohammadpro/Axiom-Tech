import { describe, expect, test } from "bun:test";
import { connectionUrl } from "@/db/url";

describe("connection url", () => {
  test("drops channel_binding but keeps sslmode and credentials", () => {
    const out = connectionUrl("postgresql://u:p@ep-x-pooler.neon.tech/neondb?sslmode=require&channel_binding=require");
    expect(out).toContain("sslmode=require");
    expect(out).not.toContain("channel_binding");
    expect(out).toContain("u:p@ep-x-pooler.neon.tech");
    expect(() => connectionUrl("")).toThrow("DATABASE_URL");
  });
});
