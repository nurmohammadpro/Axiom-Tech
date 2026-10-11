import { randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectionUrl } from "@/db/url";
import { hashPassword } from "./auth";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_LOCATION,
  DEFAULT_SUPPLIER_TYPES,
} from "./shop-seed-data";

const PW_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 14-character temporary password without look-alike characters. */
export function generateTempPassword(len = 14): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PW_ALPHABET[bytes[i] % PW_ALPHABET.length];
  return out;
}

export function storeMigrationsDir(): string {
  return process.env.STORE_MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../store/src/db/migrations");
}

/** Applies the store app's Drizzle migrations (same mechanism later used for release rollouts). */
export async function applyStoreMigrations(url: string, dir = storeMigrationsDir()) {
  if (!fs.existsSync(path.join(dir, "meta", "_journal.json"))) {
    throw new Error(`Store migrations not found at ${dir} (set STORE_MIGRATIONS_DIR)`);
  }
  const client = postgres(connectionUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: dir });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export interface ShopSeedInput {
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
}

/**
 * Idempotent: safe to re-run after a partial failure. Returns the temporary owner password
 * only when the owner account was created by this call.
 */
export async function seedShopDatabase(url: string, input: ShopSeedInput): Promise<{ tempPassword: string | null }> {
  const client = postgres(connectionUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await client.begin(async (tx) => {
      const [first, ...rest] = input.ownerName.trim().split(/\s+/);
      const tempPassword = generateTempPassword();
      const inserted = await tx`
        insert into users (email, password_hash, first_name, last_name, phone, role)
        values (${input.ownerEmail}, ${hashPassword(tempPassword)}, ${first || input.ownerName}, ${rest.join(" ") || "Owner"}, ${input.ownerPhone}, 'owner')
        on conflict (email) do nothing
        returning id`;

      await tx`
        insert into store_settings (key, value)
        values ('store_info', ${tx.json({ name: input.shopName, email: input.ownerEmail, phone: input.ownerPhone ?? "" })})
        on conflict (key) do nothing`;

      await tx`
        insert into locations (name, code, is_default, is_active)
        values (${DEFAULT_LOCATION.name}, ${DEFAULT_LOCATION.code}, true, true)
        on conflict (code) do nothing`;

      for (const t of DEFAULT_SUPPLIER_TYPES) {
        await tx`
          insert into supplier_types (name, slug, description, tone, sort_order)
          values (${t.name}, ${t.slug}, ${t.description}, ${t.tone}, ${t.sortOrder})
          on conflict (slug) do nothing`;
      }

      for (const c of DEFAULT_CATEGORIES) {
        await tx`insert into categories (slug, name) values (${c.slug}, ${c.name}) on conflict (slug) do nothing`;
      }
      for (const c of DEFAULT_CATEGORIES) {
        if (!c.parent) continue;
        await tx`
          update categories child set parent_id = parent.id
          from categories parent
          where child.slug = ${c.slug} and parent.slug = ${c.parent} and child.parent_id is null`;
      }

      for (const e of DEFAULT_EXPENSE_CATEGORIES) {
        await tx`
          insert into expense_categories (name, code, icon, color, is_tax_deductible, tds_rate, vat_applicable, sort_order, is_active)
          values (${e.name}, ${e.code}, ${e.icon}, ${e.color}, ${e.isTaxDeductible}, ${e.tdsRate}, ${e.vatApplicable}, ${e.sortOrder}, true)
          on conflict (code) do nothing`;
      }

      return { tempPassword: inserted.length ? tempPassword : null };
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}
