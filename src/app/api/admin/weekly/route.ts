import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization")?.replace("Bearer ", "");
  const param  = req.nextUrl.searchParams.get("key");
  return header === secret || param === secret;
}

// GET /api/admin/weekly?key=... — all digests (including unpublished)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { rows } = await pool.query(`
      SELECT
        d.id, d.week_start::text, d.week_end::text, d.week_label,
        d.intro_text, d.event_count, d.published, d.created_at,
        COUNT(re.id)::int AS actual_event_count,
        COUNT(CASE WHEN re.event_type IN ('arrest','bank_seizure') THEN 1 END)::int AS arrests,
        COUNT(CASE WHEN re.event_type = 'detention'               THEN 1 END)::int AS detentions,
        COUNT(CASE WHEN re.event_type = 'auction'                 THEN 1 END)::int AS auctions,
        COUNT(CASE WHEN re.event_type = 'sanction'                THEN 1 END)::int AS sanctions,
        COUNT(CASE WHEN re.event_type = 'scrap_sale'              THEN 1 END)::int AS scrap_sales
      FROM weekly_digests d
      LEFT JOIN radar_events re
        ON COALESCE(re.event_date, re.created_at::date) BETWEEN d.week_start AND d.week_end
      GROUP BY d.id
      ORDER BY d.week_start DESC
    `);
    return NextResponse.json({ digests: rows, total: rows.length });
  } catch (e) {
    console.error("[admin/weekly GET] failed", e);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

// PATCH /api/admin/weekly — update intro_text and/or published status
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: number; intro_text?: string; published?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, intro_text, published } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const sets: string[]  = [];
  const vals: unknown[] = [];

  if (intro_text !== undefined) { vals.push(intro_text); sets.push(`intro_text = $${vals.length}`); }
  if (published  !== undefined) { vals.push(published);  sets.push(`published  = $${vals.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  vals.push(id);
  try {
    const { rowCount } = await pool.query(
      `UPDATE weekly_digests SET ${sets.join(", ")} WHERE id = $${vals.length}`,
      vals
    );
    if (rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/weekly PATCH] failed", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
