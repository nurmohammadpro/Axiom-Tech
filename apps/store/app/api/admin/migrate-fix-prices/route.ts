import { db } from "@/db";
import { orders, sales } from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    console.log("🔧 Starting price unit migration...\n");

    // 1. Fix orders table - values seem to be stored in smaller units (need ×100)
    console.log("📦 Checking orders table...");
    const [orderStats] = await db
      .select({
        count: sql<string>`count(*)::text`,
        totalSum: sql<string>`sum(total)::text`,
        avgTotal: sql<string>`avg(total)::text`,
      })
      .from(orders);

    console.log(`  Before: ${orderStats.count} orders, total sum: ${orderStats.totalSum}`);

    // Check if orders need fixing (very small values suggest wrong unit)
    const [sampleOrder] = await db
      .select({ total: orders.total })
      .from(orders)
      .limit(1);

    let ordersFixed = false;
    if (sampleOrder && sampleOrder.total < 1000) {
      console.log(`  ⚠️  Orders appear to be in wrong units (sample: ${sampleOrder.total})`);
      console.log("  🔧 Multiplying all order totals by 100...");

      await db.execute(sql`
        UPDATE orders
        SET subtotal = subtotal * 100,
            shipping = shipping * 100,
            tax = tax * 100,
            total = total * 100
        WHERE total < 10000
      `);
      ordersFixed = true;
    }

    // 2. Fix sales table - values seem to be stored in larger units (need ÷100)
    console.log("\n🛒 Checking sales table...");
    const [salesStats] = await db
      .select({
        count: sql<string>`count(*)::text`,
        totalSum: sql<string>`sum(total_amount)::text`,
        avgTotal: sql<string>`avg(total_amount)::text`,
      })
      .from(sales);

    console.log(`  Before: ${salesStats.count} sales, total sum: ${salesStats.totalSum}`);

    // Check if sales need fixing (very large values suggest wrong unit)
    const [sampleSale] = await db
      .select({ totalAmount: sales.totalAmount })
      .from(sales)
      .limit(1);

    let salesFixed = false;
    if (sampleSale && sampleSale.totalAmount > 1000000) {
      console.log(`  ⚠️  Sales appear to be in wrong units (sample: ${sampleSale.totalAmount})`);
      console.log("  🔧 Dividing all sales amounts by 100...");

      await db.execute(sql`
        UPDATE sales
        SET subtotal = subtotal / 100,
            discount_amount = discount_amount / 100,
            tax_amount = tax_amount / 100,
            total_amount = total_amount / 100,
            paid_amount = paid_amount / 100,
            change_amount = change_amount / 100
        WHERE total_amount > 1000000
      `);
      salesFixed = true;
    }

    // 3. Verify the fixes
    console.log("\n✅ Verifying fixes...");
    const [newOrderStats] = await db
      .select({
        count: sql<string>`count(*)::text`,
        totalSum: sql<string>`sum(total)::text`,
        avgTotal: sql<string>`avg(total)::text`,
      })
      .from(orders);

    const [newSalesStats] = await db
      .select({
        count: sql<string>`count(*)::text`,
        totalSum: sql<string>`sum(total_amount)::text`,
        avgTotal: sql<string>`avg(total_amount)::text`,
      })
      .from(sales);

    console.log(`  📦 Orders: ${newOrderStats.count} orders, total sum: ${newOrderStats.totalSum}`);
    console.log(`  🛒 Sales: ${newSalesStats.count} sales, total sum: ${newSalesStats.totalSum}`);

    return NextResponse.json({
      success: true,
      message: "Price unit migration completed successfully",
      results: {
        orders: {
          fixed: ordersFixed,
          before: orderStats,
          after: newOrderStats,
        },
        sales: {
          fixed: salesFixed,
          before: salesStats,
          after: newSalesStats,
        },
      },
    });
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 },
    );
  }
}