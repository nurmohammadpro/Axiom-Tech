import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const checkResult = await db.execute(sql`
      SELECT
        id,
        action,
        created_at,
        created_at::text as created_at_text
      FROM audit_log
      WHERE created_at IS NULL
         OR created_at::text = 'null'
         OR created_at::text = 'undefined'
      LIMIT 10
    `);

    const countRes = (await db.execute(sql`
      SELECT COUNT(*) as total FROM audit_log
    `)) as unknown as { rows: Array<{ total: string }>} & Array<{ total: string }>;
    const invalidRes = (await db.execute(sql`
      SELECT COUNT(*) as invalid FROM audit_log
      WHERE created_at IS NULL
         OR created_at::text = 'null'
         OR created_at::text = 'undefined'
    `)) as unknown as { rows: Array<{ invalid: string }>} & Array<{ invalid: string }>;

    const countResult = (countRes as any).rows?.[0] ?? (countRes as any)[0];
    const invalidCount = (invalidRes as any).rows?.[0] ?? (invalidRes as any)[0];

    return NextResponse.json({
      total: countResult?.total ?? 0,
      invalid: invalidCount?.invalid ?? 0,
      samples: checkResult
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
