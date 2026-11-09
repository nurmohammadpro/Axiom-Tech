import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getScope, requireStaff } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Cloudinary's own hard limit for images — reject earlier with a clear message.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  const scope = await getScope(request.headers);
  // Any signed-in staff member (owner/manager/salesman) may upload; portal
  // customers and anonymous callers may not touch the shop's Cloudinary account.
  const staffDenied = requireStaff(scope);
  if (staffDenied) {
    return NextResponse.json({ error: staffDenied.error }, { status: staffDenied.status });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret || cloudName.startsWith("your_")) {
    return NextResponse.json(
      {
        error:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env",
      },
      { status: 500 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload — could not read form data" },
      { status: 400 },
    );
  }
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `Image is too large (${Math.ceil(file.size / 1024 / 1024)}MB). Maximum is 10MB — use a smaller image.`,
      },
      { status: 413 },
    );
  }

  const folder = (formData.get("folder") as string | null) || "suppliers/nid";

  try {
    const bytes = await file.arrayBuffer();
    const dataUri = `data:${file.type || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
    });
    return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
  } catch (e) {
    // Cloudinary errors arrive as stringified JSON — surface the real message.
    const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.message) message = parsed.message;
    } catch {
      /* keep raw */
    }
    console.error("Cloudinary upload failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
