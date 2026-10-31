import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", ["trial", "active", "suspended", "cancelled"]);
export const tenantSource = pgEnum("tenant_source", ["admin", "self_signup"]);
export const provisionStatus = pgEnum("provision_status", ["pending", "provisioning", "ready", "failed"]);
export const paymentKind = pgEnum("payment_kind", ["activation", "monthly", "other"]);
export const paymentMethod = pgEnum("payment_method", ["banglaqr", "cash", "bkash", "nagad", "bank", "other"]);
export const invoiceKind = pgEnum("invoice_kind", ["activation", "monthly"]);
export const invoiceStatus = pgEnum("invoice_status", ["due", "paid", "void"]);
export const platformRole = pgEnum("platform_role", ["super_admin", "billing", "support"]);

export const platformUsers = pgTable("platform_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: platformRole("role").notNull().default("support"),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Amounts are whole BDT (taka). */
export const plans = pgTable("plans", {
    /** Soft delete: keeps tenants FK history and survives re-seeding. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  id: text("id").primaryKey(), // starter | growth | pro
  name: text("name").notNull(),
  monthlyPrice: integer("monthly_price").notNull(),
  signupFee: integer("signup_fee").notNull(),
  /** null = unlimited */
  maxStaff: integer("max_staff"),
  maxWarehouses: integer("max_warehouses"),
  /** Store-app feature keys enabled for this plan. */
  features: jsonb("features").$type<string[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerEmail: text("owner_email").notNull(),
    ownerPhone: text("owner_phone"),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: tenantStatus("status").notNull().default("trial"),
    source: tenantSource("source").notNull().default("admin"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
    /** Shop sessions issued before this instant are rejected (set by owner password reset). */
    sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
    provisionStatus: provisionStatus("provision_status").notNull().default("pending"),
    provisionError: text("provision_error"),
    neonProjectId: text("neon_project_id"),
    neonDatabase: text("neon_database"),
    neonRole: text("neon_role"),
    /** AES-GCM encrypted pooled connection URL of the shop database. */
    dbUrlEncrypted: text("db_url_encrypted"),
    /** Per-shop feature overrides over the plan: true = grant, false = revoke, absent = inherit. */
    featureOverrides: jsonb("feature_overrides").$type<Record<string, boolean>>().notNull().default({}),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => platformUsers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenants_status_idx").on(t.status), index("tenants_owner_email_idx").on(t.ownerEmail)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: paymentKind("kind").notNull(),
    amount: integer("amount").notNull(),
    method: paymentMethod("method").notNull(),
    /** BanglaQR / bKash / bank transaction id. */
    reference: text("reference"),
    proofUrl: text("proof_url"),
    months: integer("months").notNull().default(0),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => platformUsers.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    // The same transaction id can never be recorded twice for a method.
    uniqueIndex("payments_method_reference_uq").on(t.method, t.reference),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    seq: integer("seq").generatedAlwaysAsIdentity().notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: invoiceKind("kind").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
    status: invoiceStatus("status").notNull().default("due"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentId: uuid("payment_id").references(() => payments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoices_tenant_idx").on(t.tenantId),
    uniqueIndex("invoices_seq_uq").on(t.seq),
    // One open monthly invoice per shop: generation is idempotent even if two cron runs overlap.
    uniqueIndex("invoices_open_monthly_uq")
      .on(t.tenantId)
      .where(sql`kind = 'monthly' and status = 'due'`),
  ],
);

export const tenantEvents = pgTable(
  "tenant_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => platformUsers.id),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_events_tenant_idx").on(t.tenantId, t.createdAt)],
);

export type Plan = typeof plans.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PlatformUser = typeof platformUsers.$inferSelect;
