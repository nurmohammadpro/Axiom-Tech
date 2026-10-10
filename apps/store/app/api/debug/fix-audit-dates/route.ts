import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function POST() {
  try {
    const result = await db.execute(sql`
      UPDATE audit_log
      SET created_at = NOW()
      WHERE created_at IS NULL
         OR created_at::text = 'null'
         OR created_at::text = 'undefined'
    `);

    return NextResponse.json({
      success: true,
      fixed: result.rowCount,
      message: `Fixed ${result.rowCount} audit entries with invalid dates`
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
