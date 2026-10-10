import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/authz";
import { db } from "@/db";
import {
  products,
  productVariants,
  inventoryBatches,
  inventoryUnits,
  inventoryBalances,
  inventoryMovements,
  locations,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { luhnValid, normalizeImei } from "@/lib/imei";
import { nextBatchNumber, normalizeName } from "@/lib/identifiers";
import { resolveBrandId, resolveCategoryId } from "@/lib/catalog";

export const dynamic = "force-dynamic";

async function resolveLocation(locationId?: string): Promise<string> {
  if (!locationId) {
    const [def] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.isDefault, true))
      .limit(1);
    if (!def?.name) throw new Error("No default warehouse configured");
    return def.name;
  }
  const [loc] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.name, locationId))
    .limit(1);
  if (loc) return loc.name;
  throw new Error(`Location "${locationId}" not found`);
}

interface CSVRow {
  name: string;
  brand?: string;
  category?: string;
  model?: string;
  sku?: string;
  productType?: string;
  trackUnits?: boolean;
  cost?: number;
  sell?: number;
  quantity?: number;
  imei1?: string;
  imei2?: string;
  serial?: string;
}

interface ImportResult {
  row: number;
  status: "success" | "error";
  message: string;
  productId?: string;
}

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const locationId = formData.get("locationId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    // Parse CSV
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());

    if (lines.length === 0) {
      return NextResponse.json({ error: "CSV is empty" }, { status: 400 });
    }

    // Parse header
    const header = lines[0]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim());
    const nameIdx = header.indexOf("name");
    const brandIdx = header.indexOf("brand");
    const categoryIdx = header.indexOf("category");
    const modelIdx = header.indexOf("model");
    const skuIdx = header.indexOf("sku");
    const typeIdx =
      header.indexOf("type") !== -1 ? header.indexOf("type") : header.indexOf("producttype");
    const costIdx = header.indexOf("cost");
    const sellIdx =
      header.indexOf("sell") !== -1 ? header.indexOf("sell") : header.indexOf("sellingprice");
    const qtyIdx =
      header.indexOf("quantity") !== -1 ? header.indexOf("quantity") : header.indexOf("qty");
    const imei1Idx =
      header.indexOf("imei1") !== -1 ? header.indexOf("imei1") : header.indexOf("imei");
    const imei2Idx = header.indexOf("imei2");
    const serialIdx =
      header.indexOf("serial") !== -1 ? header.indexOf("serial") : header.indexOf("serialnumber");
    const trackUnitsIdx =
      header.indexOf("trackunits") !== -1
        ? header.indexOf("trackunits")
        : header.indexOf("track_units");

    if (nameIdx === -1) {
      return NextResponse.json({ error: "CSV must have a 'name' column" }, { status: 400 });
    }

    // Parse rows
    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 2) continue;

      rows.push({
        name: cols[nameIdx] ?? "",
        brand: brandIdx !== -1 ? cols[brandIdx] : undefined,
        category: categoryIdx !== -1 ? cols[categoryIdx] : undefined,
        model: modelIdx !== -1 ? cols[modelIdx] : undefined,
        sku: skuIdx !== -1 ? cols[skuIdx] : undefined,
        productType: typeIdx !== -1 ? cols[typeIdx] : undefined,
        trackUnits:
          trackUnitsIdx !== -1
            ? ["true", "1", "yes"].includes(cols[trackUnitsIdx]?.toLowerCase() ?? "")
            : undefined,
        cost: costIdx !== -1 ? parseFloat(cols[costIdx]) || undefined : undefined,
        sell: sellIdx !== -1 ? parseFloat(cols[sellIdx]) || undefined : undefined,
        quantity: qtyIdx !== -1 ? parseInt(cols[qtyIdx]) || undefined : undefined,
        imei1: imei1Idx !== -1 ? cols[imei1Idx] : undefined,
        imei2: imei2Idx !== -1 ? cols[imei2Idx] : undefined,
        serial: serialIdx !== -1 ? cols[serialIdx] : undefined,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid data rows found" }, { status: 400 });
    }

    // Process rows
    const results: ImportResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because header is row 1 and we're 0-indexed

      try {
        if (!row.name) {
          results.push({ row: rowNum, status: "error", message: "Name is required" });
          continue;
        }

        // Resolve brand/category — case- and whitespace-insensitive, so a CSV
        // with "NIKE" links the existing "Nike" brand instead of nulling the FK.
        const brandId = await resolveBrandId(row.brand);
        const categoryId = await resolveCategoryId(row.category);

        // Determine product type
        const productType = row.productType === "accessory" ? "accessory" : "new";

        // Create or find product
        let productId: string;

        // Find product by name ignoring case/whitespace ("Nokia 106 " ≈
        // "Nokia 106") so an import reuses the existing row instead of forking
        // a near-duplicate into the catalog.
        const [existingProduct] = await db
          .select()
          .from(products)
          .where(eq(sql`lower(btrim(${products.name}))`, normalizeName(String(row.name ?? ""))))
          .limit(1);

        if (existingProduct) {
          productId = existingProduct.id;
        } else {
          // Generate product ID from name
          const baseId = row.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40);
          const genProductId = `${baseId}-${Date.now().toString(36)}`;

          const [newProduct] = await db
            .insert(products)
            .values({
              id: genProductId,
              name: row.name,
              brandId,
              categoryId,
              productType,
              trackUnits: productType === "accessory" && row.trackUnits ? true : false,
              price: row.sell ?? 0,
              costPrice: row.cost ?? null,
              short: row.model ? `${row.name} ${row.model}` : row.name,
              description: "",
            })
            .returning({ id: products.id });
          productId = newProduct.id;
        }

        // Create variant
        const sku = row.sku || `${row.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`;

        const [variant] = await db
          .insert(productVariants)
          .values({
            productId,
            name: row.model || "Default",
            sku,
            costPrice: row.cost ?? null,
            sellingPrice: row.sell ?? 0,
            quantity: productType === "accessory" ? (row.quantity ?? 0) : 0,
          })
          .returning({ id: productVariants.id, quantity: productVariants.quantity });

        // If device with IMEI, create inventory units
        if (productType === "new" && row.imei1) {
          const imei1 = normalizeImei(row.imei1);
          if (imei1.length === 15 && luhnValid(imei1)) {
            const unitLocation = locationId ?? (await resolveLocation());
            const unitCost = row.cost ?? 0;
            const [batch] = await db
              .insert(inventoryBatches)
              .values({
                batchNumber: nextBatchNumber(),
                variantId: variant.id,
                locationId: unitLocation,
                source: "csv",
                unitCost,
                quantityReceived: 1,
              })
              .returning({ id: inventoryBatches.id });

            await db.insert(inventoryUnits).values({
              variantId: variant.id,
              batchId: batch.id,
              locationId: unitLocation,
              unitCode: imei1,
              identityType: "imei",
              imei1,
              imei2: row.imei2 ? normalizeImei(row.imei2) : null,
              serialNumber: row.serial ?? null,
              conditionGrade: "New",
              inspectionStatus: "passed",
              acquisitionCost: unitCost,
              status: "available",
              receivedAt: new Date(),
            });

            // Update balance
            const [bal] = await db
              .select()
              .from(inventoryBalances)
              .where(eq(inventoryBalances.variantId, variant.id))
              .limit(1);
            if (bal) {
              await db
                .update(inventoryBalances)
                .set({ availableQty: bal.availableQty + 1 })
                .where(eq(inventoryBalances.id, bal.id));
            } else {
              await db.insert(inventoryBalances).values({
                variantId: variant.id,
                locationId: locationId ?? (await resolveLocation()),
                availableQty: 1,
              });
            }

            // Update variant quantity
            await db
              .update(productVariants)
              .set({ quantity: (variant.quantity ?? 0) + 1 })
              .where(eq(productVariants.id, variant.id));

            // Log movement
            await db.insert(inventoryMovements).values({
              variantId: variant.id,
              locationId: locationId ?? (await resolveLocation()),
              movementType: "receive",
              quantity: 1,
              beforeQty: 0,
              afterQty: 1,
              sourceType: "csv_import",
              reason: "Bulk CSV import",
            });
          } else {
            results.push({ row: rowNum, status: "error", message: `Invalid IMEI: ${row.imei1}` });
            continue;
          }
        }

        results.push({
          row: rowNum,
          status: "success",
          message: `Created product and variant`,
          productId,
        });
      } catch (e) {
        results.push({
          row: rowNum,
          status: "error",
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      total: rows.length,
      success: successCount,
      errors: errorCount,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "CSV import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
