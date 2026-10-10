/**
 * TSPL command builder for GP-3120TUD and compatible thermal label printers.
 * 203 DPI · max 80mm label width · TSC-compatible command language.
 *
 * Usage:
 *   const label = new TsplBuilder(40, 30)
 *     .text("iPhone 15 Pro", 10, 10, { bold: true })
 *     .barcode("IPH-001", 10, 30, "128", { height: 40 })
 *     .text("C A12 · S B25", 10, 80, { bold: true })
 *     .build();
 *   await printer.send(label);
 */

import { specsLineText } from "./label-specs";

export type BarcodeType =
  | "128"
  | "128C"
  | "128B"
  | "EAN13"
  | "EAN8"
  | "UPCA"
  | "UPCE"
  | "CODE39"
  | "CODE93"
  | "CODABAR"
  | "ITF"
  | "QR";

export interface TextOpts {
  font?: string;
  rotation?: number;
  xScale?: number;
  yScale?: number;
  bold?: boolean;
}

export interface BarcodeOpts {
  height?: number;
  human?: boolean;
  rotation?: number;
  narrow?: number;
  wide?: number;
  ecc?: string;
  mode?: string;
}

function esc(s: string) {
  return s.replace(/"/g, '""');
}

const CRLF = new TextEncoder().encode("\r\n");

export class TsplBuilder {
  /** Ordered list of raw byte chunks (text commands + any embedded binary bitmap data). */
  private chunks: Uint8Array[] = [];
  private gap: number;

  constructor(
    private labelWidth: number,
    private labelHeight: number,
    gap?: number,
  ) {
    this.gap = gap ?? 3;
    this.pushLine(`SIZE ${labelWidth} mm, ${labelHeight} mm`);
    this.pushLine(`GAP ${this.gap} mm, 0 mm`);
    this.pushLine("CLS");
  }

  /** Push a text command line, terminated with CRLF. */
  private pushLine(content: string): void {
    this.chunks.push(new TextEncoder().encode(content));
    this.chunks.push(CRLF);
  }

  /** Push raw bytes with no terminator (used to embed binary bitmap data mid-command). */
  private pushRaw(bytes: Uint8Array): void {
    this.chunks.push(bytes);
  }

  text(content: string, x: number, y: number, opts?: TextOpts): this {
    const font = opts?.bold ? "8" : opts?.font || "2";
    const rot = opts?.rotation || 0;
    const xs = opts?.xScale || 1;
    const ys = opts?.yScale || 1;
    this.pushLine(`TEXT ${x},${y},"${font}",${rot},${xs},${ys},"${esc(content)}"`);
    return this;
  }

  barcode(data: string, x: number, y: number, type: BarcodeType, opts?: BarcodeOpts): this {
    const h = opts?.height ?? 40;
    const human = opts?.human !== false ? 1 : 0;
    const rot = opts?.rotation || 0;
    const n = opts?.narrow || 2;
    const w = opts?.wide || 5;
    this.pushLine(`BARCODE ${x},${y},"${type}",${h},${human},${rot},${n},${w},"${esc(data)}"`);
    return this;
  }

  qr(data: string, x: number, y: number, opts?: BarcodeOpts): this {
    const ecc = opts?.ecc || "M";
    const cell = opts?.wide || 4;
    const mode = opts?.mode || "A";
    const rot = opts?.rotation || 0;
    this.pushLine(`QRCODE ${x},${y},"${mode}",${cell},${rot},"${esc(data)}"`);
    return this;
  }

  box(x1: number, y1: number, x2: number, y2: number, thickness: number = 1): this {
    this.pushLine(`BOX ${x1},${y1},${x2},${y2},${thickness}`);
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, thickness: number = 1): this {
    this.pushLine(`LINE ${x1},${y1},${x2},${y2},${thickness}`);
    return this;
  }

  /**
   * Embed a monochrome bitmap (1 bit/pixel, MSB-first, 0-padded to a byte per row).
   * `widthBytes` must equal Math.ceil(widthPx / 8); `data.length` must equal widthBytes * heightPx.
   * mode: 0 = OVERWRITE, 1 = OR, 2 = XOR.
   */
  bitmap(
    x: number,
    y: number,
    widthBytes: number,
    heightPx: number,
    data: Uint8Array,
    mode: number = 0,
  ): this {
    this.pushLine(`BITMAP ${x},${y},${widthBytes},${heightPx},${mode},`);
    // Overwrite the trailing CRLF we just pushed with the raw bitmap bytes, then re-terminate.
    this.chunks.pop(); // drop CRLF
    this.pushRaw(data);
    this.chunks.push(CRLF);
    return this;
  }

  /** Add a beep command. */
  sound(length: number = 50, interval: number = 200): this {
    this.pushLine(`SOUND ${length},${interval}`);
    return this;
  }

  build(copies: number = 1): Uint8Array {
    this.pushLine(`PRINT ${copies},1`);
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  /** Convenience: generate a complete product barcode label.
   *
   * Layout (top to bottom):
   *  1. Shop name (centered, bold)
   *  2. Product name (centered, semibold)
   *  3. Codes line: BH-xx%  D-xxxx  S-xxxx (centered, bold)
   *  4. Selling price: Price- xxxxx (centered)
   *  5. Barcode image
   *  6. Barcode number (human-readable)
   */
  static productLabel(
    sku: string,
    productName: string,
    storeName: string,
    width: number = 40,
    height: number = 25,
    options?: {
      gap?: number;
      barcodeType?: BarcodeType;
      copies?: number;
      border?: boolean;
      showStore?: boolean;
      showName?: boolean;
      showCodes?: boolean;
      showSellCode?: boolean;
      showDCode?: boolean;
      showCostCode?: boolean;
      showBatteryHealth?: boolean;
      showSellingPrice?: boolean;
      batteryHealth?: number | null;
      sellingPrice?: number | null;
      dCode?: string;
      sellCode?: string;
      costCode?: string;
      barcode?: string | null;
      showSku?: boolean;
      showBarcode?: boolean;
      showBarcodeText?: boolean;
      specs?: { label: string; value: string }[];
      showSpecs?: boolean;
      specVisibility?: Record<string, boolean>;
    },
  ): Uint8Array {
    const dpi = 203;
    const mmToDots = (mm: number) => Math.round((mm * dpi) / 25.4);
    const hDots = mmToDots(height);
    const wDots = mmToDots(width);
    const margin = mmToDots(1.0); // 1mm margin

    const lb = new TsplBuilder(width, height, options?.gap ?? 3);

    // Optional 1px border around the whole label
    if (options?.border) {
      lb.box(0, 0, wDots - 1, hDots - 1, 1);
    }

    const bcType = options?.barcodeType || "128";
    const lineH = Math.round((dpi / 25.4) * 2.8); // ~2.8mm per text line

    // ── 1. Shop name at top (centered) ──
    let currentY = margin + mmToDots(0.6);
    if (options?.showStore !== false) {
      const storeW = storeName.length * 6;
      const storeX = Math.max(margin, Math.round((wDots - storeW) / 2));
      lb.text(storeName, storeX, currentY, { font: "1" });
      currentY += lineH;
    }

    // ── 2. Product name (centered) ──
    if (options?.showName !== false) {
      const maxChars = Math.floor((wDots - margin * 2) / 6);
      const name =
        productName.length > maxChars ? productName.slice(0, maxChars - 1) + "\u2026" : productName;
      const nameX = Math.max(margin, Math.round((wDots - name.length * 6) / 2));
      lb.text(name, nameX, currentY, { font: "1" });
      currentY += lineH;
    }

    // ── 2b. Device specs line: values only, e.g. 8GB · 256GB · Black ──
    const specText = specsLineText(options?.specs, {
      showSpecs: options?.showSpecs,
      specVisibility: options?.specVisibility,
    });
    if (specText) {
      const specX = Math.max(margin, Math.round((wDots - specText.length * 6) / 2));
      lb.text(specText, specX, currentY, { font: "2" });
      currentY += lineH;
    }

    // ── 3. Codes line: BH  S-xxxx  D-xxxx  C-xxxx (centered, bold) ──
    if (
      options?.showCodes !== false ||
      options?.showSellCode ||
      options?.showDCode ||
      options?.showCostCode
    ) {
      const parts: string[] = [];
      if (options?.sellCode && options?.showSellCode !== false) parts.push(`S-${options.sellCode}`);
      if (options?.dCode && options?.showDCode !== false) parts.push(`D-${options.dCode}`);
      if (options?.costCode && options?.showCostCode !== false) parts.push(`C-${options.costCode}`);

      const codeText = parts.join("  ");
      if (codeText) {
        const codeX = Math.max(margin, Math.round((wDots - codeText.length * 6) / 2));
        lb.text(codeText, codeX, currentY, { font: "2", bold: true });
        currentY += lineH;
      }
    }

    // ── 4. Selling price (centered) ──
    if (options?.showSellingPrice !== false && options?.sellingPrice != null) {
      const priceText = `Price- ${options.sellingPrice.toLocaleString()}`;
      const priceX = Math.max(margin, Math.round((wDots - priceText.length * 6) / 2));
      lb.text(priceText, priceX, currentY, { font: "2" });
      currentY += lineH;
    }

    // ── 5. Barcode image ──
    if (options?.barcodeType === "QR") {
      if (options?.showBarcode !== false) {
        const qrX = Math.max(margin, Math.round((wDots - 40) / 2));
        lb.qr(sku, qrX, currentY, { wide: 4 });
        currentY += mmToDots(12);
      }
    } else {
      if (options?.showBarcode !== false) {
        const bcHeight = Math.round(hDots * 0.28);
        const bcX = Math.max(margin, Math.round((wDots - 80) / 2));
        lb.barcode(sku, bcX, currentY, bcType as BarcodeType, {
          height: bcHeight,
          human: false,
          narrow: 2,
          wide: 3,
        });
        currentY += bcHeight + mmToDots(0.4);
      }
    }

    // ── 6. Barcode number ──
    if (
      options?.showBarcode !== false &&
      options?.showBarcodeText !== false &&
      options?.showSku !== false
    ) {
      const skuW = sku.length * 6;
      const skuX = Math.max(margin, Math.round((wDots - skuW) / 2));
      lb.text(sku, skuX, currentY, { font: "2" });
    }

    return lb.build(options?.copies ?? 1);
  }
}
