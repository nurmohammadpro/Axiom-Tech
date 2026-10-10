import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  uuid,
  serial,
  unique,
  index,
  bigint,
  decimal,
  date,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("customer"),
  loyaltyPoints: integer("loyalty_points").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").default("Home"),
  fullName: text("full_name").notNull(),
  street: text("street").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  country: text("country").notNull().default("United States"),
  phone: text("phone").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references((): any => categories.id),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  brandId: integer("brand_id").references(() => brands.id),
  categoryId: integer("category_id").references(() => categories.id),
  category: text("category").notNull().default("pre-owned"), // Product category: pre-owned or official
  price: integer("price").notNull(),
  originalPrice: integer("original_price"),
  costPrice: integer("cost_price"),
  costCode: text("cost_code"), // Pricing code for cost (e.g., "A12" = 12,000 Tk)
  dCode: text("d_code"), // D-Code (dealer/discount code)
  sellCode: text("sell_code"), // Pricing code for selling (e.g., "B25" = 25,000 Tk)
  short: text("short").notNull(),
  description: text("description").notNull().default(""),
  bgColor: text("bg_color").default("#f2f2f4"),
  textColor: text("text_color").default("#1d1d1f"),
  productType: text("product_type").notNull().default("new"),
  // Accessories only: when true the item is stock-kept as individual units
  // (inventory_units) with a scannable identity per box — a real serial when
  // the maker provides one, a system-generated PSU- code otherwise.
  trackUnits: boolean("track_units").notNull().default(false),
  publishStatus: text("publish_status").notNull().default("draft"),
  warrantyPolicyId: integer("warranty_policy_id").references(() => warrantyPolicies.id),
  inStock: boolean("in_stock").default(true),
  images: jsonb("images").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  attribute: jsonb("attribute").notNull().default([]),
  sku: text("sku").notNull().unique(),
  costPrice: integer("cost_price"),
  sellingPrice: integer("selling_price").notNull(),
  costCode: text("cost_code"), // Variant-specific cost code
  dCode: text("d_code"), // Variant-specific D-code
  sellCode: text("sell_code"), // Variant-specific sell code
  quantity: integer("quantity").notNull().default(0),
  barcode: text("barcode"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const productSpecs = pgTable(
  "product_specs",
  {
    id: serial("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
  },
  (t) => [unique().on(t.productId, t.label)],
);

// Reusable spec labels maintained by the store owner; the Add/Edit product forms
// offer a quick-pick from these so common rows (Processor, Display, …) don't need
// to be typed from scratch each time. Per-product values still live in product_specs.
export const specTemplates = pgTable("spec_templates", {
  id: serial("id").primaryKey(),
  label: text("label").notNull().unique(),
  sortOrder: integer("sort_order").default(0),
});

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  sku: text("sku").notNull().unique(),
  quantity: integer("quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),
  location: text("location"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  status: text("status").notNull().default("pending"),
  subtotal: integer("subtotal").notNull(),
  shipping: integer("shipping").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  total: integer("total").notNull(),
  shippingAddress: jsonb("shipping_address").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentIntentId: text("payment_intent_id"),
  notes: text("notes"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  qty: integer("qty").notNull(),
  // IMEI tracking (populated at assignment time for serialized products)
  imeiSnapshot: jsonb("imei_snapshot"),
  // Warranty tracking
  warrantyPolicyId: integer("warranty_policy_id").references(() => warrantyPolicies.id),
  warrantySnapshot: jsonb("warranty_snapshot"),
  warrantyStartsAt: timestamp("warranty_starts_at", { withTimezone: true }),
  warrantyExpiresAt: timestamp("warranty_expires_at", { withTimezone: true }),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  carrier: text("carrier").notNull(),
  trackingNo: text("tracking_no").notNull(),
  status: text("status").default("pending"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.userId, t.productId)],
);

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  qty: integer("qty").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const staff = pgTable("staff", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Login link. Nullable — a staff member can be a profile-only record with no
  // system access (they still appear in payroll/HR).
  userId: uuid("user_id")
    .unique()
    .references(() => users.id),
  role: text("role").notNull().default("staff"),
  storeLocation: text("store_location").default("Play Store Downtown"),
  isActive: boolean("is_active").default(true),
  // Name lives here so a profile-only staff member (no login) still has one.
  firstName: text("first_name"),
  lastName: text("last_name"),
  // ── Personal info ──────────────────────────────────────────────────────
  phone: text("phone"),
  personalEmail: text("personal_email"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  address: text("address"),
  city: text("city"),
  nidNumber: text("nid_number"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  photoUrl: text("photo_url"),
  // ── Employment ─────────────────────────────────────────────────────────
  designation: text("designation"),
  department: text("department"),
  joinedAt: date("joined_at"),
  employmentType: text("employment_type").default("full_time"),
  // ── Education & experience (arrays of objects) ─────────────────────────
  education: jsonb("education").default([]),
  experience: jsonb("experience").default([]),
  // ── Payroll ────────────────────────────────────────────────────────────
  employeeCode: text("employee_code"),
  monthlySalary: integer("monthly_salary"), // legacy single figure (kept as fallback)
  basicSalary: integer("basic_salary"),
  housingAllowance: integer("housing_allowance").default(0),
  transportAllowance: integer("transport_allowance").default(0),
  medicalAllowance: integer("medical_allowance").default(0),
  otherAllowance: integer("other_allowance").default(0),
  providentFundRate: integer("provident_fund_rate").default(0), // % of basic
  salaryEffectiveFrom: date("salary_effective_from"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  discountPct: integer("discount_pct"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const cashRegisters = pgTable("cash_registers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  openedBy: uuid("opened_by").references(() => users.id),
  openingBal: integer("opening_bal").notNull().default(0),
  closingBal: integer("closing_bal"),
  /** closingBal − expected cash at close (sales − refunds since openedAt). */
  variance: integer("variance"),
  note: text("note"),
  status: text("status").default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedBy: uuid("closed_by").references(() => users.id),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplier: text("supplier").notNull(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  status: text("status").default("pending"),
  total: integer("total").notNull(),
  locationId: text("location_id"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  poId: text("po_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  variantId: integer("variant_id").references(() => productVariants.id),
  qtyOrdered: integer("qty_ordered").notNull(),
  qtyReceived: integer("qty_received").default(0),
  // Pricing codes
  costCode: text("cost_code"),
  dCode: text("d_code"),
  sellCode: text("sell_code"),
  // Prices
  costPrice: integer("cost_price").notNull().default(0),
  sellPrice: integer("sell_price").notNull().default(0),
  // Device condition (for trade-ins/purchases of used devices)
  category: text("category").default("pre-owned"),
  brandId: integer("brand_id").references(() => brands.id),
  batteryHealth: integer("battery_health"), // 0-100 percentage
  conditionGrade: text("condition_grade"), // e.g., "Good (90-95)"
  // Free-text color captured at purchase intake (stored on the PO only)
  color: text("color"),
});

export const returns = pgTable("returns", {
  id: text("id").primaryKey(),
  // Online returns link to a storefront order; in-store (POS) returns have none.
  orderId: text("order_id").references(() => orders.id),
  orderItemId: integer("order_item_id").references(() => orderItems.id),
  // In-store returns link to the original POS sale so stock can be restored on refund.
  saleId: uuid("sale_id").references(() => sales.id),
  saleLineId: integer("sale_line_id").references(() => saleLines.id),
  // Devices handed over via an exchange have no POS sale line; this links the
  // return to the exchange order so the unit can be restocked and traced.
  exchangeOrderId: uuid("exchange_order_id").references(() => exchangeOrders.id),
  userId: uuid("user_id").references(() => users.id),
  // Where the return originated: "online" (customer portal) or "in_store" (counter).
  channel: text("channel").notNull().default("in_store"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerName: text("customer_name"),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productName: text("product_name"),
  qty: integer("qty").notNull(),
  reason: text("reason"),
  condition: text("condition").default("new"),
  resolutionType: text("resolution_type").default("refund"), // refund, exchange, repair
  status: text("status").default("pending"),
  adminNotes: text("admin_notes"),
  refundAmount: integer("refund_amount"),
  refundId: text("refund_id"),
  // How the refund was issued (cash | card | mobile) and when.
  refundMethod: text("refund_method"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  trackingNumber: text("tracking_number"),
  returnAddress: jsonb("return_address"),
  images: jsonb("images").default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const exchangePolicies = pgTable("exchange_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Value retention as percentage of original price after X months
  month1Value: integer("month_1_value").notNull().default(70), // 70% after 1 month
  month2Value: integer("month_2_value").notNull().default(60), // 60% after 2 months
  month3Value: integer("month_3_value").notNull().default(50), // 50% after 3 months
  month6Value: integer("month_6_value").notNull().default(40), // 40% after 6 months
  month12Value: integer("month_12_value").notNull().default(30), // 30% after 12 months
  // Condition modifiers (percentage adjustment)
  excellentConditionBonus: integer("excellent_condition_bonus").default(5), // +5%
  goodConditionBonus: integer("good_condition_bonus").default(0), // 0%
  fairConditionPenalty: integer("fair_condition_penalty").default(-10), // -10%
  poorConditionPenalty: integer("poor_condition_penalty").default(-25), // -25%
  // Exchange fee (fixed amount in poisha)
  exchangeFee: integer("exchange_fee").default(0), // Optional processing fee
  // Applicability
  minDeviceAge: integer("min_device_age").default(1), // Minimum 1 month old
  maxDeviceAge: integer("max_device_age").default(24), // Maximum 24 months old
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

// ---------------------------------------------------------------------------
// Locations / warehouses (multi-warehouse support)
// ---------------------------------------------------------------------------

// Managed list of warehouses/outlets. Existing inventory rows reference a
// location by NAME via their free-text `location` / `location_id` columns, so
// this table is the registry that drives pickers, validation, and per-location
// stock views while keeping legacy data intact.
export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  address: text("address"),
  phone: text("phone"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Stock transfers between warehouses. Stock moves immediately on creation and
// every line is recorded so the inventory page can show a documented history.
export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  transferNumber: text("transfer_number").notNull().unique(),
  fromLocation: text("from_location").notNull(),
  toLocation: text("to_location").notNull(),
  status: text("status").notNull().default("completed"), // completed | cancelled
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id")
    .notNull()
    .references(() => stockTransfers.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").references(() => productVariants.id),
  unitId: uuid("unit_id").references(() => inventoryUnits.id),
  quantity: integer("quantity").notNull().default(1),
});

// ---------------------------------------------------------------------------
// Canonical catalog (design doc §4.1)
// ---------------------------------------------------------------------------

export const attributes = pgTable("attributes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  dataType: text("data_type").notNull().default("string"),
  scope: text("scope").notNull().default("variant"),
});

export const attributeValues = pgTable("attribute_values", {
  id: serial("id").primaryKey(),
  attributeId: integer("attribute_id")
    .notNull()
    .references(() => attributes.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").default(0),
});

export const variantAttributeValues = pgTable(
  "variant_attribute_values",
  {
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    attributeValueId: integer("attribute_value_id")
      .notNull()
      .references(() => attributeValues.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.variantId, t.attributeValueId)],
);

export const warrantyPolicies = pgTable("warranty_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  durationValue: integer("duration_value").notNull().default(0),
  durationUnit: text("duration_unit").notNull().default("days"), // days | months | years
  coverageType: text("coverage_type").notNull().default("standard"),
  terms: text("terms"),
  exclusions: text("exclusions"),
  active: boolean("active").default(true),
});

export const productMedia = pgTable("product_media", {
  id: serial("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").references(() => productVariants.id, {
    onDelete: "cascade",
  }),
  storageKey: text("storage_key").notNull(),
  altText: text("alt_text"),
  sortOrder: integer("sort_order").default(0),
});

// ---------------------------------------------------------------------------
// Serialized inventory (design doc §4.2)
// ---------------------------------------------------------------------------

// A purchase/receipt batch: one row per variant per receiving event, carrying the
// rate that batch was bought at. FIFO selling consumes the oldest batch first, and
// the batch cost is snapshotted onto sale lines so profit reflects the real rate.
export const inventoryBatches = pgTable(
  "inventory_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchNumber: text("batch_number").notNull().unique(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: text("location_id"),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    source: text("source").notNull().default("manual"), // manual | purchase_order | csv | trade_in | backfill
    unitCost: integer("unit_cost").notNull().default(0),
    quantityReceived: integer("quantity_received").notNull().default(0),
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("inventory_batches_fifo_idx").on(t.variantId, t.locationId, t.receivedAt)],
);

export const inventoryUnits = pgTable(
  "inventory_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id),
    batchId: uuid("batch_id").references(() => inventoryBatches.id),
    unitCode: text("unit_code"),
    barcode: text("barcode"),
    identityType: text("identity_type").notNull().default("imei"),
    imei1: text("imei_1"),
    imei2: text("imei_2"),
    serialNumber: text("serial_number"),
    conditionGrade: text("condition_grade"),
    batteryHealth: integer("battery_health"),
    inspectionStatus: text("inspection_status").default("pending"),
    acquisitionCost: integer("acquisition_cost"),
    currentPrice: integer("current_price"),
    costCode: text("cost_code"),
    dCode: text("d_code"),
    sellCode: text("sell_code"),
    color: text("color"),
    status: text("status").notNull().default("received"),
    warrantyStartAt: timestamp("warranty_start_at", { withTimezone: true }),
    warrantyEndAt: timestamp("warranty_end_at", { withTimezone: true }),
    locationId: text("location_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique().on(t.imei1),
    unique().on(t.serialNumber),
    unique().on(t.unitCode),
    unique().on(t.barcode),
  ],
);

export const unitSpecs = pgTable(
  "unit_specs",
  {
    id: serial("id").primaryKey(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => inventoryUnits.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.unitId, t.label)],
);

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id),
    locationId: text("location_id"),
    availableQty: integer("available_qty").notNull().default(0),
    reservedQty: integer("reserved_qty").notNull().default(0),
    damagedQty: integer("damaged_qty").notNull().default(0),
    inTransitQty: integer("in_transit_qty").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique().on(t.variantId, t.locationId)],
);

export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id").references(() => productVariants.id),
  unitId: uuid("unit_id").references(() => inventoryUnits.id),
  locationId: text("location_id"),
  movementType: text("movement_type").notNull(),
  quantity: integer("quantity").notNull().default(0),
  beforeQty: integer("before_qty"),
  afterQty: integer("after_qty"),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  reason: text("reason"),
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const barcodes = pgTable("barcodes", {
  id: serial("id").primaryKey(),
  value: text("value").notNull().unique(),
  barcodeType: text("barcode_type").notNull(), // unit_label | invoice_verification
  variantId: integer("variant_id").references(() => productVariants.id),
  inventoryUnitId: uuid("inventory_unit_id").references(() => inventoryUnits.id),
  saleId: uuid("sale_id").references(() => sales.id),
  status: text("status").default("active"),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  replacedById: integer("replaced_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Sales and payments (design doc §7) — no due-sale flow (confirmed D4)
// ---------------------------------------------------------------------------

export const sales = pgTable("sales", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleNumber: text("sale_number").notNull().unique(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  barcodeValue: text("barcode_value").unique(),
  channel: text("channel").notNull().default("POS"),
  customerId: uuid("customer_id").references(() => users.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  storeId: text("store_id"),
  registerSessionId: integer("register_session_id").references(() => cashRegisters.id),
  cashierId: uuid("cashier_id").references(() => users.id),
  status: text("status").notNull().default("completed"),
  subtotal: integer("subtotal").notNull(),
  discountAmount: integer("discount_amount").notNull().default(0),
  taxAmount: integer("tax_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  paidAmount: integer("paid_amount").notNull(),
  changeAmount: integer("change_amount").notNull().default(0),
  currency: text("currency").notNull().default("BDT"),
  verificationTokenHash: text("verification_token_hash"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
});

export const saleLines = pgTable("sale_lines", {
  id: serial("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").references(() => productVariants.id),
  inventoryUnitId: uuid("inventory_unit_id").references(() => inventoryUnits.id),
  sku: text("sku"),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  attributesSnapshot: jsonb("attributes_snapshot").default({}),
  imeiSnapshot: jsonb("imei_snapshot").default([]),
  serialSnapshot: text("serial_snapshot"),
  warrantySnapshot: jsonb("warranty_snapshot").default({}),
  warrantyPolicyId: integer("warranty_policy_id").references(() => warrantyPolicies.id),
  warrantyStartsAt: timestamp("warranty_starts_at", { withTimezone: true }),
  warrantyExpiresAt: timestamp("warranty_expires_at", { withTimezone: true }),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  // Cost snapshot at sale time (batch unit cost, or the variant's cost). Freezes
  // COGS so later cost edits don't rewrite historical profit.
  costPrice: integer("cost_price"),
  discountAmount: integer("discount_amount").default(0),
  taxAmount: integer("tax_amount").default(0),
  lineTotal: integer("line_total").notNull(),
});

export const salePayments = pgTable("sale_payments", {
  id: serial("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  method: text("method").notNull(),
  amount: integer("amount").notNull(),
  providerReference: text("provider_reference"),
  status: text("status").default("confirmed"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const saleDocuments = pgTable("sale_documents", {
  id: serial("id").primaryKey(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  version: integer("version").default(1),
  storageKey: text("storage_key"),
  verificationCode: text("verification_code"),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  reprintCount: integer("reprint_count").default(0),
});

// ---------------------------------------------------------------------------
// Warranty and claims (design doc §5)
// ---------------------------------------------------------------------------

export const warranties = pgTable("warranties", {
  id: uuid("id").defaultRandom().primaryKey(),
  saleLineId: integer("sale_line_id").references(() => saleLines.id),
  unitId: uuid("unit_id").references(() => inventoryUnits.id),
  customerId: uuid("customer_id").references(() => users.id),
  policyId: integer("policy_id").references(() => warrantyPolicies.id),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").default("active"),
  termsSnapshot: jsonb("terms_snapshot").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const warrantyClaims = pgTable("warranty_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  warrantyId: uuid("warranty_id").references(() => warranties.id),
  unitId: uuid("unit_id").references(() => inventoryUnits.id),
  customerId: uuid("customer_id").references(() => users.id),
  claimNumber: text("claim_number").notNull(),
  issueDescription: text("issue_description"),
  intakeCondition: text("intake_condition"),
  status: text("status").default("requested"),
  diagnosis: text("diagnosis"),
  resolution: text("resolution"),
  cost: integer("cost"),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  assignedTo: uuid("assigned_to").references(() => users.id),
});

export const warrantyEvents = pgTable("warranty_events", {
  id: serial("id").primaryKey(),
  claimId: uuid("claim_id").references(() => warrantyClaims.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  note: text("note"),
  actorId: uuid("actor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Suppliers and procurement (purchase system)
// ---------------------------------------------------------------------------

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("company"), // company | importer | individual | customer
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  openingBalance: integer("opening_balance").default(0),
  nidNumber: bigint("nid_number", { mode: "number" }), // 10-digit BD NID, searchable
  dob: text("dob"), // ISO YYYY-MM-DD
  nidImages: jsonb("nid_images").default([]), // Cloudinary secure URLs, max 2
  verificationStatus: text("verification_status").default("unverified"), // unverified | verified | rejected
  verificationNotes: text("verification_notes"), // Admin notes on verification decision
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const supplierPayments = pgTable("supplier_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
  amount: integer("amount").notNull(),
  paymentDate: timestamp("payment_date", { withTimezone: true }).defaultNow(),
  paymentMethod: text("payment_method").notNull().default("cash"), // cash | bank_transfer | cheque | bkash | nagad
  reference: text("reference"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const featureSettings = pgTable(
  "feature_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    featureKey: text("feature_key").notNull(),
    role: text("role").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => ({
    uniqueFeatureRole: unique("unique_feature_role").on(table.featureKey, table.role),
  }),
);

// Customers for exchanges and purchases (similar to suppliers but for individual customers)
export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  notes: text("notes"),
  // NID Verification (like suppliers)
  nidNumber: bigint("nid_number", { mode: "number" }),
  dob: text("dob"), // ISO YYYY-MM-DD
  nidImages: jsonb("nid_images").default([]), // Cloudinary secure URLs, max 2
  verificationStatus: text("verification_status").default("unverified"), // unverified | verified | rejected
  verificationNotes: text("verification_notes"),
  isActive: boolean("is_active").default(true),
  totalExchanges: integer("total_exchanges").default(0),
  totalExchangeValue: integer("total_exchange_value").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Exchange orders (combines purchase + order patterns)
export const exchangeOrders = pgTable("exchange_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  // Trade-in details (like receive stock)
  tradeInProductId: text("trade_in_product_id").references(() => products.id),
  tradeInProductVariantId: integer("trade_in_product_variant_id").references(
    () => productVariants.id,
  ),
  tradeInCostCode: text("trade_in_cost_code"),
  tradeInDCode: text("trade_in_d_code"),
  tradeInSellCode: text("trade_in_sell_code"),
  tradeInAgreedValue: integer("trade_in_agreed_value").notNull(),
  tradeInCostPrice: integer("trade_in_cost_price"),
  tradeInSellPrice: integer("trade_in_sell_price"),
  tradeInItems: jsonb("trade_in_items").notNull(), // IMEI, battery, condition data
  // New device details (like order)
  newProductVariantId: integer("new_product_variant_id").references(() => productVariants.id),
  newProductPrice: integer("new_product_price").notNull(),
  newDeviceUnit: jsonb("new_device_unit"), // { imei1, imei2, serial } — the unit handed over
  // Warranty for new device
  newDeviceWarrantyPolicyId: integer("new_device_warranty_policy_id").references(
    () => warrantyPolicies.id,
  ),
  newDeviceWarrantySnapshot: jsonb("new_device_warranty_snapshot"), // Warranty policy snapshot
  newDeviceWarrantyStartsAt: timestamp("new_device_warranty_starts_at", { withTimezone: true }),
  newDeviceWarrantyExpiresAt: timestamp("new_device_warranty_expires_at", { withTimezone: true }),
  // Invoice / barcode identifiers (scannable receipt ref, matches Quick Exchange Lookup)
  invoiceNumber: text("invoice_number"),
  barcodeValue: text("barcode_value"),
  // Payment details
  paymentAmount: integer("payment_amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  paymentReference: text("payment_reference"),
  payments: jsonb("payments"), // split tenders [{ method, amount, reference? }]
  // Location and notes
  locationId: text("location_id"),
  notes: text("notes"),
  status: text("status").default("complete"), // complete | pending | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Expense Management System
// ---------------------------------------------------------------------------

export const expenseCategories = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  parentId: integer("parent_id").references((): any => expenseCategories.id),
  description: text("description"),
  // Display
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  // Tax settings
  isTaxDeductible: boolean("is_tax_deductible").default(false),
  tdsRate: integer("tds_rate").default(0), // Basis points (1000 = 10%)
  vatApplicable: boolean("vat_applicable").default(false),
  // Budget defaults
  defaultBudgetAmount: integer("default_budget_amount"),
  budgetAlertThreshold: integer("budget_alert_threshold").default(80), // Percentage
  // Status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Expense number (auto-generated: EXP-YYMMDD-NNNN)
  expenseNumber: text("expense_number").notNull().unique(),
  // Category
  categoryId: integer("category_id").references(() => expenseCategories.id),
  // Basic info
  name: text("name").notNull(),
  description: text("description"),
  // Amount breakdown (in poisha)
  amount: integer("amount").notNull(),
  vatAmount: integer("vat_amount").default(0),
  tdsAmount: integer("tds_amount").default(0),
  totalAmount: integer("total_amount").notNull(),
  // Currency (for import expenses)
  currency: text("currency").default("BDT"),
  exchangeRate: integer("exchange_rate").default(100), // Rate to BDT (×100)
  originalAmount: integer("original_amount"),
  originalCurrency: text("original_currency"),
  // Date
  expenseDate: timestamp("expense_date", { withTimezone: true }).defaultNow(),
  // Payment
  paymentMethod: text("payment_method").default("cash"), // cash | bkash | nagad | rocket | bank_transfer | cheque
  paymentReference: text("payment_reference"),
  paymentStatus: text("payment_status").default("paid"), // pending | paid | partial | cancelled
  // Payee/Vendor
  payeeName: text("payee_name"),
  payeeType: text("payee_type"), // vendor | employee | utility | government | other
  vendorInvoiceNumber: text("vendor_invoice_number"),
  vendorInvoiceDate: timestamp("vendor_invoice_date", { withTimezone: true }),
  // Approval
  status: text("status").default("approved"), // pending | approved | rejected | cancelled
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvalNotes: text("approval_notes"),
  // Reimbursement
  isReimbursable: boolean("is_reimbursable").default(false),
  reimbursedAmount: integer("reimbursed_amount").default(0),
  reimbursedTo: uuid("reimbursed_to").references(() => users.id),
  reimbursedAt: timestamp("reimbursed_at", { withTimezone: true }),
  // Location/store
  locationId: text("location_id"),
  // Recurring link
  recurringTemplateId: text("recurring_template_id"),
  // Budget tracking
  budgetCategory: text("budget_category"),
  // Attachments
  receiptUrl: text("receipt_url"),
  invoiceUrl: text("invoice_url"),
  attachmentUrls: jsonb("attachment_urls").default([]),
  // Audit
  createdBy: uuid("created_by").references(() => users.id),
  notes: text("notes"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const dailyExpenses = pgTable("daily_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  expenseNumber: text("expense_number").notNull().unique(),
  expenseDate: timestamp("expense_date", { withTimezone: true }).defaultNow(),
  total: integer("total").notNull().default(0),
  paymentMethod: text("payment_method").default("cash"),
  status: text("status").default("paid"), // paid | cancelled
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  locationId: text("location_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const dailyExpenseItems = pgTable("daily_expense_items", {
  id: serial("id").primaryKey(),
  dailyExpenseId: uuid("daily_expense_id")
    .notNull()
    .references(() => dailyExpenses.id, { onDelete: "cascade" }),
  head: text("head").notNull(), // rent, electricity, internet, gas, entertainment, repair, stationary, courier, donation, custom
  customHead: text("custom_head"),
  amount: integer("amount").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const expenseApprovals = pgTable("expense_approvals", {
  id: serial("id").primaryKey(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => users.id),
  level: integer("level").notNull(), // 1 = manager, 2 = owner
  status: text("status").default("pending"), // pending | approved | rejected
  notes: text("notes"),
  actionedAt: timestamp("actioned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const expenseAttachments = pgTable("expense_attachments", {
  id: serial("id").primaryKey(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const pettyCash = pgTable("petty_cash", {
  id: serial("id").primaryKey(),
  fundName: text("fund_name").notNull().default("Petty Cash"),
  locationId: text("location_id"),
  custodianId: uuid("custodian_id").references(() => users.id),
  openingBalance: integer("opening_balance").notNull().default(0),
  currentBalance: integer("current_balance").notNull().default(0),
  lowThreshold: integer("low_threshold").default(500000), // Alert when below ৳5,000
  status: text("status").default("active"), // active | closed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const pettyCashTransactions = pgTable("petty_cash_transactions", {
  id: serial("id").primaryKey(),
  pettyCashId: integer("petty_cash_id")
    .notNull()
    .references(() => pettyCash.id),
  type: text("type").notNull(), // withdrawal | replenishment | expense
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description").notNull(),
  expenseId: uuid("expense_id").references(() => expenses.id),
  referenceNumber: text("reference_number"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const recurringExpenseTemplates = pgTable("recurring_expense_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // Category
  categoryId: integer("category_id").references(() => expenseCategories.id),
  // Amount
  amount: integer("amount").notNull(),
  currency: text("currency").default("BDT"),
  // Frequency
  frequency: text("frequency").notNull(), // daily | weekly | bi_weekly | monthly | quarterly | semi_annual | annual
  // Schedule
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  dayOfMonth: integer("day_of_month"),
  dayOfWeek: text("day_of_week"),
  // Payment
  paymentMethod: text("payment_method"),
  payeeName: text("payee_name"),
  // Escalation (annual increase)
  escalationType: text("escalation_type").default("none"), // none | percentage | fixed
  escalationRate: integer("escalation_rate").default(0),
  // Approval
  requireApproval: boolean("require_approval").default(true),
  approvalLimit: integer("approval_limit").default(0),
  // Assignment
  assignedTo: uuid("assigned_to").references(() => users.id),
  costCenter: text("cost_center"),
  // Alerts
  alertDaysBefore: integer("alert_days_before").default(3),
  // Status
  isActive: boolean("is_active").default(true),
  status: text("status").default("active"), // active | paused | completed | cancelled
  // Audit
  createdBy: uuid("created_by").references(() => users.id),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const scheduledExpenses = pgTable("scheduled_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").references(() => recurringExpenseTemplates.id),
  // Info
  name: text("name").notNull(),
  description: text("description"),
  categoryId: integer("category_id").references(() => expenseCategories.id),
  // Amount
  amount: integer("amount").notNull(),
  actualAmount: integer("actual_amount"),
  // Due
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  // Status
  status: text("status").notNull().default("pending"), // pending | paid | overdue | skipped | cancelled
  // Payment
  paidDate: timestamp("paid_date", { withTimezone: true }),
  paidAmount: integer("paid_amount"),
  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  // Approval
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  // Attachments
  receiptUrl: text("receipt_url"),
  // Audit
  createdBy: uuid("created_by").references(() => users.id),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => expenseCategories.id),
    locationId: text("location_id"),
    periodType: text("period_type").notNull(), // monthly | quarterly | yearly
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    allocatedAmount: integer("allocated_amount").notNull(),
    spentAmount: integer("spent_amount").default(0),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique("budget_category_period_unique").on(
      t.categoryId,
      t.locationId,
      t.periodType,
      t.periodStart,
    ),
  ],
);

export const cashFlowProjections = pgTable(
  "cash_flow_projections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locationId: text("location_id"),
    projectionMonth: timestamp("projection_month", { withTimezone: true }).notNull(),
    monthNumber: integer("month_number").notNull(),
    // Projections
    projectedIncome: integer("projected_income").default(0),
    projectedExpenses: integer("projected_expenses").default(0),
    // Actuals
    actualIncome: integer("actual_income").default(0),
    actualExpenses: integer("actual_expenses").default(0),
    // Breakdown
    incomeBreakdown: jsonb("income_breakdown").default({}),
    expenseBreakdown: jsonb("expense_breakdown").default({}),
    // Balance
    openingBalance: integer("opening_balance").default(0),
    // Status
    isActual: boolean("is_actual").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("cashflow_location_month_unique").on(t.locationId, t.projectionMonth)],
);

// Supplier types - dynamic type management for suppliers
export const supplierTypes = pgTable("supplier_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  tone: text("tone").notNull().default("info"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// HR — leave & payroll (fixed monthly salary + manual adjustments)
// ---------------------------------------------------------------------------

export const leaveTypes = pgTable("leave_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  color: text("color").default("#2563eb"),
  paid: boolean("paid").notNull().default(true),
  annualAllowanceDays: integer("annual_allowance_days").notNull().default(0),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const leaveRequests = pgTable("leave_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id, { onDelete: "cascade" }),
  leaveTypeId: integer("leave_type_id")
    .notNull()
    .references(() => leaveTypes.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: integer("days").notNull().default(1),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const leaveBalances = pgTable(
  "leave_balances",
  {
    id: serial("id").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    leaveTypeId: integer("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    year: integer("year").notNull(),
    totalDays: integer("total_days").notNull().default(0),
    usedDays: integer("used_days").notNull().default(0),
    carriedForward: integer("carried_forward").notNull().default(0),
  },
  (t) => [unique().on(t.staffId, t.leaveTypeId, t.year)],
);

export const payrollRuns = pgTable("payroll_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  status: text("status").notNull().default("draft"), // draft | finalized | paid
  notes: text("notes"),
  totalGross: integer("total_gross").notNull().default(0),
  totalDeductions: integer("total_deductions").notNull().default(0),
  totalNet: integer("total_net").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const payrollItems = pgTable("payroll_items", {
  id: serial("id").primaryKey(),
  payrollRunId: uuid("payroll_run_id")
    .notNull()
    .references(() => payrollRuns.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  baseSalary: integer("base_salary").notNull().default(0),
  allowances: jsonb("allowances").default([]),
  deductions: jsonb("deductions").default([]),
  grossSalary: integer("gross_salary").notNull().default(0),
  totalDeductions: integer("total_deductions").notNull().default(0),
  netSalary: integer("net_salary").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
