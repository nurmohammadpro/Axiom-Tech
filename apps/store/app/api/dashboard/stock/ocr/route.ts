import { NextRequest, NextResponse } from "next/server";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { getScope, requireStaff, requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

interface OCRLineItem {
  name: string;
  model: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imei1?: string;
  imei2?: string;
  serial?: string;
}

interface OCRResult {
  rawText: string;
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  total: number | null;
  lineItems: OCRLineItem[];
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  const denied = requireStaff(scope);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const imageUrl = formData.get("imageUrl") as string | null;

    if (!file && !imageUrl) {
      return NextResponse.json(
        { error: "file or imageUrl is required" },
        { status: 400 },
      );
    }

    // Get OCR API key from env
    const apiKey = process.env.OCR_API_KEY || "K85374748388957"; // Free tier key (limited)

    let ocrText = "";

    if (file) {
      // Convert file to base64 for OCR.space
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mimeType = file.type || "image/jpeg";

      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          apikey: apiKey,
        },
        body: new URLSearchParams({
          base64Image: `data:${mimeType};base64,${base64}`,
          language: "eng",
          isOverlayRequired: "false",
          OCREngine: "2", // Engine 2 better for invoices
        }),
      });

      const ocrData = await ocrRes.json();
      ocrText = ocrData?.ParsedResults?.[0]?.ParsedText ?? "";
    } else if (imageUrl) {
      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: {
          apikey: apiKey,
        },
        body: new URLSearchParams({
          url: imageUrl,
          language: "eng",
          isOverlayRequired: "false",
          OCREngine: "2",
        }),
      });

      const ocrData = await ocrRes.json();
      ocrText = ocrData?.ParsedResults?.[0]?.ParsedText ?? "";
    }

    if (!ocrText) {
      return NextResponse.json(
        { error: "Failed to extract text from image" },
        { status: 422 },
      );
    }

    // Parse the OCR text into structured data
    const result = parseOCRText(ocrText);

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OCR processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseOCRText(text: string): OCRResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const result: OCRResult = {
    rawText: text,
    supplier: null,
    invoiceNumber: null,
    invoiceDate: null,
    total: null,
    lineItems: [],
  };

  // Extract invoice number
  const invoicePatterns = [
    /invoice\s*[:#]\s*([A-Z0-9-]+)/i,
    /inv\s*[:#]\s*([A-Z0-9-]+)/i,
    /bill\s*[:#]\s*([A-Z0-9-]+)/i,
  ];

  for (const line of lines) {
    for (const pattern of invoicePatterns) {
      const match = line.match(pattern);
      if (match && !result.invoiceNumber) {
        result.invoiceNumber = match[1];
        break;
      }
    }
  }

  // Extract date
  const datePatterns = [
    /date\s*[:]\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/,
  ];

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern);
      if (match) {
        result.invoiceDate = match[1];
        break;
      }
    }
    if (result.invoiceDate) break;
  }

  // Extract total
  const totalPatterns = [
    /total\s*[:]\s*(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)/i,
    /grand\s*total\s*[:]\s*(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)/i,
    /সর্বমোট\s*[:]\s*(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)/i,
  ];

  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern);
      if (match) {
        result.total = parseFloat(match[1].replace(/,/g, ""));
        break;
      }
    }
    if (result.total) break;
  }

  // Extract supplier (first line or line with "from"/"supplier")
  const supplierPatterns = [
    /^from\s*[:]\s*(.+)/i,
    /^supplier\s*[:]\s*(.+)/i,
    /^company\s*[:]\s*(.+)/i,
  ];

  for (const line of lines) {
    for (const pattern of supplierPatterns) {
      const match = line.match(pattern);
      if (match) {
        result.supplier = match[1].trim();
        break;
      }
    }
    if (result.supplier) break;
  }

  // If no supplier found, use first non-empty line
  if (!result.supplier && lines.length > 0) {
    result.supplier = lines[0];
  }

  // Extract line items (product with quantity and price)
  // Pattern: product name/model quantity unitPrice [totalPrice]
  const itemPatterns = [
    // "iPhone 16 Pro Max A3293 2 85000 170000"
    /^(.+?)\s+(\d{1,3})\s+(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)\s+(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)$/,
    // "iPhone 16 Pro Max 2 85000"
    /^(.+?)\s+(\d{1,3})\s+(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)$/,
    // Lines with IMEI pattern
    /^(.+?)\s+(\d{15})\s+(\d{15})?\s*(\d+)?\s+(?:৳|Tk\.?)?\s*([0-9,]+\.?\d*)?$/i,
  ];

  for (const line of lines) {
    // Check for IMEI in line
    const imeiMatch = line.match(/(\d{15})/);
    if (imeiMatch) {
      const imei1 = normalizeImei(imeiMatch[1]);
      const nameMatch = line.replace(imei1, "").replace(/\d{15}/, "").trim();
      const parts = nameMatch.split(/\s+/);

      // Try to extract quantity and price
      const numbers = line.match(/\d+/g) ?? [];
      const imeiCount = line.match(/\d{15}/g)?.length ?? 0;
      const otherNumbers = numbers.filter((n) => n.length < 15);

      if (imeiCount > 0) {
        result.lineItems.push({
          name: parts[0] || "Unknown",
          model: parts[1] || "",
          quantity: imeiCount,
          unitPrice: parseInt(otherNumbers[otherNumbers.length - 1] ?? "0") || 0,
          totalPrice: parseInt(otherNumbers[otherNumbers.length - 1] ?? "0") || 0,
          imei1,
          imei2: imeiMatch[2] ? normalizeImei(imeiMatch[2]) : undefined,
        });
        continue;
      }
    }

    // Standard item pattern
    for (const pattern of itemPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1]?.trim() ?? "";
        const quantity = parseInt(match[2] ?? "1") || 1;
        const unitPrice = parseFloat(match[3]?.replace(/,/g, "") ?? "0") || 0;
        const totalPrice = match[4]
          ? parseFloat(match[4].replace(/,/g, "")) || unitPrice * quantity
          : unitPrice * quantity;

        // Split name into product name and model
        const nameParts = name.split(/\s+/);
        const productName = nameParts[0] ?? name;
        const model = nameParts.slice(1).join(" ");

        result.lineItems.push({
          name: productName,
          model,
          quantity,
          unitPrice,
          totalPrice,
        });
        break;
      }
    }
  }

  return result;
}
