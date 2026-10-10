/**
 * Shared, WYSIWYG label renderer.
 *
 * Renders a product barcode label onto an HTMLCanvasElement using real
 * fonts (Arial) and JsBarcode — the exact same code path is used for:
 *   1. The on-screen preview (dashboard/barcodes)
 *   2. The browser print fallback (window.print)
 *   3. The silent USB/TSPL print (canvas -> 1-bit bitmap -> TSPL BITMAP)
 *
 * This guarantees the printed label always matches what the user saw in
 * the preview: no more separately hand-tuned coordinates per output path,
 * no more guessed text/barcode widths that drift and get clipped.
 */

import JsBarcode from "jsbarcode";
import { TsplBuilder } from "./tspl";
import { specsLineText, type LabelSpec } from "./label-specs";

export type { LabelSpec };

export type LabelSymbology = "CODE128" | "EAN13" | "UPCA" | "QR";

export interface LabelData {
  sku: string;
  productName: string;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  storeName: string;
  batteryHealth?: number | null;
  sellingPrice?: number | null;
  barcode?: string | null;
  /** Device specs (RAM/Storage/Color…) merged from variant attributes + product specs. */
  specs?: LabelSpec[];
}

export interface LabelRenderOptions {
  widthMm: number;
  heightMm: number;
  /** Dots per inch of the target printer/canvas. Defaults to 203 (GP-3120TUD/3210TU). */
  dpi?: number;
  symbology: LabelSymbology;
  showStore?: boolean;
  showName?: boolean;
  showCodes?: boolean;
  showSellCode?: boolean;
  showDCode?: boolean;
  showCostCode?: boolean;
  showBatteryHealth?: boolean;
  showSellingPrice?: boolean;
  showBarcode?: boolean;
  showBarcodeNumber?: boolean;
  showSku?: boolean;
  showBorder?: boolean;
  /** Master toggle for the device-specs line. */
  showSpecs?: boolean;
  /** Normalized spec label → shown. Missing key = shown. */
  specVisibility?: Record<string, boolean>;
}

const mmToPx = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);

/**
 * Draws a product label onto `canvas` at native printer resolution
 * (canvas.width/height == physical dots). Returns the canvas for chaining.
 *
 * Layout (top to bottom):
 *   1. Store name (centered, bold)
 *   2. Product name (centered, semibold)
 *   3. Device specs line: 8GB · 256GB · Black (centered, when enabled)
 *   4. Codes line: BH-xx%  D-xxxx  S-xxxx (centered, bold)
 *   5. Selling price: Price- xxxxx (centered)
 *   6. Barcode image
 *   7. Barcode number (human-readable)
 */
export function renderLabelToCanvas(
  canvas: HTMLCanvasElement,
  data: LabelData,
  opts: LabelRenderOptions,
): HTMLCanvasElement {
  const dpi = opts.dpi ?? 203;
  const w = mmToPx(opts.widthMm, dpi);
  const h = mmToPx(opts.heightMm, dpi);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  const margin = mmToPx(1.0, dpi);
  const maxW = w - margin * 2;
  let y = margin;

  if (opts.showBorder) {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(1, Math.round(dpi / 203));
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  /** Shrink font-size (in px) until `text` fits within `maxWidth`, down to `minSize`. */
  function fitSize(
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    weight: string,
  ): number {
    let size = startSize;
    ctx!.font = `${weight} ${size}px Arial`;
    while (size > minSize && ctx!.measureText(text).width > maxWidth) {
      size -= 1;
      ctx!.font = `${weight} ${size}px Arial`;
    }
    return size;
  }

  // ── 1. Store name (centered, bold) ──
  if (opts.showStore !== false && data.storeName) {
    const label = data.storeName.toUpperCase();
    const size = fitSize(label, maxW, mmToPx(2.8, dpi), mmToPx(1.6, dpi), "700");
    ctx.font = `700 ${size}px Arial`;
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, (w - tw) / 2, y + mmToPx(0.6, dpi));
    y += size + mmToPx(0.5, dpi) + mmToPx(0.6, dpi);
  }

  // ── 2. Product name (centered, semibold) ──
  if (opts.showName !== false && data.productName) {
    const nameSize = mmToPx(2.2, dpi);
    ctx.font = `600 ${nameSize}px Arial`;
    let name = data.productName;
    if (ctx.measureText(name).width > maxW) {
      while (name.length > 1 && ctx.measureText(name + "\u2026").width > maxW) {
        name = name.slice(0, -1);
      }
      name = name.length < data.productName.length ? name + "\u2026" : name;
    }
    const tw = ctx.measureText(name).width;
    ctx.fillText(name, (w - tw) / 2, y);
    y += nameSize + mmToPx(0.6, dpi);
  }

  // ── 3. Device specs line: values only, e.g. 8GB · 256GB · Black ──
  const specsText = specsLineText(data.specs, {
    showSpecs: opts.showSpecs,
    specVisibility: opts.specVisibility,
  });
  if (specsText) {
    const specSize = fitSize(specsText, maxW, mmToPx(2.0, dpi), mmToPx(1.3, dpi), "600");
    ctx.font = `600 ${specSize}px Arial`;
    const tw = ctx.measureText(specsText).width;
    ctx.fillText(specsText, (w - tw) / 2, y);
    y += specSize + mmToPx(0.4, dpi);
  }

  // ── 3. Codes line: BH  S-xxxx  D-xxxx  C-xxxx (centered, bold) ──
  if (opts.showCodes !== false || opts.showSellCode || opts.showDCode || opts.showCostCode) {
    const parts: string[] = [];
    if (data.sellCode && opts.showSellCode !== false) parts.push(`S-${data.sellCode}`);
    if (data.dCode && opts.showDCode !== false) parts.push(`D-${data.dCode}`);
    if (data.costCode && opts.showCostCode !== false) parts.push(`C-${data.costCode}`);

    const codeText = parts.join("  ");
    if (codeText) {
      const codeSize = fitSize(codeText, maxW, mmToPx(2.2, dpi), mmToPx(1.5, dpi), "700");
      ctx.font = `700 ${codeSize}px Arial`;
      const tw = ctx.measureText(codeText).width;
      ctx.fillText(codeText, (w - tw) / 2, y);
      y += codeSize + mmToPx(0.5, dpi);
    }
  }

  // ── 4. Selling price (centered) ──
  if (opts.showSellingPrice !== false && data.sellingPrice != null) {
    const priceText = `Price- ${data.sellingPrice.toLocaleString()}`;
    const priceSize = fitSize(priceText, maxW, mmToPx(2.0, dpi), mmToPx(1.4, dpi), "600");
    ctx.font = `600 ${priceSize}px Arial`;
    const tw = ctx.measureText(priceText).width;
    ctx.fillText(priceText, (w - tw) / 2, y);
    y += priceSize + mmToPx(0.5, dpi);
  }

  // ── 5 & 6. Barcode image + human-readable number ──
  if (opts.showBarcode !== false && data.sku) {
    if (opts.symbology === "QR") {
      // QR rendering is handled natively by the printer (TSPL QRCODE command);
      // this canvas path is only used for the CODE128/EAN13/UPCA symbologies.
    } else {
      const format =
        opts.symbology === "EAN13" ? "EAN13" : opts.symbology === "UPCA" ? "UPCA" : "CODE128";
      const bcHeight = mmToPx(opts.heightMm * 0.28, dpi);

      let bcCanvas: HTMLCanvasElement | null = null;
      for (let moduleWidth = 2.2; moduleWidth >= 0.8; moduleWidth -= 0.1) {
        const candidate = document.createElement("canvas");
        try {
          JsBarcode(candidate, data.sku, {
            format,
            width: moduleWidth,
            height: bcHeight,
            displayValue: false,
            margin: 0,
            background: "#ffffff",
          });
        } catch {
          break;
        }
        if (candidate.width <= maxW || moduleWidth <= 0.8) {
          bcCanvas = candidate;
          break;
        }
      }

      if (bcCanvas) {
        // Shrink 10% and center within the label so the bars sit comfortably
        // inside the sticker's printable area instead of touching the edges.
        const bcScale = 0.9;
        const bcW = Math.round(bcCanvas.width * bcScale);
        const bcH = Math.round(bcCanvas.height * bcScale);
        const bx = Math.round((w - bcW) / 2);
        ctx.drawImage(bcCanvas, bx, y, bcW, bcH);
        y += bcH + mmToPx(0.4, dpi);

        if (opts.showBarcodeNumber !== false) {
          const numSize = fitSize(data.sku, maxW, mmToPx(2.0, dpi), mmToPx(1.5, dpi), "400");
          ctx.font = `400 ${numSize}px "Courier New", monospace`;
          const tw = ctx.measureText(data.sku).width;
          ctx.fillText(data.sku, (w - tw) / 2, y);
        }
      }
    }
  } else if (opts.showSku !== false && data.sku) {
    const numSize = fitSize(data.sku, maxW, mmToPx(2.0, dpi), mmToPx(1.5, dpi), "400");
    ctx.font = `400 ${numSize}px "Courier New", monospace`;
    const tw = ctx.measureText(data.sku).width;
    ctx.fillText(data.sku, (w - tw) / 2, y);
  }

  return canvas;
}

/**
 * Converts a canvas's pixel data into a 1-bit-per-pixel, MSB-first,
 * byte-per-row-padded bitmap — the format TSPL's BITMAP command expects.
 *
 * Polarity: this printer's BITMAP command prints bit 0 as black ink and
 * leaves bit 1 blank/white (confirmed by test print — the documented TSC
 * convention of 1=black is inverted on this GP-3120TUD/3210TU clone).
 * So we set the bit for WHITE/background pixels, not black ones.
 */
export function canvasToMonoBitmap(
  canvas: HTMLCanvasElement,
  threshold: number = 160,
): { widthBytes: number; heightPx: number; data: Uint8Array } {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      const lum = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
      const alpha = img[i + 3];
      const isBlack = alpha > 10 && lum < threshold;
      if (!isBlack) {
        const byteIndex = row * widthBytes + (col >> 3);
        const bitMask = 0x80 >> (col % 8);
        data[byteIndex] |= bitMask;
      }
    }
  }

  return { widthBytes, heightPx: height, data };
}

/**
 * Builds the final TSPL byte stream for one label, printer-ready.
 *
 * CODE128/EAN13/UPCA labels are rendered pixel-for-pixel from the same
 * canvas used for the on-screen preview and embedded as a TSPL BITMAP —
 * this is what fixes the clipped/shifted barcode and the tiny built-in
 * bitmap font (both replaced by real Arial + a correctly-measured
 * barcode width).
 *
 * QR labels keep using the printer's native QRCODE command (unrelated
 * to the reported bug, and native QR renders more reliably than a
 * rasterized-then-rebitmapped QR would).
 */
export function buildProductLabelTspl(
  data: LabelData,
  opts: LabelRenderOptions & { gap?: number; border?: boolean; copies?: number },
): Uint8Array {
  if (opts.symbology === "QR") {
    return TsplBuilder.productLabel(
      data.sku,
      data.productName,
      data.storeName,
      opts.widthMm,
      opts.heightMm,
      {
        gap: opts.gap,
        barcodeType: "QR",
        copies: opts.copies,
        border: opts.showBorder,
        showStore: opts.showStore,
        showName: opts.showName,
        showCodes: opts.showCodes,
        showSellCode: opts.showSellCode,
        showDCode: opts.showDCode,
        showCostCode: opts.showCostCode,
        showBatteryHealth: opts.showBatteryHealth,
        showSellingPrice: opts.showSellingPrice,
        batteryHealth: data.batteryHealth,
        sellingPrice: data.sellingPrice,
        dCode: data.dCode,
        sellCode: data.sellCode,
        costCode: data.costCode,
        barcode: data.barcode,
        showBarcode: opts.showBarcode,
        showSku: opts.showSku,
        showBarcodeText: opts.showBarcodeNumber,
        specs: data.specs,
        showSpecs: opts.showSpecs,
        specVisibility: opts.specVisibility,
      },
    );
  }

  const canvas = document.createElement("canvas");
  renderLabelToCanvas(canvas, data, { ...opts, showBorder: false }); // border drawn via TSPL BOX below for crisp 1px lines
  const { widthBytes, heightPx, data: bmp } = canvasToMonoBitmap(canvas);

  const dpi = opts.dpi ?? 203;
  const wDots = mmToPx(opts.widthMm, dpi);
  const hDots = mmToPx(opts.heightMm, dpi);

  const lb = new TsplBuilder(opts.widthMm, opts.heightMm, opts.gap ?? 3);
  if (opts.showBorder) {
    lb.box(0, 0, wDots - 1, hDots - 1, 1);
  }
  lb.bitmap(0, 0, widthBytes, heightPx, bmp);
  return lb.build(opts.copies ?? 1);
}
