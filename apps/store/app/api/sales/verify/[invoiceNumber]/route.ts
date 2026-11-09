import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { sales, saleLines, salePayments } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceNumber: string }> },
) {
  try {
    const { invoiceNumber } = await params;

    if (!invoiceNumber) {
      return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
    }

    // Find the sale by invoiceNumber, saleNumber, or barcodeValue
    const [sale] = await db
      .select()
      .from(sales)
      .where(
        or(
          eq(sales.invoiceNumber, invoiceNumber),
          eq(sales.saleNumber, invoiceNumber),
          eq(sales.barcodeValue, invoiceNumber),
        ),
      )
      .limit(1);

    if (!sale) {
      return NextResponse.json(
        { error: "Invoice not found", invoiceNumber, verified: false },
        { status: 404 },
      );
    }

    // Fetch line items
    const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, sale.id));

    // Fetch payments
    const payments = await db.select().from(salePayments).where(eq(salePayments.saleId, sale.id));

    return NextResponse.json({
      verified: true,
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      saleNumber: sale.saleNumber,
      barcodeValue: sale.barcodeValue,
      createdAt: sale.createdAt,
      customer: sale.customerName
        ? {
            name: sale.customerName,
            phone: sale.customerPhone || undefined,
            email: sale.customerEmail || undefined,
          }
        : undefined,
      items: lines.map((line: any) => ({
        id: line.id,
        productName: line.productNameSnapshot || "Unknown Product",
        variantName: "",
        sku: line.sku || "",
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.lineTotal,
        discountAmount: line.discountAmount || 0,
        imei1: undefined,
        imei2: undefined,
        serialNumber: line.serialSnapshot || undefined,
      })),
      payments: payments.map((p: any) => ({
        method: p.method,
        amount: p.amount,
      })),
      totals: {
        subtotal: sale.subtotal,
        discount: sale.discountAmount,
        tax: sale.taxAmount,
        grandTotal: sale.totalAmount,
        paid: sale.paidAmount,
        change: sale.changeAmount,
      },
      storeInfo: {
        location: sale.storeId,
        cashierId: sale.cashierId,
        channel: sale.channel,
      },
      status: sale.status,
    });
  } catch (error) {
    console.error("Invoice verification error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
