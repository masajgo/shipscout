import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface WeeklyDigestSummary {
  id:          number;
  week_start:  string;
  week_end:    string;
  week_label:  string;
  intro_text:  string | null;
  event_count: number;
  published:   boolean;
  created_at:  string;
  // category counts
  arrests:     number;
  detentions:  number;
  auctions:    number;
  sanctions:   number;
  scrap_sales: number;
}

export async function GET() {
  try {
    const { rows } = await pool.query<WeeklyDigestSummary>(`
      SELECT
        d.id, d.week_start::text, d.week_end::text, d.week_label,
        d.intro_text, d.event_count, d.published, d.created_at,
        COUNT(CASE WHEN re.event_type IN ('arrest','bank_seizure') THEN 1 END)::int AS arrests,
        COUNT(CASE WHEN re.event_type = 'detention'               THEN 1 END)::int AS detentions,
        COUNT(CASE WHEN re.event_type = 'auction'                 THEN 1 END)::int AS auctions,
        COUNT(CASE WHEN re.event_type = 'sanction'                THEN 1 END)::int AS sanctions,
        COUNT(CASE WHEN re.event_type = 'scrap_sale'              THEN 1 END)::int AS scrap_sales
      FROM weekly_digests d
      LEFT JOIN radar_events re
        ON COALESCE(re.event_date, re.created_at::date) BETWEEN d.week_start AND d.week_end
      WHERE d.published = true
      GROUP BY d.id
      ORDER BY d.week_start DESC
    `);

    return NextResponse.json(
      { digests: rows, total: rows.length },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (e) {
    console.error("[weekly] query failed", e);
    return NextResponse.json({ error: "Failed to fetch digests" }, { status: 500 });
  }
}
