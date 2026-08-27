import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface WeeklyDigestSummary {
  id:               number;
  week_start:       string;
  week_end:         string;
  week_label:       string;
  intro_text:       string | null;
  event_count:      number;
  published:        boolean;
  lead_story_id:    number | null;
  lead_vessel_name: string | null;
  lead_event_type:  string | null;
  lead_vessel_type: string | null;
  lead_photo_thumb: string | null;
  lead_photo_url:   string | null;
  created_at:       string;
  auctions:         number;
  arrests:          number;
  bankruptcies:     number;
  sanctions:        number;
  detentions:       number;
  scrap_sales:      number;
}

export async function GET() {
  try {
    const { rows } = await pool.query<WeeklyDigestSummary>(`
      SELECT
        d.id,
        d.week_start::text,
        d.week_end::text,
        d.week_label,
        d.intro_text,
        d.event_count,
        d.published,
        d.lead_story_id,
        d.created_at,
        rl.vessel_name                        AS lead_vessel_name,
        rl.event_type                         AS lead_event_type,
        v.type                                AS lead_vessel_type,
        vp.photo_thumb                        AS lead_photo_thumb,
        vp.photo_url                          AS lead_photo_url,
        COUNT(CASE WHEN re.event_type IN ('auction','bank_seizure') THEN 1 END)::int AS auctions,
        COUNT(CASE WHEN re.event_type = 'arrest'                   THEN 1 END)::int AS arrests,
        COUNT(CASE WHEN re.event_type = 'bankruptcy'               THEN 1 END)::int AS bankruptcies,
        COUNT(CASE WHEN re.event_type = 'sanction' AND re.event_date IS NOT NULL THEN 1 END)::int AS sanctions,
        COUNT(CASE WHEN re.event_type = 'detention'                THEN 1 END)::int AS detentions,
        COUNT(CASE WHEN re.event_type = 'scrap_sale'               THEN 1 END)::int AS scrap_sales
      FROM weekly_digests d
      LEFT JOIN radar_events rl ON rl.id = d.lead_story_id
      LEFT JOIN vessels v ON v.mmsi = rl.matched_vessel_id
      LEFT JOIN LATERAL (
        SELECT photo_thumb, photo_url
        FROM vessel_photos
        WHERE imo::text = rl.imo AND photo_url IS NOT NULL AND photo_url <> 'none'
        ORDER BY is_primary DESC NULLS LAST, id ASC
        LIMIT 1
      ) vp ON true
      LEFT JOIN radar_events re
        ON COALESCE(re.event_date, re.created_at::date) BETWEEN d.week_start AND d.week_end
        AND (re.event_type != 'sanction' OR re.event_date IS NOT NULL)
        AND re.event_type NOT IN ('layup', 'judicial_auction')
      WHERE (d.published = true OR d.event_count > 0)
      GROUP BY d.id, rl.vessel_name, rl.event_type, v.type, vp.photo_thumb, vp.photo_url
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
