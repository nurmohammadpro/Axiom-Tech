import { NextRequest, NextResponse } from "next/server";
import { getScope } from "@/lib/authz";
import { getFeatureVisibility, type FeatureKey } from "@/lib/feature-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const scope = await getScope(request.headers);
    if (!scope.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = scope.role as "owner" | "manager" | "salesman" | "customer";
    const visibility = await getFeatureVisibility(role);

    return NextResponse.json({ role, permissions: visibility });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
