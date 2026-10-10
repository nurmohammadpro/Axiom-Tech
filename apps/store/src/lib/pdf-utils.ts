import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoreInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  tagline?: string;
}

export interface PDFColumn {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
}

export interface PDFReportConfig {
  title: string;
  subtitle?: string;
  storeInfo?: StoreInfo;
  dateRange?: { start: Date; end: Date };
  kpis?: { label: string; value: string }[];
  columns: PDFColumn[];
  rows: Record<string, string | number>[];
  grandTotal?: { label: string; value: string };
  details?: {
    left: { title: string; rows: { label: string; value: string; bold?: boolean }[] };
    right: { title: string; rows: { label: string; value: string; bold?: boolean }[] };
  };
  signatures?: { left: string; right: string };
  terms?: string[];
  notes?: string[];
}

// ── Design tokens (optimized for more content) ────────────────────────────────
const M = 8; // Reduced from 12 to 8 for more horizontal space
const C = {
  text: [30, 30, 30] as const,
  muted: [100, 100, 100] as const,
  light: [150, 150, 150] as const,
  faint: [200, 200, 200] as const,
  bg: [245, 245, 245] as const,
  border: [220, 220, 220] as const,
  headerBg: [240, 240, 240] as const,
  amber: [217, 119, 6] as const,
  amberBg: [255, 251, 235] as const,
};

function pw(doc: jsPDF) {
  return doc.internal.pageSize.getWidth();
}

function uw(doc: jsPDF) {
  return pw(doc) - M * 2;
}

// ── Date Range Utilities ───────────────────────────────────────────────────────

export function formatDateRange(start: Date, end: Date): string {
  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" });
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function getDateRangeForPeriod(
  period: "today" | "week" | "month" | "custom",
  customStart?: Date,
  customEnd?: Date,
): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
    case "week":
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart, end: today };
    case "month":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: today };
    case "custom":
      return { start: customStart || today, end: customEnd || today };
    default:
      return { start: today, end: today };
  }
}

// ── Currency ─────────────────────────────────────────────────────────────────

export function bdtPDF(amount: number): string {
  return `Tk ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function fmtNum(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function getDefaultStoreInfo(): StoreInfo {
  return {
    name: "Play Store",
    address: "123 Market Street, Dhaka",
    phone: "01727811918",
    email: "info@playstore.com.bd",
    tagline: "iPhone, Samsung, Pixel, MacBook & accessories on sale",
  };
}

// ── Header ───────────────────────────────────────────────────────────────────

function drawHeader(
  doc: jsPDF,
  store: StoreInfo,
  title: string,
  subtitle?: string,
  dateRange?: { start: Date; end: Date },
  logoDataUrl?: string | null,
): number {
  const w = pw(doc);
  let y = 12;

  // Logo (best-effort — same stacked idiom as receipt.ts; header grows only when present)
  if (logoDataUrl) {
    try {
      const imgProps = doc.getImageProperties(logoDataUrl);
      const logoH = 9;
      const logoW = Math.min((logoH * imgProps.width) / imgProps.height, 24);
      const mime = logoDataUrl.slice(5, logoDataUrl.indexOf(";"));
      const fmt = mime === "image/png" ? "PNG" : mime === "image/webp" ? "WEBP" : "JPEG";
      doc.addImage(logoDataUrl, fmt, M, y, logoW, logoH);
      y += logoH + 2;
    } catch {
      // Skip the logo and keep the header layout unchanged.
    }
  }

  // Store name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11); // Reduced from 13 to 11
  doc.setTextColor(...C.text);
  doc.text(store.name || "Store", M, y);

  // Date — right
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(
    new Date().toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" }),
    w - M,
    y,
    { align: "right" },
  );
  y += 4;

  // Address | Phone | Email
  const parts = [store.address, store.phone, store.email].filter(Boolean);
  if (parts.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    doc.text(parts.join("  |  "), M, y);
    y += 3;
  }

  // Date Range
  if (dateRange) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    const formatDate = (d: Date) =>
      d.toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" });
    const dateText = `Period: ${formatDate(dateRange.start)} - ${formatDate(dateRange.end)}`;
    doc.text(dateText, M, y);
    y += 3;
  }

  // Subtitle
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    doc.text(subtitle.toUpperCase(), M, y);
    y += 3;
  }

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9); // Reduced from 10 to 9 for more compact layout
  doc.setTextColor(...C.text);
  doc.text(title, M, y);
  y += 4; // Reduced spacing from 5 to 4

  // Border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.line(M, y, w - M, y);
  y += 3;

  return y;
}

// ── KPI Cards ────────────────────────────────────────────────────────────────

function drawKPIs(doc: jsPDF, startY: number, cards: { label: string; value: string }[]): number {
  const totalW = uw(doc);
  const gap = 2;
  const cardW = (totalW - gap * (cards.length - 1)) / cards.length;
  const cardH = 11;

  cards.forEach((card, i) => {
    const x = M + i * (cardW + gap);

    doc.setFillColor(...C.bg);
    doc.roundedRect(x, startY, cardW, cardH, 0.4, 0.4, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.light);
    doc.text(card.label.toUpperCase(), x + 2.5, startY + 3.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.text);
    doc.text(card.value, x + 2.5, startY + 8.5);
  });

  return startY + cardH + 3;
}

// ── Detail Section ───────────────────────────────────────────────────────────

function drawDetails(
  doc: jsPDF,
  startY: number,
  left: { title: string; rows: { label: string; value: string; bold?: boolean }[] },
  right: { title: string; rows: { label: string; value: string; bold?: boolean }[] },
): number {
  const totalW = uw(doc);
  const colW = (totalW - 8) / 2;

  const drawBox = (box: typeof left, x: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...C.light);
    doc.text(box.title.toUpperCase(), x, startY + 2.5);

    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(x, startY + 4, x + colW, startY + 4);

    let ry = startY + 7;
    for (const row of box.rows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...C.light);
      doc.text(row.label, x, ry);

      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.text);
      doc.text(row.value || "—", x + 22, ry);

      ry += 4;
    }
    return ry;
  };

  const leftEnd = drawBox(left, M);
  const rightEnd = drawBox(right, M + colW + 8);
  return Math.max(leftEnd, rightEnd) + 2;
}

// ── Table ────────────────────────────────────────────────────────────────────

function drawTable(
  doc: jsPDF,
  startY: number,
  columns: PDFColumn[],
  rows: Record<string, string | number>[],
): number {
  const head = [columns.map((c) => c.header)];
  const body = rows.map((row) => columns.map((col) => String(row[col.key] ?? "—")));

  // Scale column widths to fit
  const totalW = uw(doc);
  const definedWidths = columns.filter((c) => c.width).map((c) => c.width!);
  const autoCount = columns.length - definedWidths.length;
  const usedWidth = definedWidths.reduce((a, b) => a + b, 0);
  const autoW = autoCount > 0 ? (totalW - usedWidth) / autoCount : 0;

  const colStyles: Record<number, any> = {};
  columns.forEach((col, i) => {
    colStyles[i] = {
      cellWidth: col.width || autoW,
      halign: col.align || (i === 0 ? "center" : "left"),
    };
  });

  const result = autoTable(doc, {
    startY,
    head,
    body,
    theme: "plain",
    margin: { left: M, right: M },
    headStyles: {
      fillColor: [...C.headerBg],
      textColor: [...C.muted],
      fontStyle: "bold",
      fontSize: 6, // Reduced from 7 to 6
      cellPadding: 1.5, // Reduced from 2 to 1.5
      halign: "left",
      lineWidth: 0.1,
      lineColor: [...C.border],
    },
    bodyStyles: {
      fontSize: 7, // Reduced from 8 to 7
      cellPadding: 1.5, // Reduced from 2 to 1.5
      textColor: [...C.text],
      lineWidth: 0.08,
      lineColor: [...C.border],
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: colStyles,
  });

  return (result as any)?.finalY ?? (doc as any)?.lastAutoTable?.finalY ?? startY;
}

// ── Grand Total ──────────────────────────────────────────────────────────────

function drawGrandTotal(doc: jsPDF, startY: number, label: string, value: string): number {
  const totalW = uw(doc);
  const rowH = 7;

  doc.setFillColor(...C.bg);
  doc.rect(M, startY, totalW, rowH, "F");

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.line(M, startY, M + totalW, startY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  doc.text(label.toUpperCase(), M + totalW - 42, startY + rowH / 2 + 0.8, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  doc.text(value, M + totalW - 3, startY + rowH / 2 + 0.8, { align: "right" });

  return startY + rowH;
}

// ── Signatures ───────────────────────────────────────────────────────────────

function drawSigs(doc: jsPDF, startY: number, leftLabel: string, rightLabel: string): number {
  const totalW = uw(doc);
  const colW = (totalW - 12) / 2;
  const lineY = startY + 18;

  doc.setDrawColor(...C.faint);
  doc.setLineWidth(0.2);
  doc.line(M, lineY, M + colW, lineY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.light);
  doc.text(leftLabel.toUpperCase(), M + colW / 2, lineY + 3, { align: "center" });

  const rx = M + colW + 12;
  doc.line(rx, lineY, rx + colW, lineY);
  doc.text(rightLabel.toUpperCase(), rx + colW / 2, lineY + 3, { align: "center" });

  return lineY + 6;
}

// ── Terms ────────────────────────────────────────────────────────────────────

function drawTermSection(doc: jsPDF, startY: number, terms: string[], notes?: string[]): number {
  let y = startY;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.2);
  doc.line(M, y, pw(doc) - M, y);
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...C.light);
  doc.text("TERMS & CONDITIONS", M, y);
  y += 3.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.muted);
  terms.forEach((term, i) => {
    doc.text(`${i + 1}. ${term}`, M + 2, y);
    y += 3.5;
  });

  if (notes?.length) {
    y += 1.5;
    for (const note of notes) {
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(M, y - 2.5, uw(doc), 5, 0.4, 0.4, "F");
      doc.setFillColor(...C.amber);
      doc.rect(M, y - 2.5, 0.6, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(93, 64, 55);
      doc.text(note, M + 3.5, y + 0.3);
      y += 6;
    }
  }

  return y;
}

// ── Footer ───────────────────────────────────────────────────────────────────

function drawFoot(doc: jsPDF) {
  const w = pw(doc);
  const h = doc.internal.pageSize.getHeight();
  const y = h - 7;

  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.15);
  doc.line(M, y, w - M, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.light);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" });
  doc.text(`Generated on ${dateStr}, ${timeStr}`, M, y + 3);
  doc.text(
    `Page ${doc.getCurrentPageInfo().pageNumber} of ${doc.getNumberOfPages()}`,
    w - M,
    y + 3,
    { align: "right" },
  );
}

// ── Public: Generate PDF from config ─────────────────────────────────────────

export async function generatePDF(config: PDFReportConfig): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const store = config.storeInfo || getDefaultStoreInfo();

  // Best-effort logo load for the header (silently skipped on failure) — same as receipt.ts
  let logoDataUrl: string | null = null;
  if (store.logo) {
    try {
      const res = await fetch(store.logo);
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      logoDataUrl = null;
    }
  }

  let y = drawHeader(doc, store, config.title, config.subtitle, config.dateRange, logoDataUrl);

  if (config.kpis?.length) {
    y = drawKPIs(doc, y, config.kpis);
  }

  if (config.details) {
    y = drawDetails(doc, y, config.details.left, config.details.right);
  }

  y = drawTable(doc, y, config.columns, config.rows);

  if (config.grandTotal) {
    y = drawGrandTotal(doc, y, config.grandTotal.label, config.grandTotal.value);
  }

  if (config.signatures) {
    y = drawSigs(doc, y, config.signatures.left, config.signatures.right);
  }

  if (config.terms?.length) {
    drawTermSection(doc, y, config.terms, config.notes);
  }

  drawFoot(doc);

  const filename = `${config.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

// ── Identity record PDF ──────────────────────────────────────────────────────

export interface IdentityPDFConfig {
  storeInfo: StoreInfo;
  supplier: {
    name: string;
    type: string;
    nidNumber: number | null;
    dob: string | null;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
  };
  images: { url: string }[]; // already-resolved data URIs, front then back
}

function imageFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  if (mime === "image/png") return "PNG";
  if (mime === "image/webp") return "WEBP";
  return "JPEG";
}

export async function generateIdentityPDF(config: IdentityPDFConfig): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const store = config.storeInfo || getDefaultStoreInfo();
  const s = config.supplier;

  // Page 1 — identity record (info only)
  const y = drawHeader(doc, store, "Supplier Identity Record", "For verification purposes");

  drawDetails(
    doc,
    y,
    {
      title: "Supplier Info",
      rows: [
        { label: "Name", value: s.name, bold: true },
        { label: "NID Number", value: s.nidNumber ? String(s.nidNumber) : "—", bold: true },
        {
          label: "Date of Birth",
          value: s.dob ? new Date(s.dob).toLocaleDateString("en-BD") : "—",
        },
        { label: "Type", value: s.type.charAt(0).toUpperCase() + s.type.slice(1) },
      ],
    },
    {
      title: "Contact",
      rows: [
        { label: "Contact Person", value: s.contactPerson || "—" },
        { label: "Phone", value: s.phone || "—" },
        { label: "Email", value: s.email || "—" },
        { label: "Address", value: [s.address, s.city].filter(Boolean).join(", ") || "—" },
      ],
    },
  );

  drawFoot(doc);

  // Page 2 — combined NID document (front + back)
  doc.addPage();
  const page2Y = drawHeader(doc, store, "Supplier Identity Record", "NID Document");

  const totalW = uw(doc);
  const gap = 4;
  const imgW = (totalW - gap) / 2;
  const footerY = 290;

  if (config.images.length === 0) {
    const boxH = 60;
    const boxY = page2Y + (footerY - page2Y) / 2 - boxH / 2;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.rect(M, boxY, totalW, boxH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.light);
    doc.text("No NID image on file", pw(doc) / 2, boxY + boxH / 2 + 1, { align: "center" });
  } else {
    const imgs = config.images.slice(0, 2).map((img) => {
      const props = doc.getImageProperties(img.url);
      const ratio = props.height > 0 ? props.width / props.height : 1.586;
      return { img, imgH: Math.min(imgW / ratio, 55) };
    });
    const blockH = Math.max(...imgs.map((x) => x.imgH)) + 7;
    const startY = page2Y + (footerY - page2Y) / 2 - blockH / 2;

    imgs.forEach(({ img, imgH }, i) => {
      const x = M + i * (imgW + gap);
      doc.addImage(img.url, imageFormat(img.url), x, startY, imgW, imgH);

      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.15);
      doc.roundedRect(x, startY, imgW, imgH, 0.5, 0.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(...C.light);
      doc.text(i === 0 ? "NID FRONT" : "NID BACK", x + imgW / 2, startY + imgH + 4, {
        align: "center",
      });
    });
  }

  drawFoot(doc);

  const filename = `supplier-identity-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

// ── Legacy compat ────────────────────────────────────────────────────────────

export function createPDF(): { doc: jsPDF } {
  return { doc: new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) };
}

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function drawInvoiceHeader(
  doc: jsPDF,
  store: StoreInfo,
  title: string,
  _docNumber?: string,
): number {
  return drawHeader(doc, store, title);
}

export function drawKPICards(
  doc: jsPDF,
  startY: number,
  cards: { label: string; value: string }[],
): number {
  return drawKPIs(doc, startY, cards);
}

export function drawDetailSection(
  doc: jsPDF,
  startY: number,
  left: { title: string; rows: { label: string; value: string; bold?: boolean }[] },
  right: { title: string; rows: { label: string; value: string; bold?: boolean }[] },
): number {
  return drawDetails(doc, startY, left, right);
}

export function drawProductTable(
  doc: jsPDF,
  startY: number,
  head: string[],
  rows: (string | number)[][],
  opts?: { colWidths?: number[]; rightAlignFrom?: number },
): number {
  const rightFrom = opts?.rightAlignFrom ?? 3;
  const totalW = uw(doc);

  let widths: (number | "auto")[];
  if (opts?.colWidths) {
    const sum = opts.colWidths.reduce((a, b) => a + b, 0);
    const scale = sum > totalW ? totalW / sum : 1;
    widths = opts.colWidths.map((w) => +(w * scale).toFixed(1));
  } else {
    widths = head.map(() => "auto");
  }

  const result = autoTable(doc, {
    startY,
    head: [head],
    body: rows,
    theme: "plain",
    margin: { left: M, right: M },
    headStyles: {
      fillColor: [...C.headerBg],
      textColor: [...C.muted],
      fontStyle: "bold",
      fontSize: 6, // Reduced from 7 to 6
      cellPadding: 1.5, // Reduced from 2 to 1.5
      halign: "left",
      lineWidth: 0.1,
      lineColor: [...C.border],
    },
    bodyStyles: {
      fontSize: 7, // Reduced from 8 to 7
      cellPadding: 1.5, // Reduced from 2 to 1.5
      textColor: [...C.text],
      lineWidth: 0.08,
      lineColor: [...C.border],
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: Object.fromEntries(
      head.map((_, i) => [
        i,
        {
          cellWidth: widths[i],
          halign: i >= rightFrom ? "right" : "left",
        },
      ]),
    ),
  });

  return (result as any)?.finalY ?? (doc as any)?.lastAutoTable?.finalY ?? startY;
}

export function drawGrandTotalLegacy(
  doc: jsPDF,
  startY: number,
  label: string,
  value: string,
): number {
  return drawGrandTotal(doc, startY, label, value);
}

export function drawTotals(
  doc: jsPDF,
  startY: number,
  rows: { label: string; value: string; bold?: boolean; highlight?: boolean; dim?: boolean }[],
): number {
  const totalW = uw(doc);
  const tableW = Math.min(70, totalW * 0.4);
  const x = M + totalW - tableW;
  let y = startY;

  for (const row of rows) {
    const rowH = row.highlight ? 7 : 5.5;

    if (row.highlight) {
      doc.setFillColor(...C.bg);
      doc.rect(x, y, tableW, rowH, "F");
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(x, y, x + tableW, y);
    } else {
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.1);
      doc.line(x, y, x + tableW, y);
    }

    doc.setFont("helvetica", row.bold || row.highlight ? "bold" : "normal");
    doc.setFontSize(8);
    const color = row.highlight || row.bold ? C.text : C.muted;
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(row.label, x + 3, y + rowH - 1.5);
    doc.text(row.value, x + tableW - 3, y + rowH - 1.5, { align: "right" });

    y += rowH;
  }

  return y + 2;
}

export function drawSignatures(
  doc: jsPDF,
  startY: number,
  leftLabel: string,
  rightLabel: string,
): number {
  return drawSigs(doc, startY, leftLabel, rightLabel);
}

export function drawTerms(doc: jsPDF, startY: number, terms: string[], notes?: string[]): number {
  return drawTermSection(doc, startY, terms, notes);
}

export function drawFooter(doc: jsPDF, _leftText?: string) {
  drawFoot(doc);
}

export function renderTable(
  doc: jsPDF,
  startY: number,
  head: string[][],
  body: (string | number)[][],
  opts?: { headStyles?: Record<string, any>; columnStyles?: Record<string, any> },
): number {
  const result = autoTable(doc, {
    startY,
    head,
    body,
    theme: "striped",
    headStyles: {
      fillColor: [...C.headerBg],
      textColor: [...C.muted],
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: 2,
      ...opts?.headStyles,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: [...C.text],
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: opts?.columnStyles,
    margin: { left: M, right: M },
  });
  return (result as any)?.finalY ?? (doc as any)?.lastAutoTable?.finalY ?? startY;
}

// ── CSV Utility ─────────────────────────────────────────────────────────────

export function downloadCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
