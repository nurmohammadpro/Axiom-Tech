/**
 * A5 Invoice System for POS and Exchange
 *
 * Features:
 * - Professional header with shop info (left) and barcode (right)
 * - Customer details section with 3-column grid
 * - Line items table with SL, Description, Unit Price, Qty, Total
 * - Browser print trigger with PDF fallback
 * - Support for both regular sales and exchanges
 * - Real scannable barcode using jsbarcode
 * - Bangla terms section with warranty and exchange policies
 */

import { StoreInfo } from "./pdf-utils";
import jsBarcode from "jsbarcode";
import { METHOD_LABELS } from "./payment-methods";

export interface ReceiptCustomer {
  name: string;
  phone?: string;
  address?: string;
}

export interface ReceiptLineItem {
  sl: number;
  description: string;
  unitPrice: number;
  qty: number;
  total: number;
  imei1?: string;
  imei2?: string;
  serialNumber?: string;
  /** Taxonomy slug of the product's category (e.g. "pre-owned-phones"). */
  categorySlug?: string;
  /** Discount applied to this whole line (pre-discount pricing on unitPrice/total). */
  discountAmount?: number;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  reference?: string;
}

/**
 * Return-receipt payload: which device came back and how much cash the
 * customer is getting. The signature is intentionally NOT here — the printed
 * receipt carries a blank "Received by (Customer Signature)" line that the
 * customer signs on paper; nothing is captured or stored digitally.
 */
export interface ReturnInfo {
  returnId: string;
  reason?: string;
  refundAmount: number;
  refundMethod: string;
  originalSaleNumber?: string;
  originalInvoiceNumber?: string;
  originalSaleDate?: Date | string;
  device?: {
    description: string;
    imei1?: string;
    imei2?: string;
    serial?: string;
    condition?: string;
  } | null;
}

export interface ReceiptData {
  invoiceNumber: string;
  date: Date;
  barcodeNumber: string;
  storeInfo: StoreInfo;
  customer: ReceiptCustomer;
  items: ReceiptLineItem[];
  totals: {
    subtotal: number;
    discount?: number;
    tax?: number;
    tradeInCredit?: number;
    grandTotal: number;
    paid: number;
    change?: number;
  };
  payments: ReceiptPayment[];
  policies?: string[];
  /** Settings → receiptHeader: short banner shown under the store header. */
  headerText?: string;
  /** Settings → receiptFooter: short note shown above the thank-you line. */
  footerText?: string;
  /** Settings → receiptCopies: how many copies to print (1–5). */
  copies?: number;
  isExchange?: boolean;
  exchangeItems?: {
    oldItems: ReceiptLineItem[];
    newItems: ReceiptLineItem[];
  };
  /** Return receipt: standard sales format, "<Method> Received" row + signature line. */
  isReturn?: boolean;
  returnInfo?: ReturnInfo;
}

function paymentLineLabel(method: string): string {
  return METHOD_LABELS[method] || method;
}

/** Compact "IMEI … / S/N …" identifier for a sold unit (empty when none captured). */
function itemIdentifier(item: ReceiptLineItem): string {
  const parts: string[] = [];
  if (item.imei1) parts.push(`IMEI ${item.imei1}`);
  if (item.imei2) parts.push(`${item.imei2}`);
  if (item.serialNumber) parts.push(`S/N ${item.serialNumber}`);
  return parts.join(" / ");
}

/** Vertical identifiers — each IMEI / S/N on its own line. */
function itemIdentifierParts(item: ReceiptLineItem): string[] {
  const parts: string[] = [];
  if (item.imei1) parts.push(`IMEI ${item.imei1}`);
  if (item.imei2) parts.push(`${item.imei2}`);
  if (item.serialNumber) parts.push(`S/N ${item.serialNumber}`);
  return parts;
}
function itemIdentifierHtml(item: ReceiptLineItem): string {
  return itemIdentifierParts(item).join("<br>");
}

function paymentLineRef(reference?: string): string {
  return reference ? ` (ref: ${reference})` : "";
}

/** Escape owner-entered policy text so it can't break the printed markup. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Owner-configured receipt policies from Settings, as footer terms. */
function policyTerms(data: ReceiptData): string[] {
  return (data.policies ?? []).map((p) => p.trim()).filter(Boolean);
}

/** Base64-encode a fetched font so jsPDF can register it via addFileToVFS. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Generate scannable barcode SVG using jsbarcode
function generateBarcode(value: string): string {
  try {
    const canvas = document.createElement("canvas");
    jsBarcode(canvas, value, {
      format: "CODE128",
      lineColor: "#000000",
      width: 1,
      height: 25,
      displayValue: false,
      margin: 0,
    });
    return canvas.toDataURL();
  } catch (error) {
    console.error("Barcode generation error:", error);
    return ""; // Fallback to no barcode
  }
}

// Browser print trigger with HTML template
/**
 * Pre-Owned Phones pricing display: the negotiated discount is folded into the
 * line price so the receipt shows only the final price the customer pays
 * (৳100,000 with an ৳8,000 discount prints as ৳92,000, no discount row).
 * Display-only — stored sale data keeps the gross price + per-line discount.
 * Any discount not absorbed by pre-owned lines (other categories in a mixed
 * cart) still prints as a regular discount row, keeping the totals balanced.
 */
function applyNetPricing(data: ReceiptData): ReceiptData {
  const isNet = (i: ReceiptLineItem) =>
    i.categorySlug === "pre-owned-phones" && (i.discountAmount ?? 0) > 0;

  const absorbed = data.items.filter(isNet).reduce((sum, i) => sum + (i.discountAmount ?? 0), 0);
  if (absorbed <= 0) return data;

  const items = data.items.map((item) => {
    if (!isNet(item)) return item;
    const discount = item.discountAmount!;
    return {
      ...item,
      unitPrice: item.unitPrice - Math.round(discount / Math.max(1, item.qty)),
      total: item.total - discount,
    };
  });

  const discount = Math.max(0, (data.totals.discount ?? 0) - absorbed);
  return {
    ...data,
    items,
    totals: {
      ...data.totals,
      discount: discount > 0 ? discount : undefined,
      subtotal: data.totals.grandTotal + discount,
    },
  };
}

export function printReceipt(data: ReceiptData) {
  data = applyNetPricing(data);
  const formatCurrency = (amount: number) => `৳${amount.toLocaleString()}`;
  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const copies = Math.max(1, Math.min(5, Math.round(data.copies ?? 1)));
  const headerText = data.headerText?.trim() ? escapeHtml(data.headerText.trim()) : "";
  const footerText = data.footerText?.trim() ? escapeHtml(data.footerText.trim()) : "";

  // ── Balanced footer terms: warranty points on the left column.
  // Reordered so the one-year service warranty (Without Parts) and the
  // Update / Physically damage point print as items 5-6 (left half); the
  // declaration line stays last so both columns keep a similar height.
  const staticTermsHtml: string[] = [
    `Mobile Replacement গ্যারান্টি ৩ দিন।`,
    `Display, battery Motherboard এর কোন প্রকার গ্যারান্টি নাই।`,
    `সফটওয়্যার জনিত সমস্যা সার্ভিসের আওতাভুক্ত নয়।`,
    `শপ থেকে বের হওয়ার পূর্বে মোবাইল ভালোভাবে চেক করে নিবেন।<br>(শপ থেকে বের হওয়ার পর কোন অভিযোগ গ্রহণযোগ্য নহে)`,
    `এক বছরের সার্ভিস ওয়ারেন্টি (Without Parts)`,
    `Update অথবা Physically damage জনিত কোন সমস্যা গ্রহণযোগ্য নহে।`,
    `অফিসিয়াল ফোনের ওয়ারেন্টির ক্ষেত্রে কাস্টমার কেয়ারে যোগাযোগ করুন।`,
    `বিক্রিত মোবাইল কিংবা পণ্য ফেরতযোগ্য নয়।`,
    `মোবাইল কেনার পর ফেরত দিতে চাইলে বা Exchange করতে চাইলে 25% থেকে নতুনের ক্ষেত্রে 35% Less দিতে হবে।<br>(শর্ত সাপেক্ষে)`,
    `ক্রয় করা পণ্য কিংবা মোবাইল Exchange না করে ক্যাশ টাকা ফেরত নিতে চাইলে (30%-40%) বাদ দেওয়া হবে।`,
    `উপরিউক্ত সকল শর্ত পড়িয়া ও বুঝিয়া মোবাইল ক্রয় করিলাম।`,
  ];
  const dynamicPolicyHtml = policyTerms(data).map((p) => escapeHtml(p));
  const allTermsHtml = [...staticTermsHtml, ...dynamicPolicyHtml];
  // Single flowing list — CSS multi-column fills the left column first and
  // continues into the right one, like columns in a word processor. No
  // index-based split: numbering stays continuous for any policy count.
  const renderTerms = (terms: string[]) => terms.map((t) => `<li>${t}</li>`).join("\n            ");
  const allTermsItems = renderTerms(allTermsHtml);

  const receiptHTML = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${data.invoiceNumber}</title>

      <style>
        @page {
          size: A5 portrait;
          margin: 0;
        }

        :root {
          --text: #292929;
          --muted: #666;
          --line: #dedede;
          --accent: #d77b12;
          --green: #0aa345;
        }

        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #eeeeee;
        }

        body {
          color: var(--text);
          font-family: Arial, "Noto Sans Bengali", "SolaimanLipi", "Vrinda", sans-serif;
          font-size: 9.6px;
          line-height: 1.45;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .invoice {
          display: flex;
          flex-direction: column;
          width: 148mm;
          min-height: 210mm;
          margin: 0 auto;
          padding: 3mm 6mm 2.5mm;
          background: #fff;
          position: relative;
          overflow: hidden;
        }

        /* Logo watermark — centered in the page, behind all receipt content. */
        .watermark {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 0;
          pointer-events: none;
        }

        .watermark img {
          width: 63%;
          opacity: 0.06;
        }

        .invoice > *:not(.watermark) {
          position: relative;
          z-index: 1;
        }

        /* =========================
           HEADER — system invoice style
           ========================= */
        .header {
          display: grid;
          grid-template-columns: 1fr 52mm;
          gap: 2.5mm;
          padding-bottom: 1.8mm;
          border-bottom: 1px solid var(--line);
        }

        .store-name {
          margin: 0 0 2px;
          font-size: 12.8px;
          font-weight: 700;
          letter-spacing: -.3px;
        }

        .store-line {
          color: var(--muted);
          font-size: 8.4px;
          margin: 1.2px 0;
          line-height: 1.35;
        }

        .store-links {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 2px;
          flex-wrap: wrap;
        }

        .store-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--muted);
          text-decoration: none;
          font-size: 8px;
        }

        .store-link svg {
          width: 11px;
          height: 11px;
          flex: 0 0 auto;
        }

        .invoice-meta {
          text-align: right;
        }

        .ref {
          font-size: 8.8px;
          font-weight: 700;
          margin-bottom: 1.5px;
        }

        .invoice-date {
          color: #444;
          font-size: 8px;
          margin-bottom: 4px;
        }

        .barcode-box {
          width: 35mm;
          min-height: 15mm;
          margin-left: auto;
          border: 1px solid #d7d7d7;
          border-radius: 3px;
          padding: 3mm 4mm 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .barcode {
          width: 28mm;
          height: 8mm;
          display: block;
        }

        .barcode-box > svg {
          width: 28mm;
          height: 8mm;
          display: block;
        }

        .barcode-box > img {
          width: 28mm;
          height: 8mm;
          display: block;
          object-fit: contain;
        }

        .barcode-number {
          margin-top: 1.5px;
          font-family: "Courier New", monospace;
          font-size: 8px;
          letter-spacing: .4px;
        }

        /* =========================
           CUSTOMER
           ========================= */
        .section {
          margin-top: 2mm;
        }

        .customer-card {
          border: 1px solid var(--line);
          border-radius: 3px;
          padding: 2mm 2.5mm 1.5mm;
        }

        .section-title {
          margin: 0 0 1mm;
          font-size: 9.6px;
          font-weight: 700;
        }

        .customer-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 3mm;
        }

        .customer-field {
          color: #333;
          font-size: 11px;
          line-height: 1.4;
        }

        .customer-field strong {
          color: #333;
          font-weight: 600;
        }

        /* =========================
           SALES ITEMS
           ========================= */
        .sales-title {
          margin-bottom: 1mm;
        }

        .items {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1px solid var(--line);
        }

        .items th {
          text-align: left;
          padding: 1.2mm 1mm;
          border: 1px solid var(--line);
          font-size: 11px;
          font-weight: 700;
        }

        .items th.sl,
        .items td.sl {
          width: 10%;
          text-align: center;
        }

        .items th.description {
          width: 47%;
        }

        .items th.unit-price,
        .items td.unit-price {
          width: 17%;
          text-align: right;
        }

        .items th.qty,
        .items td.qty {
          width: 10%;
          text-align: center;
        }

        .items th.total,
        .items td.total {
          width: 16%;
          text-align: right;
        }

        .items td {
          padding: 1.2mm 1mm;
          border: 1px solid var(--line);
          vertical-align: top;
          font-size: 11px;
        }

        .description-main {
          font-size: 11px;
          line-height: 1.35;
        }

        .description-sub {
          margin-top: 1.5px;
          font-size: 11px;
          color: #444;
          line-height: 1.35;
        }

        .money {
          white-space: nowrap;
        }

        /* =========================
           TOTALS — system invoice style
           ========================= */
        .totals {
          width: 62%;
          margin: 1.8mm 0 0 auto;
          font-size: 9.6px;
        }

        .total-row {
          display: grid;
          grid-template-columns: 1fr auto;
          min-height: 3.5mm;
          align-items: center;
        }

        .total-row .label {
          color: #555;
        }

        .total-row .amount {
          text-align: right;
          white-space: nowrap;
        }

        .total-row.discount .amount,
        .total-row.change .amount {
          color: var(--green);
        }

        .total-row.grand {
          margin-top: 0.8mm;
          padding-top: 1mm;
          border-top: 1px solid var(--line);
          font-weight: 700;
          font-size: 10.4px;
        }

        .paid-heading {
          margin-top: 1mm;
          color: #555;
        }

        /* =========================
           TERMS — live in the receipt footer (balanced 2-col)
           ========================= */
        .terms-title {
          margin: 0 0 1mm;
          font-size: 9.6px;
          font-weight: 700;
          text-align: left;
        }

        .terms-grid {
          /* Word-processor style columns: content fills the left column to
             the balanced height, then flows on into the right column. */
          column-count: 2;
          column-gap: 4mm;
          text-align: left;
        }

        .terms-list {
          margin: 0;
          padding: 0 0 0 4mm;
        }

        .terms-list li {
          padding-left: 0.5mm;
          margin: 0 0 0.8mm;
          font-size: 8px;
          line-height: 1.4;
          /* Keep each term whole; a term never splits across the columns. */
          break-inside: avoid;
          page-break-inside: avoid;
        }

        /* Numbering now matches usual text colour (not accent). */
        .terms-list li::marker {
          color: var(--text);
          font-weight: 700;
          font-size: 8.8px;
        }

        .terms-note {
          margin-top: 1mm;
          color: var(--muted);
          font-size: 8px;
          text-align: left;
        }

        .highlight {
          color: var(--accent);
          font-weight: 700;
        }

        /* =========================
           FOOTER
           ========================= */
        .footer {
          margin-top: auto; /* pinned to the bottom of the A5 sheet */
          padding-top: 1.2mm;
          border-top: 1px solid var(--line);
          text-align: center;
        }

        .footer .terms-grid {
          margin-bottom: 1.5mm;
        }

        /* Settings → receiptHeader banner */
        .receipt-banner {
          margin-top: 1.5mm;
          padding: 1mm 1.5mm;
          border: 1px solid var(--line);
          border-radius: 3px;
          background: #faf7f2;
          text-align: center;
          font-size: 8.8px;
          font-weight: 700;
          color: var(--accent);
        }

        /* Settings → receiptFooter note */
        .footer-note {
          margin-bottom: 1mm;
          font-size: 8.4px;
          color: var(--muted);
        }

        .thank-you {
          font-size: 8.8px;
          margin-bottom: 1mm;
        }

        .agent-num {
          font-weight: 700;
          white-space: nowrap;
        }

        .agent-num img {
          height: 3mm;
          vertical-align: middle;
          margin-left: 0.5mm;
          margin-top: -1px;
        }

        @media screen {
          .invoice {
            margin: 20px auto;
            box-shadow: 0 5px 30px rgba(0,0,0,.12);
          }
        }

        @media print {
          html, body {
            background: #fff;
          }

          .invoice {
            box-shadow: none;
            page-break-after: always;
          }

          .invoice:last-of-type {
            page-break-after: auto;
          }
        }
      </style>
    </head>

    <body>
    <main class="invoice">
      <div class="watermark"><img src="/pslogo.png" alt="" /></div>

      <!-- ================= HEADER ================= -->
      <header class="header">
        <div>
          ${data.storeInfo.logo ? `<img src="${data.storeInfo.logo}" alt="${data.storeInfo.name || "Store"}" style="max-height: 36px; max-width: 120px; object-fit: contain; display: block; margin-bottom: 3px;" />` : ""}
          <h1 class="store-name">${data.storeInfo.name || "Play Store"}</h1>

          <p class="store-line">
            ${data.storeInfo.address || "Shop # 27, 4th Floor, Noakhali Super Market"}
          </p>

          <p class="store-line">
            ${data.storeInfo.address ? "" : "Maijdee, Noakhali"}
          </p>

          <p class="store-line">
            <span class="agent-num">01727811918 <img src="/bkashAgent.png" alt="bKash" /></span>
            <span class="agent-num">01308753214 <img src="/nagadAgent.png" alt="Nagad" /></span>
            ${data.storeInfo.email ? `| Email: ${data.storeInfo.email}` : "| Email: info@playstore.com.bd"}
          </p>

          <div class="store-links">
            ${
              data.storeInfo.website
                ? `
            <!-- Website -->
            <a class="store-link" href="${data.storeInfo.website}">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3.5 12h17M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"
                      fill="none" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              ${data.storeInfo.website.replace(/^https?:\/\//, "")}
            </a>
            `
                : `
            <!-- Website -->
            <a class="store-link" href="https://www.playstore.com.bd">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>
                <path d="M3.5 12h17M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"
                      fill="none" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              www.playstore.com.bd
            </a>
            `
            }

            <!-- Facebook -->
            <a class="store-link" href="https://facebook.com/playstorebd">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.4 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H8v3h2.3v8h3.1Z"
                      fill="currentColor"/>
              </svg>
              playstorebd.com
            </a>

          </div>
        </div>

        <div class="invoice-meta">
          <!-- These values are intended to be populated by your system -->
          <div class="ref">Ref: ${data.barcodeNumber}</div>
          <div class="invoice-date">${formatDate(data.date)}</div>

          <div class="barcode-box">
            <!-- Filled by JsBarcode; every printed copy gets its own .barcode svg. -->
            <svg class="barcode" style="width: 28mm; height: 8mm; display: block;"></svg>
            <div class="barcode-number">${data.barcodeNumber}</div>
          </div>
        </div>
      </header>

      <!-- ================= CUSTOMER ================= -->
      <section class="section customer-card">
        <h2 class="section-title">Customer Details</h2>

        <div class="customer-grid">
          <div class="customer-field">
            <strong>Name:</strong> ${data.customer.name}
          </div>

          <div class="customer-field">
            <strong>Phone:</strong> ${data.customer.phone || "N/A"}
          </div>

          <div class="customer-field">
            <strong>Address:</strong> ${data.customer.address || "N/A"}
          </div>
        </div>
      </section>


      ${
        data.isExchange && data.exchangeItems
          ? `
      <!-- ================= DEVICE INFORMATION (Exchange) ================= -->
      <section class="section customer-card">
        <h2 class="section-title">Device Information</h2>

        <div class="customer-grid">
          ${
            data.exchangeItems.oldItems && data.exchangeItems.oldItems.length > 0
              ? data.exchangeItems.oldItems
                  .map(
                    (item) => `
            <div class="customer-field">
              <strong>Trade-in Device:</strong> ${item.description}
              ${item.imei1 ? `<br><strong>IMEI 1:</strong> ${item.imei1}` : ""}
              ${item.imei2 ? `<br><strong>IMEI 2:</strong> ${item.imei2}` : ""}
              ${item.serialNumber ? `<br><strong>S/N:</strong> ${item.serialNumber}` : ""}
            </div>
            `,
                  )
                  .join("")
              : ""
          }

          ${
            data.exchangeItems.newItems && data.exchangeItems.newItems.length > 0
              ? data.exchangeItems.newItems
                  .map(
                    (item) => `
            <div class="customer-field">
              <strong>New Device:</strong> ${item.description}
              ${item.imei1 ? `<br><strong>IMEI 1:</strong> ${item.imei1}` : ""}
              ${item.imei2 ? `<br><strong>IMEI 2:</strong> ${item.imei2}` : ""}
              ${item.serialNumber ? `<br><strong>S/N:</strong> ${item.serialNumber}` : ""}
            </div>
            `,
                  )
                  .join("")
              : ""
          }
        </div>
      </section>
      `
          : ""
      }

      <!-- ================= SALES ITEMS ================= -->
      <section class="section">
        <h2 class="section-title sales-title">Sales Items</h2>

        <table class="items">
          <thead>
            <tr>
              <th class="sl">SL</th>
              <th class="description">Description</th>
              <th class="unit-price">Unit Price</th>
              <th class="qty">Qty</th>
              <th class="total">Total</th>
            </tr>
          </thead>

          <tbody>
            ${data.items
              .map(
                (item) => `
            <tr>
              <td class="sl">${item.sl}</td>

              <td class="description">
                <div class="description-main">${item.description}</div>
                ${itemIdentifierParts(item).length ? `<div class="description-sub">${itemIdentifierHtml(item)}</div>` : ""}
              </td>

              <td class="unit-price money">${formatCurrency(item.unitPrice)}</td>
              <td class="qty">${item.qty}</td>
              <td class="total money">${formatCurrency(item.total)}</td>
            </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>


        <!-- ================= TOTALS ================= -->
        <div class="totals">

          <div class="total-row">
            <div class="label">Subtotal:</div>
            <div class="amount">${formatCurrency(data.totals.subtotal)}</div>
          </div>

          ${
            data.totals.tradeInCredit && data.totals.tradeInCredit > 0
              ? `
          <div class="total-row discount">
            <div class="label">Trade-in Value:</div>
            <div class="amount">-${formatCurrency(data.totals.tradeInCredit)}</div>
          </div>
          `
              : ""
          }

          ${
            data.totals.discount && data.totals.discount > 0
              ? `
          <div class="total-row discount">
            <div class="label">Discount:</div>
            <div class="amount">-${formatCurrency(data.totals.discount)}</div>
          </div>
          `
              : ""
          }

          ${
            data.totals.tax && data.totals.tax > 0
              ? `
          <div class="total-row">
            <div class="label">Tax:</div>
            <div class="amount">${formatCurrency(data.totals.tax)}</div>
          </div>
          `
              : ""
          }

          <div class="total-row grand">
            <div class="label">Grand Total:</div>
            <div class="amount">${formatCurrency(data.totals.grandTotal)}</div>
          </div>

          <div class="total-row paid-heading">
            <div class="label">Paid:</div>
            <div class="amount"></div>
          </div>

          ${
            data.payments && data.payments.length > 0
              ? data.payments
                  .map(
                    (p) =>
                      `<div class="total-row">
                        <div class="label">${data.isReturn ? `${paymentLineLabel(p.method)} Received` : paymentLineLabel(p.method)}:</div>
                        <div class="amount">${formatCurrency(p.amount)}${paymentLineRef(p.reference)}</div>
                      </div>`,
                  )
                  .join("")
              : `<div class="total-row">
                  <div class="label">Cash:</div>
                  <div class="amount">${formatCurrency(data.totals.paid)}</div>
                </div>`
          }

          ${
            data.totals.change !== undefined && data.totals.change >= 0
              ? `
          <div class="total-row change">
            <div class="label">Change:</div>
            <div class="amount">${formatCurrency(data.totals.change)}</div>
          </div>
          `
              : ""
          }

        </div>
      </section>


      ${
        data.isReturn && data.returnInfo
          ? `
      <!-- ============ SIGNATURE — print-only customer validator ============ -->
      <section class="section" style="padding: 3.5mm 0 0;">
        <div style="width: 58mm; margin: 0 auto 1.2mm; border-bottom: 1px solid var(--text);">&nbsp;</div>
        <div style="text-align: center; font-size: 8.6px;">Received by (Customer Signature)</div>
      </section>
      `
          : ""
      }

      <!-- ============ FOOTER — terms & conditions live here ============ -->
      <footer class="footer">

        <div class="thank-you">${headerText || "Thank you for your business!"}</div>
        <h2 class="terms-title">বিশেষ দ্রষ্টব্যঃ</h2>

        <div class="terms-grid">
          <ol class="terms-list">
            ${allTermsItems}
          </ol>
        </div>

        ${footerText ? `<div class="footer-note">${footerText}</div>` : ""}

      </footer>

    </main>


    <script>
      // Settings → receiptCopies: clone the invoice before barcodes are drawn so
      // each copy gets its own scannable barcode.
      (function() {
        try {
          var copies = ${copies};
          var first = document.querySelector(".invoice");
          if (first && copies > 1) {
            for (var i = 1; i < copies; i++) {
              first.parentNode.insertBefore(first.cloneNode(true), first.nextSibling);
            }
          }
        } catch(e) {
          console.error("Receipt copy duplication error:", e);
        }
      })();
    </script>

    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
    <script>
      (function() {
        try {
          document.querySelectorAll(".barcode").forEach(function(el) {
            JsBarcode(el, "${data.barcodeNumber}", {
              format: "CODE128",
              lineColor: "#000000",
              width: 1.5,
              height: 40,
              displayValue: false,
              margin: 0
            });
          });
        } catch(e) {
          console.error("Barcode generation error:", e);
        }
      })();
    </script>

    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.focus();
    // The old fixed 250ms timer raced the logo <img> fetches — a logo that
    // hadn't arrived yet (typically Nagad) reached the print dialog blank.
    // Print only once every image has loaded or errored, with a hard cap so a
    // hung request can never block printing.
    let fired = false;
    const doPrint = () => {
      if (fired) return;
      fired = true;
      printWindow.print();
      printWindow.close();
    };
    Promise.all(
      Array.from(printWindow.document.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    ).then(() => setTimeout(doPrint, 250));
    setTimeout(doPrint, 5000);
  } else {
    throw new Error("Unable to open print window. Please check popup blocker settings.");
  }
}

// Fallback PDF generation
export async function generateReceiptPDF(data: ReceiptData) {
  try {
    data = applyNetPricing(data);
    const jspdf = await import("jspdf");
    const jsPDF = jspdf.default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });

    const formatCurrency = (amount: number) => `৳${amount.toLocaleString()}`;
    const formatDate = (date: Date) =>
      date.toLocaleDateString("en-BD", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

    const margin = 7;
    const pageWidth = 148;
    let y = 8;

    const accent: [number, number, number] = [215, 123, 18];

    // Bangla glyphs are missing from jsPDF's built-in fonts; register a Bengali
    // font when available so the terms render instead of empty boxes.
    let bengaliFont = "helvetica";
    try {
      const fontRes = await fetch("/fonts/NotoSansBengali-Regular.ttf");
      if (fontRes.ok) {
        doc.addFileToVFS(
          "NotoSansBengali-Regular.ttf",
          arrayBufferToBase64(await fontRes.arrayBuffer()),
        );
        doc.addFont("NotoSansBengali-Regular.ttf", "NotoSansBengali", "normal");
        bengaliFont = "NotoSansBengali";
      }
    } catch {
      bengaliFont = "helvetica";
    }

    // Best-effort image loader — returns null on any failure so a missing
    // asset never blocks receipt generation.
    const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    // Header logo from store settings (best-effort, silently skipped on failure)
    const logoDataUrl = data.storeInfo.logo ? await loadImageAsDataUrl(data.storeInfo.logo) : null;
    // Watermark uses the store's brand logo shipped with the app
    const watermarkDataUrl = await loadImageAsDataUrl("/pslogo.png");

    // Logo watermark — centered on the page, painted first so every other
    // element (drawn later) sits on top of it.
    if (watermarkDataUrl) {
      try {
        const wmProps = doc.getImageProperties(watermarkDataUrl);
        const wmW = 103.5; // mm — 15% larger watermark
        const wmH = Math.min((wmW * wmProps.height) / wmProps.width, 138);
        const mime = watermarkDataUrl.slice(5, watermarkDataUrl.indexOf(";"));
        const fmt = mime === "image/png" ? "PNG" : mime === "image/webp" ? "WEBP" : "JPEG";
        doc.saveGraphicsState();
        doc.setGState(new jspdf.GState({ opacity: 0.06 }));
        doc.addImage(
          watermarkDataUrl,
          fmt,
          (pageWidth - wmW) / 2,
          (doc.internal.pageSize.getHeight() - wmH) / 2,
          wmW,
          wmH,
        );
        doc.restoreGraphicsState();
      } catch {
        // watermark is cosmetic — ignore any failure
      }
    }

    // Store info (left side - header area)
    if (logoDataUrl) {
      try {
        const imgProps = doc.getImageProperties(logoDataUrl);
        const logoH = 10;
        const logoW = Math.min((logoH * imgProps.width) / imgProps.height, 28);
        const mime = logoDataUrl.slice(5, logoDataUrl.indexOf(";"));
        const fmt = mime === "image/png" ? "PNG" : mime === "image/webp" ? "WEBP" : "JPEG";
        doc.addImage(logoDataUrl, fmt, margin, y, logoW, logoH);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(data.storeInfo.name || "Store", margin, y + logoH + 4);
      } catch {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(data.storeInfo.name || "Store", margin, y + 4);
      }
    } else {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(data.storeInfo.name || "Store", margin, y + 4);
    }
    y += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    if (data.storeInfo.address) {
      const addressLines = doc.splitTextToSize(data.storeInfo.address, 60);
      doc.text(addressLines, margin, y);
      y += addressLines.length * 2.6 + 0.5;
    }

    // Two mobile-payment agent numbers (logo right of each) replace the old
    // single "Tel:" line — the logo itself identifies the service.
    const agentNums: Array<[string, string]> = [
      ["01727811918", "/bkashAgent.png"],
      ["01308753214", "/nagadAgent.png"],
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    let agentX = margin;
    for (const [num, logoSrc] of agentNums) {
      doc.text(num, agentX, y);
      agentX += doc.getTextWidth(num) + 1;
      const agentLogo = await loadImageAsDataUrl(logoSrc);
      if (agentLogo) {
        try {
          const agentProps = doc.getImageProperties(agentLogo);
          const logoH = 3;
          const logoW = (logoH * agentProps.width) / agentProps.height;
          doc.addImage(agentLogo, agentProps.fileType || "PNG", agentX, y - 2.4, logoW, logoH);
          agentX += logoW + 3;
        } catch {
          // logo is cosmetic — ignore any failure
        }
      }
    }
    doc.setFont("helvetica", "normal");
    if (data.storeInfo.email) {
      doc.text(`| Email: ${data.storeInfo.email}`, agentX, y);
    }
    y += 2.5;

    // Invoice & barcode (right side)
    const rightColX = pageWidth - 52 - margin;
    doc.setFontSize(8.8);
    doc.setTextColor(50, 50, 50);
    doc.text(`Ref: ${data.barcodeNumber}`, rightColX + 52, 8, { align: "right" });
    doc.setFontSize(8);
    doc.setTextColor(68, 68, 68);
    doc.text(formatDate(data.date), rightColX + 52, 12, { align: "right" });

    // Barcode box
    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.3);
    doc.rect(rightColX + 10, 14, 35, 15, "D");
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(data.barcodeNumber, rightColX + 27.5, 26, { align: "center" });

    // Header separator
    doc.setDrawColor(222, 222, 222);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
    y += 2;

    const cardWidth = pageWidth - margin * 2;
    const headerText = data.headerText?.trim();

    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, cardWidth, 12, 2, 2, "S");

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Customer Details", margin + 3, y + 4);

    doc.setFontSize(9.6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(85, 85, 85);

    const colWidth = cardWidth / 3;
    doc.text(`Name: ${data.customer.name}`, margin + 3, y + 9);
    doc.text(`Phone: ${data.customer.phone || "N/A"}`, margin + colWidth + 3, y + 9);
    doc.text(`Address: ${data.customer.address || "N/A"}`, margin + colWidth * 2 + 3, y + 9);
    y += 13;

    // Device information for exchange invoices
    if (data.isExchange && data.exchangeItems) {
      doc.setDrawColor(222, 222, 222);
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, y, cardWidth, 16, 2, 2, "S");

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(50, 50, 50);
      doc.text("Device Information", margin + 3, y + 4);

      doc.setFontSize(8.4);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(85, 85, 85);

      let deviceY = y + 9;
      if (data.exchangeItems.oldItems && data.exchangeItems.oldItems.length > 0) {
        const oldItem = data.exchangeItems.oldItems[0];
        doc.text(`Trade-in: ${oldItem.description}`, margin + 3, deviceY);
        if (oldItem.imei1) doc.text(`IMEI 1: ${oldItem.imei1}`, margin + 3, deviceY + 4);
        if (oldItem.imei2) doc.text(`IMEI 2: ${oldItem.imei2}`, margin + 3, deviceY + 8);
        if (oldItem.serialNumber)
          doc.text(`S/N: ${oldItem.serialNumber}`, margin + 3, deviceY + 12);
      }

      if (data.exchangeItems.newItems && data.exchangeItems.newItems.length > 0) {
        const newItem = data.exchangeItems.newItems[0];
        doc.text(`New Device: ${newItem.description}`, margin + colWidth + 3, deviceY);
        if (newItem.imei1) doc.text(`IMEI 1: ${newItem.imei1}`, margin + colWidth + 3, deviceY + 4);
        if (newItem.imei2) doc.text(`IMEI 2: ${newItem.imei2}`, margin + colWidth + 3, deviceY + 8);
        if (newItem.serialNumber)
          doc.text(`S/N: ${newItem.serialNumber}`, margin + colWidth + 3, deviceY + 12);
      }

      y += 17;
    }

    // Sales or exchange header
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Sales Items", margin, y);
    y += 4;

    // Items table
    const tableWidth = pageWidth - margin * 2;
    const colWidths = [
      tableWidth * 0.1, // SL - 10%
      tableWidth * 0.47, // Description - 47%
      tableWidth * 0.17, // Unit Price - 17%
      tableWidth * 0.1, // Qty - 10%
      tableWidth * 0.16, // Total - 16%
    ];

    // Table header
    let xPos = margin;
    const itemsTableTop = y;
    doc.setDrawColor(222, 222, 222);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    y += 2.5;
    doc.setFontSize(9.6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);

    // Center align SL and Qty columns
    doc.text("SL", xPos + colWidths[0] / 2, y, { align: "center" });
    xPos += colWidths[0];
    doc.text("Description", xPos + 3, y);
    xPos += colWidths[1];
    doc.text("Unit Price", xPos + colWidths[2] - 3, y, { align: "right" });
    xPos += colWidths[2];
    doc.text("Qty", xPos + colWidths[3] / 2, y, { align: "center" });
    xPos += colWidths[3];
    doc.text("Total", xPos + colWidths[4] - 3, y, { align: "right" });

    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 2;

    // Table body — same size as the description text for a uniform table
    doc.setFontSize(10.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    data.items.forEach((item) => {
      xPos = margin;

      // SL
      doc.text(String(item.sl), xPos + colWidths[0] / 2, y, { align: "center" });
      xPos += colWidths[0];

      // Description — IMEIs vertically stacked, same size as the row text
      doc.text(item.description, xPos + 3, y);
      const idParts = itemIdentifierParts(item);
      if (idParts.length) {
        doc.setTextColor(68, 68, 68);
        idParts.forEach((part, idx) => {
          doc.text(part, xPos + 3, y + 4 + idx * 3.8);
        });
        doc.setTextColor(50, 50, 50);
      }
      xPos += colWidths[1];

      // Unit Price
      doc.text(formatCurrency(item.unitPrice), xPos + colWidths[2] - 3, y, { align: "right" });
      xPos += colWidths[2];

      // Qty
      doc.text(String(item.qty), xPos + colWidths[3] / 2, y, { align: "center" });
      xPos += colWidths[3];

      // Total
      doc.setFont("helvetica", "bold");
      doc.text(formatCurrency(item.total), xPos + colWidths[4] - 3, y, { align: "right" });
      doc.setFont("helvetica", "normal");

      y += idParts.length ? 3 + idParts.length * 3.2 + 0.8 : 3.5;
      doc.line(margin, y, pageWidth - margin, y);
      y += 2;

      // Page break if needed
      if (y > 260) {
        doc.addPage();
        y = margin;
      }
    });

    // Vertical grid lines — matches the bordered items table in the HTML receipt
    const itemsTableBottom = y - 2; // last row already drew its bottom border
    doc.setDrawColor(222, 222, 222);
    doc.setLineWidth(0.5);
    let edgeX = margin;
    for (let i = 0; i <= colWidths.length; i++) {
      doc.line(edgeX, itemsTableTop, edgeX, itemsTableBottom);
      if (i < colWidths.length) edgeX += colWidths[i];
    }

    // Totals section (60% width, right-aligned)
    y += 2;
    const totalsWidth = tableWidth * 0.6;
    const totalsX = pageWidth - margin - totalsWidth;

    const totals = [
      {
        label: "Subtotal:",
        value: formatCurrency(data.totals.subtotal),
      },
      ...(data.totals.tradeInCredit && data.totals.tradeInCredit > 0
        ? [
            {
              label: "Trade-in Value:",
              value: `-${formatCurrency(data.totals.tradeInCredit)}`,
              color: [10, 163, 69],
            },
          ]
        : []),
      ...(data.totals.discount && data.totals.discount > 0
        ? [
            {
              label: "Discount:",
              value: `-${formatCurrency(data.totals.discount)}`,
              color: [10, 163, 69],
            },
          ]
        : []),
      ...(data.totals.tax && data.totals.tax > 0
        ? [{ label: "Tax:", value: formatCurrency(data.totals.tax) }]
        : []),
      {
        label: "Grand Total:",
        value: formatCurrency(data.totals.grandTotal),
        bold: true,
        borderTop: true,
      },
      { label: "Paid:", value: "", separator: true },
      ...(data.payments && data.payments.length > 0
        ? data.payments.map((p) => ({
            label: data.isReturn
              ? `${paymentLineLabel(p.method)} Received:`
              : `${paymentLineLabel(p.method)}:`,
            value: `${formatCurrency(p.amount)}${paymentLineRef(p.reference)}`,
          }))
        : [{ label: "Cash:", value: formatCurrency(data.totals.paid) }]),
      ...(data.totals.change !== undefined && data.totals.change >= 0
        ? [
            {
              label: "Change:",
              value: formatCurrency(data.totals.change),
              color: [10, 163, 69],
              bold: true,
            },
          ]
        : []),
    ];

    totals.forEach((total) => {
      const rowHeight = 3.5;

      if ("borderTop" in total && total.borderTop) {
        doc.setDrawColor(222, 222, 222);
        doc.setLineWidth(0.5);
        doc.line(totalsX, y, totalsX + totalsWidth, y);
        y += 1;
      }

      if ("color" in total && Array.isArray(total.color)) {
        doc.setTextColor(
          (total.color as [number, number, number])[0],
          (total.color as [number, number, number])[1],
          (total.color as [number, number, number])[2],
        );
      } else {
        doc.setTextColor(102, 102, 102);
      }

      doc.setFontSize(total.bold ? 10.4 : 9.6);
      doc.setFont(total.bold ? "helvetica" : "helvetica", total.bold ? "bold" : "normal");
      doc.text(total.label, totalsX, y + rowHeight / 2);
      doc.text(total.value, totalsX + totalsWidth, y + rowHeight / 2, { align: "right" });

      y += rowHeight;
    });

    // Return receipt: print-only customer-signature validator line
    if (data.isReturn && data.returnInfo) {
      if (y > 175) {
        doc.addPage();
        y = margin;
      }
      y += 6;
      doc.setDrawColor(50, 50, 50);
      doc.setLineWidth(0.4);
      doc.line(pageWidth / 2 - 30, y + 10, pageWidth / 2 + 30, y + 10);
      doc.setFontSize(7.6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      doc.text("Received by (Customer Signature)", pageWidth / 2, y + 13.5, { align: "center" });
      y += 15;
    }

    // ── Footer: terms & conditions, pinned to the bottom & balanced ──
    // Same reorder as HTML: ক্রয় করা / অফিসিয়াল + বিক্রিত / মোবাইল কেনার পর / PLEASE KEEP left.
    const termColWidth = (pageWidth - margin * 2 - 4) / 2;
    const allStaticTermsPdf: string[] = [
      "Mobile Replacement গ্যারান্টি ৩ দিন।",
      "Display, battery Motherboard এর কোন প্রকার গ্যারান্টি নাই।",
      "সফটওয়্যার জনিত সমস্যা সার্ভিসের আওতাভুক্ত নয়।",
      "শপ থেকে বের হওয়ার পূর্বে মোবাইল ভালোভাবে চেক করে নিবেন। (শপ থেকে বের হওয়ার পর কোন অভিযোগ গ্রহণযোগ্য নহে)",
      "এক বছরের সার্ভিস ওয়ারেন্টি (Without Parts)",
      "Update অথবা Physically damage জনিত কোন সমস্যা গ্রহণযোগ্য নহে।",
      "অফিসিয়াল ফোনের ওয়ারেন্টির ক্ষেত্রে কাস্টমার কেয়ারে যোগাযোগ করুন।",
      "বিক্রিত মোবাইল কিংবা পণ্য ফেরতযোগ্য নয়।",
      "মোবাইল কেনার পর ফেরত দিতে চাইলে বা Exchange করতে চাইলে 25% থেকে নতুনের ক্ষেত্রে 35% Less দিতে হবে। (শর্ত সাপেক্ষে)",
      "ক্রয় করা পণ্য কিংবা মোবাইল Exchange না করে ক্যাশ টাকা ফেরত নিতে চাইলে (30%-40%) বাদ দেওয়া হবে।",
      "উপরিউক্ত সকল শর্ত পড়িয়া ও বুঝিয়া মোবাইল ক্রয় করিলাম।",
    ];
    const allPdfTerms = [...allStaticTermsPdf, ...policyTerms(data)];

    doc.setFontSize(7.6);
    doc.setFont(bengaliFont, "normal");

    // Measure first so the block can be pinned to the bottom of the sheet.
    const rowH = 2.6;
    const measure = (terms: string[], startNum: number) =>
      terms.map((term, i) => {
        const numStr = `${startNum + i}.`;
        const indent = doc.getTextWidth(numStr) + 1;
        return {
          numStr,
          indent,
          lines: doc.splitTextToSize(term, termColWidth - indent) as string[],
        };
      });
    type Measured = ReturnType<typeof measure>;

    // Balance the columns by height — the jsPDF analogue of a word
    // processor's flowing columns: keep adding terms to the left column
    // while that keeps both halves closest to equal height, then let the
    // rest continue in the right column.
    const measuredAll = measure(allPdfTerms, 1);
    const totalLines = measuredAll.reduce((n, it) => n + it.lines.length, 0);
    let acc = 0;
    let bestDiff = Infinity;
    let pdfMid = 0;
    for (let k = 0; k <= measuredAll.length; k++) {
      const diff = Math.abs(acc - (totalLines - acc));
      if (diff < bestDiff) {
        bestDiff = diff;
        pdfMid = k;
      }
      if (k < measuredAll.length) acc += measuredAll[k].lines.length;
    }

    const termsLeft = allPdfTerms.slice(0, pdfMid);
    const termsRight = allPdfTerms.slice(pdfMid);
    const leftItems = measure(termsLeft, 1);
    const rightItems = measure(termsRight, pdfMid + 1);
    const countLines = (items: Measured) => items.reduce((n, it) => n + it.lines.length, 0);
    const termsHeight = 6 + Math.max(countLines(leftItems), countLines(rightItems)) * rowH;
    const footerHeight = 21;

    let termsTop = Math.max(y + 2, 210 - margin - footerHeight - termsHeight);

    doc.setDrawColor(222, 222, 222);
    doc.setLineWidth(0.5);
    doc.line(margin, termsTop, pageWidth - margin, termsTop);
    termsTop += 1.5;

    // Settings header text ("Thank you for shopping!") — just above the terms heading.
    doc.setFont(bengaliFont, "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(50, 50, 50);
    doc.text(headerText || "Thank you for your business!", pageWidth / 2, termsTop, {
      align: "center",
    });
    termsTop += 3.5;

    doc.setFontSize(8.8);
    doc.setFont(bengaliFont, "normal");
    doc.setTextColor(50, 50, 50);
    doc.text("বিশেষ দ্রষ্টব্যঃ", margin, termsTop);
    termsTop += 2.5;

    const bodyColor: [number, number, number] = [50, 50, 50];

    const drawColumn = (items: Measured, x: number) => {
      let ly = termsTop;
      for (const item of items) {
        // Numbering now matches usual text colour (not accent).
        doc.setFont(bengaliFont, "normal");
        doc.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
        doc.text(item.numStr, x, ly);
        for (const line of item.lines) {
          doc.text(line, x + item.indent, ly);
          ly += rowH;
        }
      }
      return ly;
    };

    const leftEnd = drawColumn(leftItems, margin);
    const rightEnd = drawColumn(rightItems, margin + termColWidth + 4);
    y = Math.max(leftEnd, rightEnd) + 1.5;

    // Thank-you footer
    doc.setDrawColor(222, 222, 222);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 1.5;

    // Settings → receiptFooter note
    const footerText = data.footerText?.trim();
    if (footerText) {
      doc.setFont(bengaliFont, "normal");
      doc.setFontSize(8);
      doc.setTextColor(102, 102, 102);
      doc.text(footerText, pageWidth / 2, y, { align: "center" });
      y += 2.5;
    }

    doc.save(`${data.isReturn ? "return" : "invoice"}-${data.invoiceNumber}-${Date.now()}.pdf`);
  } catch (error) {
    console.error("PDF generation failed:", error);
    throw new Error("Failed to generate PDF invoice");
  }
}
