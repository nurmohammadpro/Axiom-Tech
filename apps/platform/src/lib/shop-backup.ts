import postgres from "postgres";
import { connectionUrl } from "@/db/url";
import { directFromPooled } from "@/lib/neon";
import { decryptSecret } from "@/lib/crypto";
import type { Tenant } from "@/db/schema";

export interface ShopBackup {
  meta: {
    slug: string;
    shopName: string;
    createdAt: string;
    format: "axiom-json-backup-v1";
  };
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Logical backup of a shop database as JSON: every public table, every row.
 * Downloaded by an admin from the shops list. pg_dump is the better tool for
 * huge shops; this is dependency-free and adequate for typical shop sizes.
 */
export async function backupShopDatabase(t: Tenant): Promise<ShopBackup> {
  if (!t.dbUrlEncrypted) throw new Error("Shop has no database to back up (not provisioned)");
  const url = decryptSecret(t.dbUrlEncrypted);
  const client = postgres(connectionUrl(directFromPooled(url)), { max: 1, prepare: false });
  try {
    const tableRows = await client`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`;
    const tables: Record<string, Record<string, unknown>[]> = {};
    for (const { table_name } of tableRows as unknown as { table_name: string }[]) {
      // Safe: table_name comes from information_schema, never from user input.
      const rows = (await client.unsafe(`select * from "${table_name}"`)) as unknown as Record<string, unknown>[];
      tables[table_name] = rows;
    }
    return {
      meta: {
        slug: t.slug,
        shopName: t.name,
        createdAt: new Date().toISOString(),
        format: "axiom-json-backup-v1",
      },
      tables,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}
