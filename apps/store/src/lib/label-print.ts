// ─── Shared label printing ──────────────────────────────────────
// Browser-fallback (renderPrintLabels) and USB/TSPL (silentPrint) label
// printing, extracted from the barcodes page so the purchase-intake grid can
// print the exact same label layout as the barcode list.

import {
  buildProductLabelTspl,
  renderLabelToCanvas,
  type LabelSymbology,
} from "@/lib/label-render";
import type { UsbThermalPrinter } from "@/lib/usb-printer";

export type LabelPrintSymbology = "CODE128" | "EAN13" | "UPCA" | "QR";

export const STORE_NAME = "Play Store";

export interface LabelPrintProduct {
  name: string;
  brand?: string;
  variantName?: string;
  costCode?: string;
  dCode?: string;
  sellCode?: string;
  batteryHealth?: number | null;
  sellingPrice?: number | null;
  category?: string;
  specs?: { label: string; value: string }[];
}

export interface LabelPrintOptions {
  symbology: LabelPrintSymbology;
  size: "40x25";
  showName: boolean;
  showSku: boolean;
  showSellCode: boolean;
  showDCode: boolean;
  showCostCode: boolean;
  showBatteryHealth: boolean;
  showSellingPrice: boolean;
  showBarcode: boolean;
  showBarcodeNumber: boolean;
  showStore: boolean;
  showBorder: boolean;
  showSpecs: boolean;
  specVisibility: Record<string, boolean>;
  copies: number;
}

// ─── Browser-print helper ───────────────────────────────────────

export async function renderPrintLabels(
  products: LabelPrintProduct[],
  skus: string[],
  options: LabelPrintOptions,
) {
  const div = document.createElement("div");
  div.id = "print-area";
  div.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:auto;z-index:9999;background:#fff;padding:0.5in;box-sizing:border-box;";

  const style = document.createElement("style");
  style.textContent = `
    @media print {
      body > *:not(#print-area) { display:none !important; }
      #print-area { display:block !important; }
      @page { margin:0.5in; }
      .pl { page-break-inside:avoid; }
    }
    #print-area { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-start; }
    .pl { width:1.6in; height:1in; page-break-inside:avoid; overflow:hidden; }
    .pl img { display:block; width:100%; height:100%; }
  `;
  div.appendChild(style);

  const printRoot = document.createElement("div");
  printRoot.id = "print-root";
  printRoot.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;";
  div.appendChild(printRoot);

  // Render each unique label once via the shared canvas renderer (same code
  // path as the on-screen preview and the USB/TSPL print), then reuse the
  // image for however many copies were requested — this keeps the OS print
  // fallback pixel-identical to the preview instead of maintaining a third,
  // separately hand-tuned DOM/CSS layout.
  products.forEach((p, idx) => {
    const canvas = document.createElement("canvas");
    const isNewCategory = p.category === "Official New" || p.category === "Unofficial New";
    const effectiveShowBH = options.showBatteryHealth && !isNewCategory;
    renderLabelToCanvas(
      canvas,
      {
        sku: skus[idx],
        productName: p.name,
        costCode: p.costCode,
        dCode: p.dCode,
        sellCode: p.sellCode,
        storeName: STORE_NAME,
        batteryHealth: effectiveShowBH ? p.batteryHealth : null,
        sellingPrice: p.sellingPrice,
        specs: p.specs,
      },
      {
        widthMm: 40,
        heightMm: 25,
        dpi: 300, // higher-res raster for crisper OS/laser print output
        symbology: options.symbology as LabelSymbology,
        showStore: options.showStore,
        showName: options.showName,
        showCodes: options.showSellCode || options.showDCode || options.showCostCode,
        showSellCode: options.showSellCode,
        showDCode: options.showDCode,
        showCostCode: options.showCostCode,
        showBatteryHealth: effectiveShowBH,
        showSellingPrice: options.showSellingPrice,
        showBarcode: options.showBarcode,
        showBarcodeNumber: options.showBarcodeNumber,
        showSku: options.showSku,
        showBorder: options.showBorder,
        showSpecs: options.showSpecs,
        specVisibility: options.specVisibility,
      },
    );
    const dataUrl = canvas.toDataURL("image/png");

    const count = options.copies || 1;
    for (let c = 0; c < count; c++) {
      const label = document.createElement("div");
      label.className = "pl";
      const img = document.createElement("img");
      img.src = dataUrl;
      label.appendChild(img);
      printRoot.appendChild(label);
    }
  });

  document.body.appendChild(div);
  // The print preview snapshots the DOM the moment window.print() is called —
  // imgs whose data hasn't decoded yet come out as blank boxes. Wait for every
  // label image to decode first.
  await Promise.all(
    Array.from(div.getElementsByTagName("img")).map((img) => img.decode().catch(() => undefined)),
  );
  window.print();
  document.body.removeChild(div);
}

// ─── TSPL silent print helper ───────────────────────────────────

export async function silentPrint(
  printer: UsbThermalPrinter,
  products: LabelPrintProduct[],
  skus: string[],
  symbology: LabelPrintSymbology,
  copies: number,
  labelWidth = 40,
  labelHeight = 25,
  border = false,
  showStore = true,
  showName = true,
  showSellCode = true,
  showDCode = true,
  showCostCode = true,
  showBatteryHealth = true,
  showSellingPrice = true,
  showBarcode = true,
  showBarcodeNumber = true,
  showSku = true,
  showSpecs = true,
  specVisibility: Record<string, boolean> = {},
) {
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const sku = skus[i];
    const isNewCategory = p.category === "Official New" || p.category === "Unofficial New";
    const effectiveShowBH = showBatteryHealth && !isNewCategory;
    const tspb = buildProductLabelTspl(
      {
        sku,
        productName: p.name,
        costCode: p.costCode,
        dCode: p.dCode,
        sellCode: p.sellCode,
        storeName: STORE_NAME,
        batteryHealth: effectiveShowBH ? p.batteryHealth : null,
        sellingPrice: p.sellingPrice,
        specs: p.specs,
      },
      {
        widthMm: labelWidth,
        heightMm: labelHeight,
        symbology: symbology as LabelSymbology,
        gap: 3,
        copies,
        showBorder: border,
        showStore,
        showName,
        showCodes: showSellCode || showDCode || showCostCode,
        showSellCode,
        showDCode,
        showCostCode,
        showBatteryHealth: effectiveShowBH,
        showSellingPrice,
        showBarcode,
        showSku,
        showBarcodeNumber,
        showSpecs,
        specVisibility,
      },
    );
    await printer.printLabel(tspb);
  }
}
