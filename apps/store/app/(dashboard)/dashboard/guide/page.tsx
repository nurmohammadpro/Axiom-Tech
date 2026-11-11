"use client";

import { useState } from "react";
import { Card } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { useSessionScope } from "@/lib/hooks";
import { SortableTable } from "@/components/dashboard/sortable-table";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Boxes,
  Barcode,
  ScanLine,
  ShoppingBag,
  Megaphone,
  Banknote,
  Users,
  Undo2,
  FileText,
  Shield,
  UserCog,
  Settings,
  ChevronRight,
  Search,
  CreditCard,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Zap,
  Globe,
  RotateCcw,
} from "lucide-react";

const allSections = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, roles: ["owner", "manager", "salesman"] },
  { id: "pos", label: "Billing / POS", icon: ScanLine, roles: ["owner", "manager", "salesman"] },
  { id: "orders", label: "Orders", icon: ShoppingBag, roles: ["owner", "manager", "salesman"] },
  { id: "inventory", label: "Inventory", icon: Boxes, roles: ["owner", "manager", "salesman"] },
  { id: "catalog", label: "Catalog", icon: Package, roles: ["owner", "manager"] },
  { id: "customers", label: "Customers", icon: Users, roles: ["owner", "manager", "salesman"] },
  { id: "returns", label: "Returns & Refunds", icon: Undo2, roles: ["owner", "manager", "salesman"] },
  { id: "campaigns", label: "Campaigns", icon: Megaphone, roles: ["owner", "manager"] },
  { id: "reports", label: "Reports & Analytics", icon: BarChart3, roles: ["owner", "manager", "salesman"] },
  { id: "settings", label: "Settings", icon: Settings, roles: ["owner"] },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Zap, roles: ["owner", "manager", "salesman"] },
];

export default function AdminGuide() {
  const [active, setActive] = useState("overview");
  const { data: me } = useSessionScope();
  const userRole = me?.staffRole || me?.role || "customer";

  const sections = allSections.filter((s) => s.roles.includes(userRole));

  // Reset to first visible section if current is hidden
  if (!sections.some((s) => s.id === active) && sections.length > 0) {
    setActive(sections[0].id);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
      {/* Table of contents */}
      <nav className="hidden lg:block">
        <div className="sticky top-20 space-y-1">
          <div className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Guide
          </div>
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors " +
                  (active === s.id
                    ? "bg-surface text-foreground"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground")
                }
              >
                <Icon size={14} className="shrink-0" />
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile selector */}
      <div className="lg:hidden">
        <select
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div className="min-w-0 space-y-6">
        {active === "overview" && <OverviewSection />}
        {active === "pos" && <POSSection />}
        {active === "orders" && <OrdersSection />}
        {active === "inventory" && <InventorySection />}
        {active === "catalog" && <CatalogSection />}
        {active === "customers" && <CustomersSection />}
        {active === "returns" && <ReturnsSection />}
        {active === "campaigns" && <CampaignsSection />}
        {active === "reports" && <ReportsSection />}
        {active === "settings" && <SettingsSection />}
        {active === "shortcuts" && <ShortcutsSection />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </Card>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
      <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function OverviewSection() {
  return (
    <>
      <Section title="Welcome to Axiom Tech">
        <p>
          The admin dashboard is your central hub for managing the entire store — from catalog and
          inventory to sales, returns, and analytics. This guide walks you through every feature.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { icon: ScanLine, label: "Billing / POS", desc: "Process in-store sales with barcode scanning" },
            { icon: ShoppingBag, label: "Orders", desc: "Manage online and POS orders" },
            { icon: Boxes, label: "Inventory", desc: "Track stock across warehouses" },
            { icon: BarChart3, label: "Analytics", desc: "Revenue, sales, and performance charts" },
          ].map((f) => (
            <div key={f.label} className="flex items-start gap-3 rounded border border-border p-3">
              <f.icon size={16} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-medium text-foreground">{f.label}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Dashboard Overview">
        <p>
          The <strong>Overview</strong> page shows your store&apos;s health at a glance:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Revenue chart</strong> — daily breakdown for the last 7 days</li>
          <li><strong>Orders by channel</strong> — POS vs Online pie chart</li>
          <li><strong>Recent sales</strong> — latest transactions with status</li>
          <li><strong>Activity feed</strong> — audit log of recent actions</li>
          <li><strong>Order status bars</strong> — visual breakdown of order states</li>
          <li><strong>Sales by warehouse</strong> — revenue per location</li>
        </ul>
        <Tip>Low stock and out-of-stock alerts appear at the top of the dashboard when inventory is running low.</Tip>
      </Section>
    </>
  );
}

function POSSection() {
  return (
    <>
      <Section title="Billing / POS">
        <p>
          The POS page is your point-of-sale interface for processing in-store transactions. It
          supports barcode scanning, multiple payment methods, and exchange (trade-in) workflows.
        </p>

        <h3 className="mt-3 text-sm font-medium text-foreground">Two Modes</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 size={14} className="text-emerald-600" /> Sale Mode
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Standard sales. Scan or search products, add to cart, accept payment via Cash, Card, or
              Mobile. Full payment required before completing the sale.
            </p>
          </div>
          <div className="rounded border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <RotateCcw size={14} className="text-primary" /> Exchange Mode
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Trade-in workflow. Look up the customer&apos;s old device by IMEI, calculate trade-in
              value based on age and condition, then select a new device from the catalog. The system
              shows the amount due after trade-in credit.
            </p>
          </div>
        </div>

        <h3 className="mt-3 text-sm font-medium text-foreground">Exchange Flow</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Switch to <strong>Exchange</strong> tab</li>
          <li>Enter the trade-in device IMEI or serial number → click <strong>Find Device</strong></li>
          <li>Set device age (months) and condition (Excellent/Good/Fair/Poor)</li>
          <li>Click <strong>Calculate Trade-in Value</strong></li>
          <li>Select the new device from the product catalog below</li>
          <li>Complete payment for the difference</li>
        </ol>
        <Tip>The trade-in value is calculated from the active exchange policy in Settings.</Tip>

        <h3 className="mt-3 text-sm font-medium text-foreground">Cart & Payment</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Click a product to add it (single variant) or open the variant picker</li>
          <li>Scan barcodes with a USB scanner or type the code and press Enter</li>
          <li>Adjust quantity with +/- buttons or remove items</li>
          <li>Enter customer name and phone (optional)</li>
          <li>Select payment method: Cash, Card, or Mobile</li>
          <li>Enter the amount paid — change is calculated automatically</li>
          <li>Press <strong>Charge</strong> or use the keyboard shortcut to complete</li>
        </ul>
      </Section>
    </>
  );
}

function OrdersSection() {
  return (
    <Section title="Orders">
      <p>
        The Orders page combines both online storefront orders and POS (in-store) sales into a single
        unified view.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Channel indicator</strong> — shows whether each order is Online or POS</li>
        <li><strong>Status filter</strong> — filter by order status (Processing, Shipped, Delivered, etc.)</li>
        <li><strong>Warehouse filter</strong> — for POS orders, filter by warehouse</li>
        <li><strong>Status update</strong> — click any order to update its status with notes</li>
      </ul>
      <Tip>POS sales automatically deduct stock from the selling warehouse. Online orders use the default warehouse.</Tip>
    </Section>
  );
}

function InventorySection() {
  return (
    <Section title="Inventory">
      <p>
        Track stock levels across all warehouses. The inventory shows every product variant with
        real-time availability, location breakdown, and low-stock indicators.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Stock levels</strong> — available quantity per variant, including per-location breakdown</li>
        <li><strong>Low stock alerts</strong> — variants at or below their threshold are highlighted</li>
        <li><strong>Toggle active</strong> — disable a variant without deleting it</li>
        <li><strong>Warehouse tab</strong> — manage locations (create, edit, set default, delete)</li>
        <li><strong>Stock transfers</strong> — move inventory between warehouses</li>
      </ul>
      <Warning>Only the store owner can manage warehouses. Staff members scoped to a warehouse see only their own stock.</Warning>
    </Section>
  );
}

function CatalogSection() {
  return (
    <Section title="Catalog">
      <p>
        Manage your product catalog — add products, create variants, set pricing, and assign
        warranties.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Add product</strong> — name, description, brand, category, specs</li>
        <li><strong>Variants</strong> — each product has variants with SKU, barcode, cost/selling price</li>
        <li><strong>Attributes</strong> — color, storage, size, etc. for variant differentiation</li>
        <li><strong>Warranty</strong> — assign a warranty policy to each product</li>
        <li><strong>Barcodes</strong> — generate and print barcode labels for variants</li>
      </ul>
      <Tip>SKUs are auto-generated but can be customized. Barcodes can be scanned directly in the POS.</Tip>
    </Section>
  );
}

function CustomersSection() {
  return (
    <Section title="Customers">
      <p>
        View all customers from both online orders and POS sales. The system automatically merges
        POS customers with their online accounts when matched by phone or email.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Channel</strong> — Online, POS, or Both (merged)</li>
        <li><strong>Search</strong> — by name, email, or phone</li>
        <li><strong>Spending</strong> — total spent and order count per customer</li>
        <li><strong>Purchase history</strong> — view all orders and POS purchases for any customer</li>
      </ul>
    </Section>
  );
}

function ReturnsSection() {
  return (
    <>
      <Section title="Returns & Refunds">
        <p>
          Process returns from both online orders and in-store purchases. The returns page has
          separate views for Online and In-store returns.
        </p>

        <h3 className="mt-3 text-sm font-medium text-foreground">Creating an In-Store Return</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Go to <strong>Returns</strong> → click <strong>New In-store Return</strong></li>
          <li>Enter the customer&apos;s phone number → click <strong>Find Purchases</strong></li>
          <li>Expand the relevant order/sale → click <strong>Return</strong> on the item</li>
          <li>Set quantity, condition, reason, and resolution type (Refund/Exchange/Repair)</li>
          <li>Adjust the refund amount if needed → click <strong>Create Return</strong></li>
        </ol>

        <h3 className="mt-3 text-sm font-medium text-foreground">Processing Returns</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Pending</strong> → Approve or Reject the return</li>
          <li><strong>Approved</strong> → Issue the refund (Cash/Card/Mobile) or mark as Processing</li>
          <li><strong>Refunded</strong> → Return is complete, stock is restored automatically for POS-linked returns</li>
        </ul>
        <Tip>Returns linked to POS sales automatically restore stock when the refund is issued.</Tip>
      </Section>
    </>
  );
}

function CampaignsSection() {
  return (
    <Section title="Campaigns">
      <p>
        Create and manage promotional campaigns with discount percentages. Campaigns can be applied
        to orders during checkout.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Create campaign</strong> — name, discount percentage, start/end dates</li>
        <li><strong>Toggle active</strong> — enable or disable campaigns without deleting</li>
        <li><strong>Active count</strong> — shown on the dashboard overview</li>
      </ul>
    </Section>
  );
}

function ReportsSection() {
  return (
    <Section title="Reports & Analytics">
      <p>
        The <strong>Analytics</strong> page provides deep insights into your store&apos;s performance.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Revenue trend</strong> — line chart showing sales over time</li>
        <li><strong>Revenue by channel</strong> — POS vs Online breakdown</li>
        <li><strong>Revenue by warehouse</strong> — performance per location</li>
        <li><strong>Top customers</strong> — highest spenders</li>
        <li><strong>Sales by category</strong> — which categories perform best</li>
        <li><strong>Order status distribution</strong> — visual breakdown of order states</li>
        <li><strong>Inventory value</strong> — total stock value across warehouses</li>
      </ul>
      <Tip>Use the Reports page for downloadable data exports, and Analytics for visual charts and trends.</Tip>
    </Section>
  );
}

function SettingsSection() {
  return (
    <Section title="Settings">
      <p>
        Configure every aspect of your store from the Settings page. All changes are saved
        immediately.
      </p>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {[
          { label: "General", desc: "Business name, email, phone, currency, timezone" },
          { label: "Locations", desc: "Create and manage warehouses, set default" },
          { label: "Taxes", desc: "Default tax rate, VAT inclusive pricing" },
          { label: "Payments", desc: "Accept cash/card/mobile, bKash, Nagad" },
          { label: "Receipts", desc: "Header, footer, logo, print copies" },
          { label: "Loyalty", desc: "Points per purchase, redemption rates" },
          { label: "Notifications", desc: "Email/SMS alerts, low stock thresholds" },
          { label: "Integrations", desc: "WhatsApp, SMS gateway, accounting" },
          { label: "Security", desc: "Session timeout, 2FA, password policy" },
          { label: "Data & Backups", desc: "Auto backups, frequency, retention" },
        ].map((s) => (
          <div key={s.label} className="rounded border border-border p-2">
            <div className="text-sm font-medium text-foreground">{s.label}</div>
            <div className="text-xs text-muted-foreground">{s.desc}</div>
          </div>
        ))}
      </div>
      <Warning>Only the store owner can access and modify settings.</Warning>
    </Section>
  );
}

function ShortcutsSection() {
  const shortcuts = [
    { keys: "⌘/Ctrl + K", action: "Focus search in POS" },
    { keys: "⌘/Ctrl + P", action: "Focus paid amount field" },
    { keys: "⌘/Ctrl + Enter", action: "Complete charge (POS)" },
    { keys: "F4", action: "Complete charge (POS)" },
    { keys: "/", action: "Focus search (when not in input)" },
    { keys: "↑ ↓", action: "Navigate variant picker" },
    { keys: "Enter", action: "Add selected variant" },
    { keys: "Escape", action: "Close variant picker" },
  ];

  return (
    <Section title="Keyboard Shortcuts">
      <p>Speed up your workflow with these keyboard shortcuts:</p>
      <div className="mt-3">
        <SortableTable
          columns={[
            {
              key: "keys",
              header: "Shortcut",
              sortable: true,
              render: (v) => (
                <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-mono">
                  {v}
                </kbd>
              ),
            },
            {
              key: "action",
              header: "Action",
              sortable: true,
              className: "text-muted-foreground",
            },
          ]}
          data={shortcuts}
          rowKey={(s) => s.keys}
          emptyMessage="No shortcuts."
        />
      </div>
    </Section>
  );
}
