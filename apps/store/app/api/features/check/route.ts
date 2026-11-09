import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/authz";
import { canAccessFeature, getFeatureVisibility } from "@/lib/feature-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);
    const { searchParams } = new URL(request.url);
    const featureKey = searchParams.get("feature");

    if (!featureKey) {
      return NextResponse.json({ error: "Feature key is required" }, { status: 400 });
    }

    const hasAccess = await canAccessFeature(scope.role as any, featureKey as any);
    return NextResponse.json({ hasAccess });
  } catch (error) {
    console.error("Error checking feature access:", error);
    return NextResponse.json({ error: "Failed to check feature access" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);
    const body = await request.json();
    const { featureKeys } = body;

    if (!Array.isArray(featureKeys)) {
      return NextResponse.json({ error: "featureKeys must be an array" }, { status: 400 });
    }

    const visibility = await getFeatureVisibility(scope.role as any);
    const results = featureKeys.reduce((acc: Record<string, boolean>, key: string) => {
      acc[key] = visibility[key as keyof typeof visibility] || false;
      return acc;
    }, {});

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error checking multiple features:", error);
    return NextResponse.json({ error: "Failed to check feature access" }, { status: 500 });
  }
}
