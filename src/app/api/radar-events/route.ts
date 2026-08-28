import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RadarEvent {
  id:                number;
  imo:               string | null;
  vessel_name:       string | null;
  event_type:        "arrest" | "detention" | "auction" | "bank_seizure" | "sanction" | "scrap_sale" | "layup" | "judicial_auction" | "bankruptcy";
  event_date:        string | null;
  location:          string | null;
  source_name:       string;
  summary:           string;
  matched_vessel_id: number | null;
  raw_headline:      string | null;
  created_at:        string;
  // joined from vessels + owners
  vessel_mmsi:       string | null;
  vessel_flag:       string | null;
  vessel_type:       string | null;
  owner_name:        string | null;
  manager_name:      string | null;
  emails:            string[] | null;
  phones:            string[] | null;
  website:           string | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get("event_type");
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const days      = Math.min(parseInt(searchParams.get("days") ?? "30"), 90);

  const conditions: string[] = [
    `re.created_at > now() - interval '${days} days'`,
  ];
  const params: (string | number)[] = [];

  if (eventType && eventType !== "all") {
    params.push(eventType);
    conditions.push(`re.event_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const { rows } = await pool.query<RadarEvent>(`
      SELECT
        re.id, re.imo, re.vessel_name, re.event_type, re.event_date,
        re.location, re.source_name, re.summary, re.matched_vessel_id,
        re.raw_headline, re.created_at,
        v.mmsi::text      AS vessel_mmsi,
        v.flag            AS vessel_flag,
        v.type            AS vessel_type,
        o.owner_name,
        o.manager_name,
        o.emails,
        o.phones,
        o.website
      FROM radar_events re
      LEFT JOIN vessels v ON v.mmsi = re.matched_vessel_id
      LEFT JOIN owners  o ON o.imo  = v.imo
      ${where}
      ORDER BY re.created_at DESC
      LIMIT ${limit}
    `, params);

    return NextResponse.json(
      { events: rows, total: rows.length, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (e) {
    console.error("[radar-events] query failed", e);
    return NextResponse.json({ error: "Failed to fetch radar events" }, { status: 500 });
  }
}
