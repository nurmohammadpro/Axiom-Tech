import { db } from "@/db";
import { exchangePolicies, products, orderItems, orders } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ExchangeCalculationRequest {
  productId: string;
  deviceAgeMonths: number;
  condition: "excellent" | "good" | "fair" | "poor";
  originalPrice?: number;
  userId?: string;
}

interface ExchangeCalculationResponse {
  tradeInValue: number;
  breakdown: {
    originalPrice: number;
    baseValuePercentage: number;
    baseValue: number;
    conditionModifier: number;
    conditionValue: number;
    exchangeFee: number;
    finalValue: number;
  } | null;
  policy: {
    id: number;
    name: string;
  } | null;
  eligible: boolean;
  reason?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExchangeCalculationRequest;
    const { productId, deviceAgeMonths, condition, originalPrice } = body;

    // Get active exchange policy
    const policies = await db
      .select()
      .from(exchangePolicies)
      .where(eq(exchangePolicies.active, true))
      .orderBy(desc(exchangePolicies.createdAt))
      .limit(1);

    if (policies.length === 0) {
      return NextResponse.json({
        eligible: false,
        reason: "No active exchange policy found",
        tradeInValue: 0,
        breakdown: null,
        policy: null,
      } as ExchangeCalculationResponse);
    }

    const policy = policies[0];

    // Check eligibility
    if (deviceAgeMonths < (policy.minDeviceAge ?? 1)) {
      return NextResponse.json({
        eligible: false,
        reason: `Device must be at least ${policy.minDeviceAge ?? 1} months old`,
        tradeInValue: 0,
        breakdown: null,
        policy: { id: policy.id, name: policy.name },
      } as ExchangeCalculationResponse);
    }

    if (deviceAgeMonths > (policy.maxDeviceAge ?? 24)) {
      return NextResponse.json({
        eligible: false,
        reason: `Device exceeds maximum age of ${policy.maxDeviceAge ?? 24} months`,
        tradeInValue: 0,
        breakdown: null,
        policy: { id: policy.id, name: policy.name },
      } as ExchangeCalculationResponse);
    }

    // Get original price from product catalog or order history if not provided
    let deviceOriginalPrice = originalPrice;
    if (!deviceOriginalPrice) {
      const product = await db
        .select({ price: products.price, originalPrice: products.originalPrice })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (product.length > 0) {
        deviceOriginalPrice = product[0].originalPrice || product[0].price;
      } else {
        // Try to find in recent orders
        const recentPurchase = await db
          .select({ price: orderItems.price })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .where(and(eq(orderItems.productId, productId), eq(orders.userId, body.userId || "")))
          .orderBy(desc(orders.createdAt))
          .limit(1);

        if (recentPurchase.length > 0) {
          deviceOriginalPrice = recentPurchase[0].price;
        }
      }
    }

    if (!deviceOriginalPrice) {
      return NextResponse.json({
        eligible: false,
        reason: "Could not determine original device price",
        tradeInValue: 0,
        breakdown: null,
        policy: { id: policy.id, name: policy.name },
      } as ExchangeCalculationResponse);
    }

    // Calculate base value based on device age
    let baseValuePercentage = 0;

    if (deviceAgeMonths <= 1) {
      baseValuePercentage = policy.month1Value ?? 70;
    } else if (deviceAgeMonths <= 2) {
      baseValuePercentage = policy.month2Value ?? 60;
    } else if (deviceAgeMonths <= 3) {
      baseValuePercentage = policy.month3Value ?? 50;
    } else if (deviceAgeMonths <= 6) {
      baseValuePercentage = policy.month6Value ?? 40;
    } else {
      baseValuePercentage = policy.month12Value ?? 30;
    }

    const baseValue = Math.round((deviceOriginalPrice * baseValuePercentage) / 100);

    // Apply condition modifier
    let conditionModifier = 0;
    switch (condition) {
      case "excellent":
        conditionModifier = policy.excellentConditionBonus ?? 5;
        break;
      case "good":
        conditionModifier = policy.goodConditionBonus ?? 0;
        break;
      case "fair":
        conditionModifier = policy.fairConditionPenalty ?? -10;
        break;
      case "poor":
        conditionModifier = policy.poorConditionPenalty ?? -25;
        break;
    }

    const conditionValue = Math.round(baseValue + (baseValue * conditionModifier) / 100);

    // Apply exchange fee
    const finalValue = Math.max(0, conditionValue - (policy.exchangeFee ?? 0));

    return NextResponse.json({
      eligible: true,
      tradeInValue: finalValue,
      breakdown: {
        originalPrice: deviceOriginalPrice,
        baseValuePercentage,
        baseValue,
        conditionModifier,
        conditionValue,
        exchangeFee: policy.exchangeFee,
        finalValue,
      },
      policy: {
        id: policy.id,
        name: policy.name,
      },
    } as ExchangeCalculationResponse);
  } catch (error) {
    console.error("Exchange calculation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate exchange value" },
      { status: 500 },
    );
  }
}
