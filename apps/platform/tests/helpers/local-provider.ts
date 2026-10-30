import postgres from "postgres";
import { shopDbNames, type ShopDatabase, type ShopDbProvider } from "@/lib/neon";

/**
 * Stand-in for Neon: creates a real role + database on an admin Postgres.
 * When that Postgres is Neon itself, its control plane enforces password strength
 * on CREATE ROLE, so the stand-in role password must be strong.
 */
const ROLE_PASSWORD = "Ax8m-Qv4Tn2-Kw9Rp6Jz5-Lb3Fd7Hs-Yc1";

export class LocalPgProvider implements ShopDbProvider {
  createCalls = 0;
  dropCalls = 0;
  created: { databaseName: string; roleName: string }[] = [];

  constructor(private readonly adminUrl: string) {}

  private url(db: string, role: string): string {
    const u = new URL(this.adminUrl);
    u.username = role;
    u.password = ROLE_PASSWORD;
    u.pathname = `/${db}`;
    return u.toString();
  }

  async createShopDatabase(slug: string): Promise<ShopDatabase> {
    this.createCalls++;
    const { databaseName, roleName } = shopDbNames(slug);
    const admin = postgres(this.adminUrl, { max: 1 });
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`);
      await admin.unsafe(`drop role if exists "${roleName}"`);
      await admin.unsafe(`create role "${roleName}" login password '${ROLE_PASSWORD}'`);
      // Postgres 16 grants the creator ADMIN OPTION but not membership; Neon requires
      // SET ROLE (i.e. membership) before CREATE DATABASE ... OWNER can succeed.
      await admin.unsafe(`grant "${roleName}" to current_user`);
      await admin.unsafe(`create database "${databaseName}" owner "${roleName}"`);
    } finally {
      await admin.end();
    }
    this.created.push({ databaseName, roleName });
    const url = this.url(databaseName, roleName);
    return { databaseName, roleName, pooledUrl: url, directUrl: url };
  }

  async dropShopDatabase(databaseName: string, roleName: string): Promise<void> {
    this.dropCalls++;
    const admin = postgres(this.adminUrl, { max: 1 });
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`);
      await admin.unsafe(`drop role if exists "${roleName}"`);
    } finally {
      await admin.end();
    }
  }

  shopUrl(slug: string): string {
    const { databaseName, roleName } = shopDbNames(slug);
    return this.url(databaseName, roleName);
  }
}

export function adminUrlFromEnv(): string {
  const u = new URL(process.env.DATABASE_URL!);
  u.pathname = "/postgres";
  return u.toString();
}
