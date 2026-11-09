"use client";

import { useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Card } from "@/components/dashboard/dashboard-shell";
import {
  Package, RotateCcw, Shield, ShoppingCart, Truck, User, HelpCircle, Phone,
  CheckCircle2, AlertTriangle,
} from "lucide-react";

const sections = [
  { id: "overview", label: "Getting Started", icon: Package },
  { id: "orders", label: "Placing Orders", icon: ShoppingCart },
  { id: "tracking", label: "Order Tracking", icon: Truck },
  { id: "returns", label: "Returns & Refunds", icon: RotateCcw },
  { id: "warranty", label: "Warranty Lookup", icon: Shield },
  { id: "account", label: "My Account", icon: User },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "support", label: "Contact Support", icon: Phone },
];

export default function ClientGuide() {
  const [active, setActive] = useState("overview");

  return (
    <PortalShell title="Help & Guide">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-20 space-y-1">
            <div className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">Help Center</div>
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.id} onClick={() => setActive(s.id)}
                  className={"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors " + (active === s.id ? "bg-surface text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground")}>
                  <Icon size={14} className="shrink-0" />{s.label}
                </button>
              );
            })}
          </div>
        </nav>
        <div className="lg:hidden">
          <select value={active} onChange={(e) => setActive(e.target.value)} className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
            {sections.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
          </select>
        </div>
        <div className="min-w-0 space-y-6">
          {active === "overview" && <GettingStartedSection />}
          {active === "orders" && <OrdersSection />}
          {active === "tracking" && <TrackingSection />}
          {active === "returns" && <ReturnsSection />}
          {active === "warranty" && <WarrantySection />}
          {active === "account" && <AccountSection />}
          {active === "faq" && <FAQSection />}
          {active === "support" && <SupportSection />}
        </div>
      </div>
    </PortalShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<Card className="p-5"><h2 className="mb-3 text-lg font-semibold">{title}</h2><div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div></Card>);
}
function Tip({ children }: { children: React.ReactNode }) {
  return (<div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" /><span>{children}</span></div>);
}
function Warning({ children }: { children: React.ReactNode }) {
  return (<div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{children}</span></div>);
}

function GettingStartedSection() {
  return (<>
    <Section title="Welcome to Axiom Tech">
      <p>Your account for browsing, ordering, and tracking iPhones, Samsungs, Pixels, MacBooks, and accessories — all with warranty protection.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {[{ icon: ShoppingCart, label: "Browse & Order", desc: "Explore the catalog and place orders online" }, { icon: Truck, label: "Track Orders", desc: "Monitor your order status from processing to delivery" }, { icon: RotateCcw, label: "Request Returns", desc: "Easy returns for defective or unwanted items" }, { icon: Shield, label: "Warranty Check", desc: "Look up warranty status by IMEI or serial number" }].map((f) => (
          <div key={f.label} className="flex items-start gap-3 rounded border border-border p-3"><f.icon size={16} className="mt-0.5 shrink-0 text-primary" /><div><div className="text-sm font-medium text-foreground">{f.label}</div><div className="text-xs text-muted-foreground">{f.desc}</div></div></div>
        ))}
      </div>
    </Section>
    <Section title="Quick Start">
      <ol className="list-decimal pl-5 space-y-2">
        <li><strong>Browse the store</strong> — Visit the storefront to explore products by category, brand, or search.</li>
        <li><strong>Add to cart</strong> — Select your desired product and add it to your cart.</li>
        <li><strong>Checkout</strong> — Enter your shipping address, choose a payment method, and place your order.</li>
        <li><strong>Track</strong> — Come back to your account dashboard to track the order status.</li>
      </ol>
      <Tip>Create an account to earn loyalty points on every purchase and access your order history.</Tip>
    </Section>
  </>);
}

function OrdersSection() {
  return (<Section title="Placing Orders">
    <h3 className="mt-2 text-sm font-medium text-foreground">How to Order</h3>
    <ol className="list-decimal pl-5 space-y-1">
      <li>Browse products on the <strong>Store</strong> page or use the search bar</li>
      <li>Click a product to view details, specs, and warranty info</li>
      <li>Select options (color, storage, etc.) if applicable</li>
      <li>Click <strong>Add to Cart</strong></li>
      <li>Go to your cart and click <strong>Checkout</strong></li>
      <li>Enter or select a shipping address</li>
      <li>Choose payment method and complete the order</li>
    </ol>
    <h3 className="mt-3 text-sm font-medium text-foreground">Payment Methods</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li><strong>Cash on Delivery</strong> — pay when you receive the item</li>
      <li><strong>Card</strong> — credit/debit card online</li>
      <li><strong>Mobile</strong> — bKash, Nagad, or other mobile payment</li>
    </ul>
    <h3 className="mt-3 text-sm font-medium text-foreground">Order Confirmation</h3>
    <p>After placing an order, you will receive an order confirmation with your order ID. You can use this ID to track your order status at any time.</p>
    <Warning>Orders cannot be modified after they are shipped. Contact support immediately if you need changes.</Warning>
  </Section>);
}

function TrackingSection() {
  return (<Section title="Order Tracking">
    <p>Track your order from placement to delivery from your account dashboard.</p>
    <h3 className="mt-3 text-sm font-medium text-foreground">Order Statuses</h3>
    <div className="mt-2 space-y-2">
      {[{ status: "Processing", desc: "Your order is being prepared", color: "bg-amber-500" }, { status: "Shipped", desc: "Your order is on its way", color: "bg-blue-500" }, { status: "Delivered", desc: "Your order has been delivered", color: "bg-emerald-500" }, { status: "Cancelled", desc: "Your order was cancelled", color: "bg-red-500" }].map((s) => (
        <div key={s.status} className="flex items-center gap-3 rounded border border-border p-2"><div className={`h-2 w-2 rounded-full ${s.color}`} /><div><span className="text-sm font-medium text-foreground">{s.status}</span><span className="ml-2 text-xs text-muted-foreground">{s.desc}</span></div></div>
      ))}
    </div>
    <h3 className="mt-3 text-sm font-medium text-foreground">How to Track</h3>
    <ol className="list-decimal pl-5 space-y-1">
      <li>Go to <strong>Orders</strong> in the sidebar</li>
      <li>Find the order you want to track</li>
      <li>Click <strong>View</strong> to see order details and current status</li>
      <li>Check the status timeline for updates</li>
    </ol>
  </Section>);
}

function ReturnsSection() {
  return (<Section title="Returns & Refunds">
    <p>If you are not satisfied with a purchase, you can request a return through your account portal.</p>
    <h3 className="mt-3 text-sm font-medium text-foreground">How to Request a Return</h3>
    <ol className="list-decimal pl-5 space-y-1">
      <li>Go to <strong>Returns</strong> in the sidebar</li>
      <li>Click <strong>New Return Request</strong></li>
      <li>Select the order and item you want to return</li>
      <li>Choose a reason (defective, wrong item, no longer needed, etc.)</li>
      <li>Describe the issue in the notes</li>
      <li>Submit the request</li>
    </ol>
    <h3 className="mt-3 text-sm font-medium text-foreground">Return Policy</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Returns must be requested within <strong>7 days</strong> of delivery</li>
      <li>Items must be in original condition with tags attached</li>
      <li>Defective items are eligible for full refund or exchange</li>
      <li>Opened items may be subject to a restocking fee</li>
    </ul>
    <h3 className="mt-3 text-sm font-medium text-foreground">Return Statuses</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li><strong>Pending</strong> — your request is being reviewed</li>
      <li><strong>Approved</strong> — return accepted, ship the item back</li>
      <li><strong>Processing</strong> — item received and being inspected</li>
      <li><strong>Refunded</strong> — refund issued to your original payment method</li>
      <li><strong>Rejected</strong> — return not accepted (see reason)</li>
    </ul>
    <Tip>Include photos of defective items to speed up the approval process.</Tip>
  </Section>);
}

function WarrantySection() {
  return (<Section title="Warranty Lookup">
    <p>Check the warranty status of any device you purchased from the shop.</p>
    <h3 className="mt-3 text-sm font-medium text-foreground">How to Check Warranty</h3>
    <ol className="list-decimal pl-5 space-y-1">
      <li>Visit the <strong>Warranty</strong> page on the storefront</li>
      <li>Enter your device IMEI, serial number, or unit code</li>
      <li>Click <strong>Check Warranty</strong></li>
      <li>View the warranty status, coverage details, and expiry date</li>
    </ol>
    <h3 className="mt-3 text-sm font-medium text-foreground">Warranty Coverage</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li><strong>Manufacturer defects</strong> — covered for the full warranty period</li>
      <li><strong>Battery issues</strong> — covered if within normal degradation limits</li>
      <li><strong>Software issues</strong> — covered for troubleshooting and updates</li>
    </ul>
    <Warning>Physical damage, water damage, and unauthorized repairs are not covered under warranty.</Warning>
    <h3 className="mt-3 text-sm font-medium text-foreground">Finding Your IMEI</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Dial <kbd className="rounded border border-border bg-surface px-1 text-xs font-mono">*#06#</kbd> on your phone</li>
      <li>Check Settings &rarr; About Phone &rarr; IMEI</li>
      <li>Look on the original box or receipt</li>
    </ul>
  </Section>);
}

function AccountSection() {
  return (<Section title="My Account">
    <p>Manage your profile, addresses, and preferences from the account settings.</p>
    <h3 className="mt-3 text-sm font-medium text-foreground">Profile Settings</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Update your name, email, and phone number</li>
      <li>Change your password</li>
      <li>View your loyalty points balance</li>
    </ul>
    <h3 className="mt-3 text-sm font-medium text-foreground">Addresses</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Add multiple shipping addresses</li>
      <li>Set a default address for faster checkout</li>
      <li>Edit or remove saved addresses</li>
    </ul>
    <h3 className="mt-3 text-sm font-medium text-foreground">Loyalty Points</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Earn points on every purchase</li>
      <li>Points are shown in your account overview</li>
      <li>Redeem points at checkout for discounts</li>
    </ul>
    <Tip>Your loyalty points balance is displayed at the bottom of the sidebar and on your account overview.</Tip>
  </Section>);
}

function FAQSection() {
  const faqs = [
    { q: "How do I track my order?", a: "Go to Orders in your account dashboard. Click View on any order to see its current status and details." },
    { q: "Can I cancel my order?", a: "You can cancel orders that are still in Processing status. Once shipped, you can return the item instead." },
    { q: "How long does delivery take?", a: "Standard delivery takes 3-5 business days within Dhaka, and 5-7 business days outside Dhaka." },
    { q: "What payment methods are accepted?", a: "We accept Cash on Delivery, credit/debit cards, and mobile payments (bKash, Nagad)." },
    { q: "How do I check my warranty?", a: "Visit the Warranty page on the storefront, enter your IMEI or serial number, and click Check Warranty." },
    { q: "Can I return an opened product?", a: "Yes, opened products can be returned within 7 days if they are defective. Non-defective opened items may incur a restocking fee." },
    { q: "How do I earn loyalty points?", a: "Points are automatically earned on every purchase. Create an account to start accumulating points." },
    { q: "Is my data secure?", a: "Yes. We use industry-standard encryption and never store payment card details on our servers." },
  ];
  return (<Section title="Frequently Asked Questions">
    <div className="space-y-3">
      {faqs.map((faq, i) => (<div key={i} className="rounded border border-border p-3"><div className="text-sm font-medium text-foreground">{faq.q}</div><div className="mt-1 text-xs text-muted-foreground">{faq.a}</div></div>))}
    </div>
  </Section>);
}

function SupportSection() {
  return (<Section title="Contact Support">
    <p>Need help? Our support team is available to assist you.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="flex items-start gap-3 rounded border border-border p-3"><Phone size={16} className="mt-0.5 shrink-0 text-primary" /><div><div className="text-sm font-medium text-foreground">Phone</div><div className="text-xs text-muted-foreground">+880 1XXX-XXXXXX</div><div className="text-xs text-muted-foreground">Sat-Thu, 10am - 8pm</div></div></div>
      <div className="flex items-start gap-3 rounded border border-border p-3"><Package size={16} className="mt-0.5 shrink-0 text-primary" /><div><div className="text-sm font-medium text-foreground">Email</div><div className="text-xs text-muted-foreground">the shop where you bought your device</div><div className="text-xs text-muted-foreground">Response within 24 hours</div></div></div>
    </div>
    <h3 className="mt-3 text-sm font-medium text-foreground">When to Contact Support</h3>
    <ul className="list-disc pl-5 space-y-1">
      <li>Order issues (wrong item, missing item, damaged on arrival)</li>
      <li>Return or refund questions</li>
      <li>Warranty claims</li>
      <li>Account access problems</li>
      <li>Payment or billing inquiries</li>
    </ul>
    <Tip>Have your order ID ready when contacting support — it speeds up the resolution process.</Tip>
  </Section>);
}
