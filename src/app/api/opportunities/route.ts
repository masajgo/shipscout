import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { computeSignals, opportunityScore, type VesselSignal } from "@/lib/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface OpportunityVessel {
  mmsi: string;
  imo: string;
  name: string;
  type: string;
  type_specific: string | null;
  flag: string | null;
  age: number;
  built_year: number | null;
  ldt: number | null;
  deadweight: number | null;
  gross_tonnage: number | null;
  speed: number | null;
  nav_status: number | null;
  scrap_score: number;
  scrap_category: string | null;
  detention_count: number;
  deficiency_count: number;
  special_survey_date: string | null;
  lat: number | null;
  lon: number | null;
  dist_aliaga_nm: number | null;
  // owner contact
  owner_name: string | null;
  manager_name: string | null;
  best_email: string | null;
  emails: string[] | null;
  phones: string[] | null;
  website: string | null;
  linkedin_url: string | null;
  // computed
  signals: VesselSignal[];
  signal_count: number;
  opportunity_score: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const signal_type  = searchParams.get("signal_type") ?? "all";
  const min_age      = parseInt(searchParams.get("min_age") ?? "20", 10);
  const vessel_type  = searchParams.get("vessel_type") ?? "all";
  const max_dist     = searchParams.get("max_dist_aliaga");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  // Aliağa coordinates
  const ALIAGA_LON = 26.9671;
  const ALIAGA_LAT = 38.8483;

  const { rows } = await pool.query<{
    mmsi: string; imo: string; name: string; type: string; type_specific: string | null;
    flag: string | null; age: number; built_year: number | null; ldt: number | null;
    deadweight: number | null; gross_tonnage: number | null; speed: number | null;
    nav_status: number | null; scrap_score: number; scrap_category: string | null;
    detention_count: number; deficiency_count: number; special_survey_date: string | null;
    lat: number | null; lon: number | null; dist_aliaga_nm: number | null;
    owner_name: string | null; manager_name: string | null; best_email: string | null;
    emails: string[] | null; phones: string[] | null; website: string | null;
    linkedin_url: string | null;
  }>(`
    SELECT
      v.mmsi::text, v.imo::text, v.name, v.type, v.type_specific, v.flag,
      v.age, v.built_year, v.ldt, v.deadweight, v.gross_tonnage,
      v.speed, v.nav_status,
      COALESCE(v.scrap_score, 0) AS scrap_score,
      v.scrap_category,
      COALESCE(v.detention_count, 0)  AS detention_count,
      COALESCE(v.deficiency_count, 0) AS deficiency_count,
      v.special_survey_date::text,
      v.lat, v.lon,
      CASE WHEN v.geom IS NOT NULL THEN
        ROUND((ST_Distance(
          v.geom::geography,
          ST_MakePoint($1, $2)::geography
        ) / 1852.0)::numeric, 0)
      ELSE NULL END AS dist_aliaga_nm,
      o.owner_name, o.manager_name, o.best_email,
      o.emails, o.phones, o.website,
      COALESCE(o.linkedin_company_url, o.linkedin_url) AS linkedin_url
    FROM vessels v
    LEFT JOIN owners o ON o.imo = v.imo
    WHERE (v.age >= $3 OR v.detention_count > 0)
      ${vessel_type !== "all" ? `AND LOWER(v.type) = LOWER($4)` : ""}
    ORDER BY v.scrap_score DESC NULLS LAST, v.age DESC
    LIMIT 3000
  `, vessel_type !== "all"
    ? [ALIAGA_LON, ALIAGA_LAT, min_age, vessel_type]
    : [ALIAGA_LON, ALIAGA_LAT, min_age]
  );

  // Compute signals in JS and filter/sort
  const results: OpportunityVessel[] = [];

  for (const row of rows) {
    const signals = computeSignals({
      age:                 row.age,
      speed:               row.speed,
      nav_status:          row.nav_status,
      special_survey_date: row.special_survey_date,
      detention_count:     row.detention_count,
    });

    if (signals.length === 0) continue;

    // Filter by signal type
    if (signal_type !== "all" && !signals.some(s => s.type === signal_type)) continue;

    // Filter by max distance to Aliağa
    if (max_dist && row.dist_aliaga_nm !== null) {
      if (row.dist_aliaga_nm > parseInt(max_dist, 10)) continue;
    }

    results.push({
      ...row,
      signals,
      signal_count:      signals.length,
      opportunity_score: opportunityScore(signals, row.scrap_score),
    });
  }

  results.sort((a, b) => b.opportunity_score - a.opportunity_score);

  return NextResponse.json({
    total: results.length,
    vessels: results.slice(0, limit),
  });
}
