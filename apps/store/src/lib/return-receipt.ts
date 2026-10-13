import type { ReceiptData, ReturnInfo } from "./receipt";
import { METHOD_LABELS } from "./payment-methods";

/**
 * Builds the ReceiptData for an in-store return receipt — the standard sales
 * receipt format, with the payment line relabeled "<Method> Received" showing
 * the cash/amount handed back to the customer, plus a printed
 * customer-signature line as the paper validator.
 */

export interface ReturnReceiptSale {
  saleNumber: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
}

export interface ReturnReceiptLine {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imei1?: string | null;
  imei2?: string | null;
  serial?: string | null;
}

export interface ReturnReceiptInput {
  returnId: string;
  createdAt: Date;
  sale: ReturnReceiptSale;
  line: ReturnReceiptLine;
  condition?: string;
  reason?: string;
  refundAmount: number;
  refundMethod: string;
  /** Dashboard settings payload (settings.store_info drives header/footer/copies). */
  settings?: Record<string, any> | null;
}

export function buildReturnReceiptData(input: ReturnReceiptInput): ReceiptData {
  const storeInfo = (input.settings?.store_info ?? {}) as Record<string, any>;
  const policies = (storeInfo.receiptPolicies || "")
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean);

  const deviceName = [input.line.productName, input.line.variantName].filter(Boolean).join(" ");
  const methodLabel = METHOD_LABELS[input.refundMethod] || input.refundMethod;

  const returnInfo: ReturnInfo = {
    returnId: input.returnId,
    reason: input.reason,
    refundAmount: input.refundAmount,
    refundMethod: methodLabel,
    originalSaleNumber: input.sale.saleNumber || undefined,
    originalInvoiceNumber: input.sale.invoiceNumber || undefined,
    originalSaleDate: input.sale.createdAt,
    device: {
      description: deviceName,
      imei1: input.line.imei1 || undefined,
      imei2: input.line.imei2 || undefined,
      serial: input.line.serial || undefined,
      condition: input.condition || undefined,
    },
  };

  return {
    invoiceNumber: input.returnId,
    date: input.createdAt,
    barcodeNumber: input.returnId,
    storeInfo: {
      name: storeInfo.name || "Your Shop",
      address: storeInfo.address || "Dhaka, Bangladesh",
      phone: storeInfo.phone || "",
      email: storeInfo.email || "",
      website: storeInfo.website || undefined,
      logo: storeInfo.logo || undefined,
    },
    customer: {
      name: input.sale.customerName || "Walk-in Customer",
      phone: input.sale.customerPhone || undefined,
    },
    items: [
      {
        sl: 1,
        description: deviceName,
        unitPrice: input.line.unitPrice,
        qty: input.line.quantity,
        total: input.line.lineTotal,
        imei1: input.line.imei1 || undefined,
        imei2: input.line.imei2 || undefined,
        serialNumber: input.line.serial || undefined,
      },
    ],
    totals: {
      subtotal: input.line.lineTotal,
      grandTotal: input.line.lineTotal,
      paid: input.line.lineTotal,
      change: 0,
    },
    // Rendered as the "<Method> Received" row — the amount handed back.
    payments: [{ method: input.refundMethod, amount: input.refundAmount }],
    policies,
    headerText: storeInfo.receiptHeader || undefined,
    footerText: storeInfo.receiptFooter || undefined,
    copies: Number(storeInfo.receiptCopies) || 1,
    isReturn: true,
    returnInfo,
  };
}
