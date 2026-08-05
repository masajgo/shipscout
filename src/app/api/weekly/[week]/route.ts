import { NextResponse } from "next/server";
import pool from "@/lib/db";

function stripMd(t: string | null): string | null {
  if (!t) return t;
  return t
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface WeeklyDigestEvent {
  id:                number;
  imo:               string | null;
  vessel_name:       string | null;
  event_type:        string;
  event_date:        string | null;
  location:          string | null;
  source_name:       string;
  summary:           string;
  editorial_summary: string | null;
  matched_vessel_id: number | null;
  vessel_mmsi:       string | null;
  vessel_flag:       string | null;
  vessel_type:       string | null;
  vessel_dwt:        number | null;
  vessel_built:      number | null;
  photo_url:         string | null;
  photo_thumb:       string | null;
  photo_attribution: string | null;
  photo_license_url: string | null;
  owner_name:        string | null;
  manager_name:      string | null;
  has_contact:       boolean;
}

export interface WeeklyDigestDetail {
  id:            number;
  week_start:    string;
  week_end:      string;
  week_label:    string;
  intro_text:    string | null;
  event_count:   number;
  published:     boolean;
  lead_story_id: number | null;
  created_at:    string;
  events:        WeeklyDigestEvent[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ week: string }> }
) {
  const { week } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: "Invalid week format. Use YYYY-MM-DD." }, { status: 400 });
  }

  try {
    const digestRes = await pool.query(
      `SELECT id, week_start::text, week_end::text, week_label,
              intro_text, event_count, published, lead_story_id, created_at
       FROM weekly_digests
       WHERE week_start = $1::date AND published = true`,
      [week]
    );

    if (digestRes.rows.length === 0) {
      return NextResponse.json({ error: "Digest not found" }, { status: 404 });
    }

    const digest = digestRes.rows[0];

    const eventsRes = await pool.query<WeeklyDigestEvent>(`
      SELECT
        re.id,
        re.imo,
        re.vessel_name,
        re.event_type,
        re.event_date::text,
        re.location,
        re.source_name,
        re.summary,
        re.editorial_summary,
        re.matched_vessel_id,
        v.mmsi::text            AS vessel_mmsi,
        v.flag                  AS vessel_flag,
        v.type                  AS vessel_type,
        v.deadweight            AS vessel_dwt,
        v.built_year            AS vessel_built,
        vp.photo_url,
        vp.photo_thumb,
        vp.attribution          AS photo_attribution,
        vp.license_url          AS photo_license_url,
        o.owner_name,
        o.manager_name,
        (o.emails IS NOT NULL AND array_length(o.emails, 1) > 0) AS has_contact
      FROM radar_events re
      LEFT JOIN vessels v ON v.mmsi = re.matched_vessel_id
      LEFT JOIN LATERAL (
        SELECT photo_url, photo_thumb, attribution, license_url
        FROM vessel_photos
        WHERE imo::text = re.imo AND photo_url IS NOT NULL AND photo_url <> 'none'
        ORDER BY is_primary DESC NULLS LAST, id ASC
        LIMIT 1
      ) vp ON true
      LEFT JOIN owners o ON o.imo = v.imo
      WHERE COALESCE(re.event_date, re.created_at::date)
            BETWEEN $1::date AND $2::date
        AND (re.event_type != 'sanction' OR re.event_date IS NOT NULL)
      ORDER BY re.event_date ASC NULLS LAST, re.created_at ASC
    `, [digest.week_start, digest.week_end]);

    const cleanDigest = {
      ...digest,
      intro_text: stripMd(digest.intro_text),
      events: eventsRes.rows.map(ev => ({
        ...ev,
        editorial_summary: stripMd(ev.editorial_summary),
        summary: stripMd(ev.summary) ?? ev.summary,
      })),
    };

    return NextResponse.json(
      cleanDigest,
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e) {
    console.error("[weekly/[week]] query failed", e);
    return NextResponse.json({ error: "Failed to fetch digest" }, { status: 500 });
  }
}
