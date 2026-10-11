import postgres from "postgres";
import { shopDbNames, type ShopDatabase, type ShopDbProvider } from "@/lib/neon";

/** Stand-in for Neon: creates a real role + database on a local Postgres. */
export class LocalPgProvider implements ShopDbProvider {
  createCalls = 0;
  created: { databaseName: string; roleName: string }[] = [];

  constructor(private readonly adminUrl: string) {}

  private url(db: string, role: string): string {
    const u = new URL(this.adminUrl);
    u.username = role;
    u.password = "pw";
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
      await admin.unsafe(`create role "${roleName}" login password 'pw'`);
      await admin.unsafe(`create database "${databaseName}" owner "${roleName}"`);
    } finally {
      await admin.end();
    }
    this.created.push({ databaseName, roleName });
    const url = this.url(databaseName, roleName);
    return { databaseName, roleName, pooledUrl: url, directUrl: url };
  }

  async dropShopDatabase(databaseName: string, roleName: string): Promise<void> {
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
