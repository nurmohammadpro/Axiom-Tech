const BASE = "";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API ${res.status}`);
  }
  return res.json();
}

export interface Brand {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
}
export interface Category {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
}
export interface ProductAttribute {
  name: string;
  value: string;
}
export interface ProductVariant {
  id: number;
  productId: string;
  name: string;
  attribute: ProductAttribute[];
  sku: string;
  costPrice: number | null;
  sellingPrice: number;
  quantity: number;
}
export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  short: string;
  description: string;
  bgColor: string;
  textColor: string;
  inStock: boolean;
  images: string[];
  sku?: string;
  specs?: { label: string; value: string }[];
  /** Real on-hand stock (available only with ?withStock=1, used by the catalog). */
  available?: number;
  costValue: number;
  retailValue: number;
  estimatedUnits: number;
  stockStatus?: "ok" | "low" | "out";
}
export interface Order {
  id: string;
  userId: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  paymentMethod: string;
  shippingAddress?: Record<string, any>;
  createdAt: string;
  items?: OrderItem[];
  tracking?: Shipment | null;
  customerEmail?: string;
  customerName?: string;
  /** Present on online orders; POS sales carry a UUID id instead. */
  channel?: "Online" | "POS";
  customerPhone?: string;
  notes?: string | null;
  paymentIntentId?: string | null;
  saleNumber?: string;
  invoiceNumber?: string;
  storeId?: string | null;
  paidAmount?: number;
  discountAmount?: number;
  changeAmount?: number;
}
export interface OrderItem {
  id: number;
  productId: string;
  name: string;
  price: number;
  qty: number;
}
export interface Shipment {
  id: number;
  carrier: string;
  trackingNo: string;
  status: string;
  shippedAt?: string;
  deliveredAt?: string;
}
export interface Address {
  id: string;
  userId: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  isDefault: boolean;
}
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: string;
  /** Signed session token (set at signin/signup; persisted client-side). */
  sessionToken?: string;
  loyaltyPoints?: number;
  createdAt: string;
  /** Warehouse this staff member is assigned to (present for managers/salesmen). */
  storeLocation?: string | null;
  staffRole?: string | null;
  isScoped?: boolean;
}
export interface StaffEducation {
  degree?: string;
  institution?: string;
  year?: string;
  result?: string;
}

export interface StaffExperience {
  company?: string;
  role?: string;
  from?: string;
  to?: string;
}

export interface StaffMember {
  id: string;
  userId: string | null;
  role: string;
  storeLocation: string | null;
  isActive: boolean;
  /** True when this staff member has a linked login account. */
  hasAccess: boolean;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  personalEmail?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  nidNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  photoUrl?: string | null;
  designation?: string | null;
  department?: string | null;
  joinedAt?: string | null;
  employmentType?: string | null;
  education?: StaffEducation[];
  experience?: StaffExperience[];
  employeeCode?: string | null;
  monthlySalary?: number | null;
  basicSalary?: number | null;
  housingAllowance?: number | null;
  transportAllowance?: number | null;
  medicalAllowance?: number | null;
  otherAllowance?: number | null;
  providentFundRate?: number | null;
  salaryEffectiveFrom?: string | null;
}

export interface StaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: string;
  storeLocation?: string;
  isActive?: boolean;
  phone?: string;
  personalEmail?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  nidNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  photoUrl?: string;
  designation?: string;
  department?: string;
  joinedAt?: string;
  employmentType?: string;
  education?: StaffEducation[];
  experience?: StaffExperience[];
  employeeCode?: string;
  monthlySalary?: number | string | null;
  basicSalary?: number | string | null;
  housingAllowance?: number | string | null;
  transportAllowance?: number | string | null;
  medicalAllowance?: number | string | null;
  otherAllowance?: number | string | null;
  providentFundRate?: number | string | null;
  salaryEffectiveFrom?: string;
}
export interface DashboardOrder {
  id: string;
  channel: "POS" | "Online";
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  paymentMethod: string;
  payments?: { method: string; amount: number; reference: string | null }[];
  total: number;
  createdAt: string;
  /** Warehouse the POS sale was rung up at (null for online orders). */
  warehouse: string | null;
}
export interface ReportOrderItem {
  name: string;
  qty: number;
  price: number;
  costPrice: number | null;
  productId: string;
}
export interface ReportOrder {
  id: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  status: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  items: ReportOrderItem[];
}
export interface ReportSaleItem {
  name: string;
  sku: string | null;
  qty: number;
  unitPrice: number;
  costPrice: number | null;
  lineTotal: number;
  imeis: string[];
  discountAmount?: number | null;
  categorySlug?: string | null;
}
export interface ReportSale {
  id: string;
  saleNumber: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  status: string;
  warehouse: string | null;
  cashierId: string | null;
  cashierName: string | null;
  paymentMethods: string[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  createdAt: string;
  items: ReportSaleItem[];
}
export interface ReportSummary {
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  preOwnedProfit: number;
  itemsSold: number;
  salesCount: number;
  exchangeValueIn: number;
  exchangeCost: number;
  exchangeProfit: number;
  exchangeCount: number;
  expenses: number;
  netProfit: number;
  from: string | null;
  to: string | null;
}

export interface ReportReturn {
  id: string;
  saleId: string | null;
  orderId: string | null;
  channel: string;
  customerName: string | null;
  productName: string | null;
  qty: number;
  reason: string | null;
  resolutionType: string | null;
  status: string | null;
  refundAmount: number | null;
  refundMethod: string | null;
  createdAt: string;
}

export interface ReportExchange {
  id: string;
  invoiceNumber: string | null;
  customerName: string | null;
  newProductPrice: number;
  tradeInAgreedValue: number;
  status: string | null;
  createdAt: string;
}

export interface ReportsData {
  orders: ReportOrder[];
  posSales: ReportSale[];
  returns: ReportReturn[];
  exchanges: ReportExchange[];
  summary: ReportSummary;
  salesByWarehouse: { warehouse: string; orders: number; revenue: number }[];
  scope: { isScoped: boolean; storeLocation: string | null };
}
export type DashboardRange = "today" | "7d" | "30d" | "all";

export interface TrendPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface TopModel {
  id: string;
  name: string;
  units: number;
  revenue: number;
  margin: number;
}

export interface StockAgingBucket {
  bucket: string;
  units: number;
  value: number;
}

export interface DashboardStats {
  range: DashboardRange;
  rangeLabel: string;
  // Sales & profit (range)
  totalOrders: number;
  totalRevenue: number;
  onlineOrders: number;
  onlineRevenue: number;
  posOrders: number;
  posRevenue: number;
  unitsSold: number;
  aov: number;
  grossRevenue: number;
  discounts: number;
  cogsTotal: number;
  grossProfit: number;
  grossMarginPct: number;
  preOwnedProfit: number;
  exchangeProfit: number;
  expensesTotal: number;
  netProfit: number;
  // Today
  dailySalesRevenue: number;
  dailySalesCount: number;
  newlyStockedCount: number;
  exchangedCount: number;
  exchangedTotal: number;
  returnedCount: number;
  returnedTotal: number;
  // Inventory (point-in-time)
  inventoryCostValue: number;
  unitsOnHand: number;
  lowStockItems: number;
  outOfStockItems: number;
  lowStockSample: { name: string; available: number }[];
  outOfStockSample: { name: string }[];
  stockAging: StockAgingBucket[];
  // Series & breakdowns
  trend: TrendPoint[];
  topModels: TopModel[];
  // Counts
  totalCustomers: number;
  totalProducts: number;
  pendingReturns: number;
  activeCampaigns: number;
  warrantyClaimsOpen: number;
}
export interface Customer {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  channel: "Online" | "POS" | "Both";
  orderCount: number;
  totalSpent: number;
  totalItems: number;
  loyaltyPoints?: number;
  createdAt: string;
}

export interface CustomerPurchaseItem {
  name: string;
  qty: number;
  price: number;
  lineTotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  /** POS items link back to the sale line; online items to the order item. */
  saleLineId?: number | null;
  productId?: string | null;
  variantId?: number | null;
  orderItemId?: number | null;
}
export interface CustomerPurchase {
  id: string;
  channel: string;
  date: string;
  total: number;
  invoiceNumber?: string | null;
  paymentMethod?: string | null;
  items: CustomerPurchaseItem[];
}

export const getCustomerPurchases = (params: {
  customerId?: string;
  phone?: string;
  email?: string;
}) =>
  api<CustomerPurchase[]>("/api/dashboard/customers", {
    method: "POST",
    body: JSON.stringify(params),
  });
export interface InventoryItem {
  variantId: number;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  attribute: ProductAttribute[];
  costPrice: number | null;
  sellingPrice: number;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  quantity: number;
  active: boolean;
  productType: string;
  publishStatus: string;
  inStock: boolean;
  lowStockThreshold: number | null;
  location: string | null;
  warranty: string | null;
  category: string | null;
  brand: string | null;
  requiresUnit: boolean;
  available: number;
  costValue: number;
  retailValue: number;
  estimatedUnits: number;
  barcode?: string | null;
  imei1?: string | null;
  unitIdentities?: string | null;
  imei2?: string | null;
  serialNumber?: string | null;
  unitCode?: string | null;
  units?: {
    imei1: string | null;
    imei2: string | null;
    serialNumber: string | null;
    status: string;
    locationId?: string | null;
  }[];
  /** Per-location stock breakdown, e.g. [{ location: "Main Store", available: 3 }]. */
  byLocation: { location: string; available: number }[];
}

export interface Location {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  unitCount?: number;
  skuCount?: number;
}

// Storefront
export const getBrands = () => api<Brand[]>("/api/brands");
export const createBrand = (data: { name: string; imageUrl?: string }) =>
  api<Brand>("/api/brands", { method: "POST", body: JSON.stringify(data) });
export const updateBrand = (id: number, data: { name: string; imageUrl?: string }) =>
  api<Brand>(`/api/brands/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteBrand = (id: number) =>
  api<{ deleted: boolean }>(`/api/brands/${id}`, { method: "DELETE" });
export const getCategories = () => api<Category[]>("/api/categories");
export const createCategory = (data: { name: string; parentId?: number | null }) =>
  api<Category>("/api/categories", { method: "POST", body: JSON.stringify(data) });
export const updateCategory = (id: number, data: { name: string; parentId?: number | null }) =>
  api<Category>(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCategory = (id: number) =>
  api<{ deleted: boolean }>(`/api/categories/${id}`, { method: "DELETE" });
export interface SpecTemplate {
  id: number;
  label: string;
  sortOrder: number | null;
}
export const getSpecTemplates = () => api<SpecTemplate[]>("/api/spec-templates");
export const createSpecTemplate = (data: { label: string }) =>
  api<SpecTemplate>("/api/spec-templates", { method: "POST", body: JSON.stringify(data) });
export const updateSpecTemplate = (id: number, data: { label: string }) =>
  api<SpecTemplate>(`/api/spec-templates/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteSpecTemplate = (id: number) =>
  api<{ deleted: boolean }>(`/api/spec-templates/${id}`, { method: "DELETE" });
export const getProducts = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return api<Product[]>("/api/products" + qs);
};
export const getProduct = (id: string) => api<Product>(`/api/products/${id}`);

// Orders
export const getOrders = (userId: string) => api<Order[]>(`/api/orders?userId=${userId}`);
export const getOrder = (id: string) => api<Order>(`/api/orders/${encodeURIComponent(id)}`);

// Auth
/**
 * Signed session token from /api/auth/signin|signup — sent as
 * `x-session-token` on calls that need identity outside cookie flows.
 */
export const sessionToken = () => localStorage.getItem("sessionToken") || "";
const authHeaders = () => ({ "x-session-token": sessionToken() });

export const signIn = (data: { email: string; password: string }) =>
  api<UserProfile>("/api/auth/signin", { method: "POST", body: JSON.stringify(data) });
export const getMe = (_userId?: string) =>
  api<UserProfile>("/api/auth/me", { headers: authHeaders() });

// Account
export const getProfile = (_userId?: string) =>
  api<UserProfile>("/api/account/profile", { headers: authHeaders() });
export const getAddresses = (_userId?: string) =>
  api<Address[]>("/api/account/addresses", { headers: authHeaders() });
export const createAddress = (_userId: string | undefined, data: Partial<Address>) =>
  api<Address>("/api/account/addresses", {
    method: "POST",
    body: JSON.stringify(data),
    headers: authHeaders(),
  });

// Dashboard
export const getDashboardStats = (range: DashboardRange = "30d") =>
  api<DashboardStats>(`/api/dashboard/stats?range=${range}`);
export interface OrdersSummary {
  pending: number;
  confirmed: number;
  paymentConfirmed: number;
  sentToCourier: number;
  completed: number;
  returned: number;
  total: number;
  pos: number;
  online: number;
}

export interface OrdersResponse {
  orders: DashboardOrder[];
  summary: OrdersSummary;
  page: number;
  pageSize: number;
  total: number;
}

export const getDashboardOrders = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return api<OrdersResponse>("/api/dashboard/orders" + qs);
};
export const getReports = (params?: { from?: string | null; to?: string | null }) => {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const s = qs.toString();
  return api<ReportsData>("/api/dashboard/reports" + (s ? `?${s}` : ""));
};
export const getDashboardProducts = (search?: string) =>
  api<Product[]>(`/api/dashboard/products${search ? `?search=${search}` : ""}`);
export const getCustomers = (search?: string, channel?: string) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (channel && channel !== "All") params.set("channel", channel.toLowerCase());
  const qs = params.toString();
  return api<Customer[]>(`/api/dashboard/customers${qs ? `?${qs}` : ""}`);
};
export const getInventory = () => api<InventoryItem[]>("/api/dashboard/inventory");

// Locations / warehouses
export const getLocations = () => api<Location[]>("/api/dashboard/locations");
export const createLocation = (data: {
  name: string;
  code?: string;
  address?: string;
  phone?: string;
}) => api<Location>("/api/dashboard/locations", { method: "POST", body: JSON.stringify(data) });
export const updateLocation = (
  id: number,
  data: {
    name?: string;
    code?: string;
    address?: string;
    phone?: string;
    isDefault?: boolean;
    isActive?: boolean;
  },
) => api<Location>(`/api/dashboard/locations/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteLocation = (id: number) =>
  api<{ deleted: boolean }>(`/api/dashboard/locations/${id}`, { method: "DELETE" });
export const toggleVariantActive = (variantId: number, active: boolean) =>
  api<{ variantId: number; active: boolean }>("/api/dashboard/inventory", {
    method: "PATCH",
    body: JSON.stringify({ variantId, active }),
  });
export const updateInventoryVariant = (
  variantId: number,
  data: {
    costPrice?: number | null;
    sellingPrice?: number;
    costCode?: string | null;
    dCode?: string | null;
    sellCode?: string | null;
    quantity?: number;
  },
) =>
  api<{ variantId: number }>("/api/dashboard/inventory", {
    method: "PATCH",
    body: JSON.stringify({ variantId, ...data }),
  });
export const deleteVariant = (variantId: number) =>
  api<{ deleted: boolean; productDeleted: boolean }>("/api/dashboard/inventory", {
    method: "DELETE",
    body: JSON.stringify({ variantId }),
  });
export const deleteProduct = (productId: string) =>
  api<{ success: boolean }>(`/api/dashboard/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
export const deleteProducts = (ids: string[]) =>
  api<{ deleted: string[]; failed: { id: string; error: string }[] }>(
    "/api/dashboard/products/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
export const getStaff = () => api<StaffMember[]>("/api/dashboard/staff");
export const createStaff = (data: StaffInput) =>
  api<StaffMember>("/api/dashboard/staff", { method: "POST", body: JSON.stringify(data) });
export const grantStaffAccess = (
  id: string,
  data: { email: string; password: string; role?: string },
) =>
  api<StaffMember>(`/api/dashboard/staff/${id}/access`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const revokeStaffAccess = (id: string) =>
  api<{ success: boolean; hasAccess: boolean }>(`/api/dashboard/staff/${id}/access`, {
    method: "DELETE",
  });

// -- HR: leave & payroll --

export interface LeaveType {
  id: number;
  name: string;
  code: string;
  color: string | null;
  paid: boolean;
  annualAllowanceDays: number;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface LeaveRequestRow {
  id: string;
  staffId: string;
  staffName: string | null;
  leaveTypeId: number;
  leaveTypeName: string | null;
  paid: boolean | null;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: string;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PayrollLine {
  label: string;
  amount: number;
}

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  notes: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  createdAt: string;
  finalizedAt: string | null;
  paidAt: string | null;
  itemCount?: number;
}

export interface PayrollItemRow {
  id: number;
  staffId: string;
  staffName: string | null;
  baseSalary: number;
  allowances: PayrollLine[] | null;
  deductions: PayrollLine[] | null;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
  notes: string | null;
}

export const getLeaveTypes = () => api<LeaveType[]>("/api/dashboard/hr/leave-types");
export const createLeaveType = (data: Partial<LeaveType>) =>
  api<LeaveType>("/api/dashboard/hr/leave-types", { method: "POST", body: JSON.stringify(data) });
export const updateLeaveType = (data: Partial<LeaveType> & { id: number }) =>
  api<LeaveType>("/api/dashboard/hr/leave-types", { method: "PATCH", body: JSON.stringify(data) });
export const deleteLeaveType = (id: number) =>
  api<{ success: boolean }>(`/api/dashboard/hr/leave-types?id=${id}`, { method: "DELETE" });

export const getLeaves = () => api<LeaveRequestRow[]>("/api/dashboard/hr/leaves");
export const createLeave = (data: {
  staffId: string;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  days?: number;
  reason?: string;
}) =>
  api<LeaveRequestRow>("/api/dashboard/hr/leaves", { method: "POST", body: JSON.stringify(data) });
export const updateLeave = (id: string, status: string) =>
  api<LeaveRequestRow>(`/api/dashboard/hr/leaves/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export const getPayrollRuns = () => api<PayrollRun[]>("/api/dashboard/hr/payroll");
export const generatePayroll = (data: { periodStart: string; periodEnd: string }) =>
  api<{ run: PayrollRun; itemCount: number }>("/api/dashboard/hr/payroll", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const getPayrollRun = (id: string) =>
  api<{ run: PayrollRun; items: PayrollItemRow[] }>(`/api/dashboard/hr/payroll/${id}`);
export const updatePayrollRun = (id: string, status: string) =>
  api<PayrollRun>(`/api/dashboard/hr/payroll/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

export interface StockTransferItem {
  id: number;
  variantId: number | null;
  unitId: string | null;
  quantity: number;
  productName: string | null;
  variantName: string | null;
  sku: string | null;
}
export interface StockTransfer {
  id: number;
  transferNumber: string;
  fromLocation: string;
  toLocation: string;
  status: string;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  createdByName: string | null;
  createdByEmail: string | null;
  items: StockTransferItem[];
}
export const getStockTransfers = () => api<StockTransfer[]>("/api/inventory/transfers");
export const createStockTransfer = (data: {
  fromLocation: string;
  toLocation: string;
  notes?: string;
  items: { variantId: number; quantity: number }[];
}) =>
  api<{
    id: number;
    transferNumber: string;
    fromLocation: string;
    toLocation: string;
    status: string;
    totalQty: number;
  }>("/api/inventory/transfers", { method: "POST", body: JSON.stringify(data) });

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  userEmail: string | null;
}

export interface AuditStats {
  totalEntries: number;
  entriesToday: number;
  entriesTodayChange: number;
  topUser: { email: string; count: number } | null;
  mostCommonAction: string | null;
  actionDistribution: Array<{ action: string; count: number; percentage: number }>;
  userActivity: Array<{ user: string; count: number }>;
}

export interface Campaign {
  id: number;
  name: string;
  discountPct: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface PurchaseOrder {
  id: string;
  supplier: string;
  status: string;
  total: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  receivedAt: string | null;
}
export interface ReturnItem {
  id: string;
  orderId: string | null;
  /** Where the return originated: "online" (customer portal) or "in_store" (counter). */
  channel?: "online" | "in_store";
  userId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerName: string | null;
  productId: string;
  productName: string | null;
  qty: number;
  reason: string | null;
  condition: string | null;
  resolutionType: string | null;
  status: string;
  adminNotes: string | null;
  refundAmount: number | null;
  /** How the refund was issued (cash | card | mobile) and when. */
  refundMethod?: string | null;
  refundedAt?: string | null;
  /** In-store returns linked to the original POS sale. */
  saleId?: string | null;
  saleLineId?: number | null;
  trackingNumber: string | null;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  userFirstName: string | null;
  userLastName: string | null;
}

export const getAuditLog = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return api<{ rows: AuditEntry[]; total: number }>("/api/dashboard/audit-log" + qs);
};
export const getCampaigns = () => api<Campaign[]>("/api/dashboard/campaigns");
export const createCampaign = (data: Omit<Campaign, "id" | "createdAt">) =>
  api<Campaign>("/api/dashboard/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateCampaign = (
  data: { id: number } & Partial<Omit<Campaign, "id" | "createdAt">>,
) =>
  api<Campaign>("/api/dashboard/campaigns", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteCampaign = (id: number) =>
  api<{ success: boolean }>("/api/dashboard/campaigns", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });

export interface CashRegister {
  id: number;
  name: string;
  openingBal: number;
  closingBal: number | null;
  /** closingBal − expected cash at close (server-computed). */
  variance: number | null;
  note: string | null;
  status: string | null;
  openedAt: string | null;
  closedAt: string | null;
  openedByName: string | null;
}
export interface CashStats {
  grandTotal: number;
  totalCash: number;
  totalCard: number;
  totalMFS: number;
  cashPOS: number;
  cashOnline: number;
  warehouses: { location: string; cashTotal: number }[];
  cashInDrawer: number;
  cashRefunds: number;
  /** Approved cash-paid expenses today (taka) — already deducted from cashInDrawer. */
  cashExpenses: number;
  openRegister: { id: number; name: string; openingBal: number; openedAt: string | null } | null;
}
export const getCashRegisters = () => api<CashRegister[]>("/api/dashboard/pos");
export const getCashStats = () => api<CashStats>("/api/dashboard/cash-stats");
export const openCashRegister = (data: { name: string; openingBal: number; openedBy?: string }) =>
  api<CashRegister>("/api/dashboard/pos", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const closeCashRegister = (data: { id: number; closingBal: number; note?: string }) =>
  api<CashRegister>("/api/dashboard/pos", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const getPurchaseOrders = () => api<PurchaseOrder[]>("/api/dashboard/procurement");
export const getReturns = () => api<ReturnItem[]>("/api/dashboard/returns");
export const getCustomerReturns = (userId: string) =>
  api<ReturnItem[]>(`/api/portal/returns?userId=${userId}`);
export const getSettings = () => api<Record<string, any>>("/api/dashboard/settings");
export const updateSettings = (data: Record<string, any>) =>
  api<{ success: boolean }>("/api/dashboard/settings", {
    method: "PUT",
    body: JSON.stringify(data),
  });

// POS
export interface PosCatalogUnit {
  /** inventory_units.id — needed to sell this exact physical unit. */
  id: string;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  /** Receive batch this unit came from (null for unbatched/legacy stock). */
  batchId: string | null;
  batchNumber: string | null;
  batchReceivedAt: string | null;
  unitCost: number | null;
  currentPrice: number | null;
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
  color: string | null;
  location: string | null;
  /** False while an older batch at the same warehouse still has stock. */
  sellable: boolean;
}

export interface PosCatalogBatch {
  id: string | null;
  batchNumber: string;
  receivedAt: string | null;
  unitCost: number | null;
  available: number;
  /** Locked until every older batch at this warehouse sells out. */
  locked: boolean;
}
export interface PosCatalogItem {
  variantId: number;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  attribute: ProductAttribute[];
  sellingPrice: number;
  quantity: number;
  productType: string;
  warrantyPolicyId: number | null;
  warranty: string | null;
  category: string | null;
  categorySlug: string | null;
  brand: string | null;
  bg: string | null;
  requiresUnit: boolean;
  available: number;
  /** Available units that are actually sellable now (oldest open batch). */
  sellableAvailable: number;
  units: PosCatalogUnit[];
  batches: PosCatalogBatch[];
  costCode: string | null;
  dCode: string | null;
  sellCode: string | null;
}
export interface PosSettings {
  storeName: string;
  currency: string;
  taxRate: number;
  vatInclusive: boolean;
}
export interface BarcodeLookup {
  match: "unit" | "variant" | "multi" | "none";
  /**
   * When match === "multi": every variant sharing the scanned product barcode
   * (legacy duplicate labels). The POS asks the seller which product the
   * scanned label belongs to before adding anything.
   */
  candidates?: {
    variantId: number;
    variantName: string;
    sku: string;
    sellingPrice: number;
    productName: string;
    productType: string;
    requiresUnit: boolean;
    warrantyPolicyId: number | null;
  }[];
  unit?: {
    id: string;
    imei1: string | null;
    imei2: string | null;
    serialNumber: string | null;
    status: string;
    currentPrice: number | null;
  };
  variant?: {
    id: number;
    name: string;
    sku: string;
    attribute: ProductAttribute[];
    sellingPrice: number;
    quantity?: number;
  };
  product?: {
    id: string;
    name: string;
    productType: string;
    warrantyPolicyId: number | null;
    categorySlug?: string | null;
  };
  /** Receive batch of the matched unit (unit matches only). */
  batch?: { id: string; batchNumber: string; receivedAt: string | null; unitCost: number } | null;
  /** False when the unit is from a newer batch that is still locked by FIFO. */
  sellable?: boolean;
  blockedByBatch?: { batchNumber: string; available: number } | null;
  requiresUnit?: boolean;
}
export interface CommitSaleInput {
  idempotencyKey?: string;
  channel?: string;
  cashierId?: string;
  registerSessionId?: number;
  /** Selling location (warehouse) name — used for stock deduction + movement log. */
  locationId?: string;
  /**
   * Optional backdated sale date as `YYYY-MM-DD`. Only sent when a previous sale
   * is being entered after the fact; when omitted the sale uses the current time.
   */
  soldAt?: string;
  customer?: { name: string; phone?: string; email?: string };
  lines: {
    variantId?: number;
    unitId?: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
    /** Per-line override; when omitted the product's catalog warranty applies. */
    warrantyPolicyId?: number | null;
  }[];
  payments?: { method: string; amount: number; reference?: string }[];
}
export interface CommitSaleResult {
  sale: {
    id: string;
    saleNumber: string;
    invoiceNumber: string;
    barcodeValue: string | null;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    paidAmount: number;
    changeAmount: number;
    currency: string;
    createdAt: string;
  };
  verificationCode: string;
  warranties: { unitId: string | null; expiresAt: string | null }[];
}

export const getPosCatalog = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return api<PosCatalogItem[]>("/api/pos/catalog" + qs);
};
export const getPosSettings = () => api<PosSettings>("/api/pos/settings");
export const barcodeLookup = (code: string) =>
  api<BarcodeLookup>("/api/barcode/lookup/" + encodeURIComponent(code));
export const commitSale = (data: CommitSaleInput) =>
  api<CommitSaleResult>("/api/sales/commit", { method: "POST", body: JSON.stringify(data) });

export const updateStaff = (id: string, data: StaffInput) =>
  api<StaffMember>(`/api/dashboard/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) });

// -- Expenses --

export interface Expense {
  id: number;
  expenseNumber: string;
  categoryId: number | null;
  name: string;
  description: string | null;
  amount: number;
  vatAmount: number;
  tdsAmount: number;
  totalAmount: number;
  currency: string;
  expenseDate: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentStatus: string;
  payeeName: string | null;
  payeeType: string | null;
  vendorInvoiceNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  categoryName: string | null;
  categoryCode: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  code: string;
  icon: string | null;
  color: string | null;
  isTaxDeductible: boolean | null;
  tdsRate: number | null;
  vatApplicable: boolean | null;
}

export interface DailyExpense {
  id: number;
  expenseNumber: string;
  expenseDate: string;
  totalAmount: number;
  itemCount: number;
  notes: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  items: Array<{
    id: number;
    categoryId: number | null;
    description: string;
    amount: number;
    paymentMethod: string;
    notes: string | null;
    categoryName: string | null;
    categoryIcon: string | null;
    categoryColor: string | null;
  }>;
}

export const getExpenses = (params?: Record<string, string>) =>
  api<Expense[]>(`/api/dashboard/expenses${params ? "?" + new URLSearchParams(params) : ""}`);

export const getExpense = (id: number) => api<Expense>(`/api/dashboard/expenses/${id}`);

export const createExpense = (data: Record<string, unknown>) =>
  api<Expense>("/api/dashboard/expenses", { method: "POST", body: JSON.stringify(data) });

export const updateExpense = (id: number, data: Record<string, unknown>) =>
  api<Expense>(`/api/dashboard/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const deleteExpense = (id: number) =>
  api<{ success: boolean }>(`/api/dashboard/expenses/${id}`, { method: "DELETE" });

export const getDailyExpenses = (params?: Record<string, string>) =>
  api<DailyExpense[]>(
    `/api/dashboard/expenses/daily${params ? "?" + new URLSearchParams(params) : ""}`,
  );

export const createDailyExpense = (data: Record<string, unknown>) =>
  api<DailyExpense>("/api/dashboard/expenses/daily", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getExpenseCategories = () =>
  api<ExpenseCategory[]>("/api/dashboard/expenses/categories");

export const createExpenseCategory = (data: Record<string, unknown>) =>
  api<ExpenseCategory>("/api/dashboard/expenses/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const getAuditStats = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return api<AuditStats>("/api/dashboard/audit-stats" + qs);
};
