import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/authz";
import {
  getAllFeatureSettings,
  setFeatureVisibility,
  initializeDefaultFeatureSettings,
} from "@/lib/feature-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);

    // Only owners can access feature settings
    if (scope.role !== "owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const settings = await getAllFeatureSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching feature settings:", error);
    return NextResponse.json({ error: "Failed to fetch feature settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);

    // Only owners can modify feature settings
    if (scope.role !== "owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { role, featureKey, isVisible } = body;

    if (!role || !featureKey || typeof isVisible !== "boolean") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await setFeatureVisibility(role, featureKey, isVisible, scope.userId || "system");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating feature settings:", error);
    return NextResponse.json({ error: "Failed to update feature settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);

    // Only owners can initialize feature settings
    if (scope.role !== "owner") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await initializeDefaultFeatureSettings();
    return NextResponse.json({ success: true, message: "Feature settings initialized" });
  } catch (error) {
    console.error("Error initializing feature settings:", error);
    return NextResponse.json({ error: "Failed to initialize feature settings" }, { status: 500 });
  }
}
