import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { computeSignals, opportunityScore, type VesselSignal } from "@/lib/signals";
import { priceCategory, type PriceCategory, type YardPrices } from "@/lib/scrapValue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Major scrap yard coordinates [lon, lat]
const SCRAP_YARDS = {
  Aliaga:      { lon: 26.9671, lat: 38.8483 },
  Alang:       { lon: 72.2000, lat: 21.4000 },
  Chittagong:  { lon: 91.8000, lat: 22.3000 },
  Gadani:      { lon: 66.7000, lat: 25.1000 },
} as const;

const ALIAGA_LON = SCRAP_YARDS.Aliaga.lon;
const ALIAGA_LAT = SCRAP_YARDS.Aliaga.lat;

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
  dist_alang_nm: number | null;
  dist_chittagong_nm: number | null;
  dist_gadani_nm: number | null;
  min_dist_scrapyard_nm: number | null;
  nearest_yard: string | null;
  // owner contact
  owner_name: string | null;
  manager_name: string | null;
  best_email: string | null;
  emails: string[] | null;
  phones: string[] | null;
  website: string | null;
  linkedin_url: string | null;
  contacts: { name: string | null; title: string | null; email: string | null; linkedin: string | null; source: string }[] | null;
  enriched: boolean;
  // computed
  signals: VesselSignal[];
  signal_count: number;
  opportunity_score: number;
  price_category: PriceCategory;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const signal_type  = searchParams.get("signal_type") ?? "all";
  const min_age      = parseInt(searchParams.get("min_age") ?? "20", 10);
  const vessel_type  = searchParams.get("vessel_type") ?? "all";
  const max_dist     = searchParams.get("max_dist_aliaga");
  const max_yard_dist = searchParams.get("max_dist_yard");
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);

  const { rows } = await pool.query<{
    mmsi: string; imo: string; name: string; type: string; type_specific: string | null;
    flag: string | null; age: number; built_year: number | null; ldt: number | null;
    deadweight: number | null; gross_tonnage: number | null; speed: number | null;
    nav_status: number | null; scrap_score: number; scrap_category: string | null;
    detention_count: number; deficiency_count: number; special_survey_date: string | null;
    lat: number | null; lon: number | null;
    dist_aliaga_nm: number | null;
    dist_alang_nm: number | null;
    dist_chittagong_nm: number | null;
    dist_gadani_nm: number | null;
    owner_name: string | null; manager_name: string | null; best_email: string | null;
    emails: string[] | null; phones: string[] | null; website: string | null;
    linkedin_url: string | null; contacts: unknown; web_fetched_at: string | null;
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
      CASE WHEN v.geom IS NOT NULL THEN ROUND((ST_Distance(v.geom::geography, ST_MakePoint($1,$2)::geography) / 1852.0)::numeric, 0) ELSE NULL END AS dist_aliaga_nm,
      CASE WHEN v.geom IS NOT NULL THEN ROUND((ST_Distance(v.geom::geography, ST_MakePoint(72.2,21.4)::geography) / 1852.0)::numeric, 0) ELSE NULL END AS dist_alang_nm,
      CASE WHEN v.geom IS NOT NULL THEN ROUND((ST_Distance(v.geom::geography, ST_MakePoint(91.8,22.3)::geography) / 1852.0)::numeric, 0) ELSE NULL END AS dist_chittagong_nm,
      CASE WHEN v.geom IS NOT NULL THEN ROUND((ST_Distance(v.geom::geography, ST_MakePoint(66.7,25.1)::geography) / 1852.0)::numeric, 0) ELSE NULL END AS dist_gadani_nm,
      o.owner_name, o.manager_name, o.best_email,
      o.emails, o.phones, o.website,
      COALESCE(o.linkedin_company_url, o.linkedin_url) AS linkedin_url,
      o.contacts, o.web_fetched_at
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

  const results: OpportunityVessel[] = [];

  for (const row of rows) {
    // Compute nearest scrap yard
    const yardDists: [string, number][] = [
      ["Aliağa",     row.dist_aliaga_nm     ?? Infinity],
      ["Alang",      row.dist_alang_nm      ?? Infinity],
      ["Chittagong", row.dist_chittagong_nm ?? Infinity],
      ["Gadani",     row.dist_gadani_nm     ?? Infinity],
    ];
    const [nearest_yard, min_dist] = yardDists.reduce((a, b) => b[1] < a[1] ? b : a);
    const min_dist_scrapyard_nm = isFinite(min_dist) ? min_dist : null;

    const signals = computeSignals({
      age:                  row.age,
      speed:                row.speed,
      nav_status:           row.nav_status,
      special_survey_date:  row.special_survey_date,
      detention_count:      row.detention_count,
      min_dist_scrapyard_nm,
      nearest_yard,
    });

    if (signals.length === 0) continue;

    if (signal_type !== "all" && !signals.some(s => s.type === signal_type)) continue;

    if (max_dist && row.dist_aliaga_nm !== null) {
      if (row.dist_aliaga_nm > parseInt(max_dist, 10)) continue;
    }

    if (max_yard_dist && min_dist_scrapyard_nm !== null) {
      if (min_dist_scrapyard_nm > parseInt(max_yard_dist, 10)) continue;
    }

    results.push({
      ...row,
      min_dist_scrapyard_nm,
      nearest_yard,
      signals,
      signal_count:      signals.length,
      opportunity_score: opportunityScore(signals, row.scrap_score),
      price_category:    priceCategory(row.type, row.type_specific),
      contacts:          (row.contacts as { name: string | null; title: string | null; email: string | null; linkedin: string | null; source: string }[] | null) ?? null,
      enriched:          !!row.web_fetched_at,
    });
  }

  function hasContact(v: OpportunityVessel) {
    const emails = [...(v.emails?.filter(Boolean) ?? []), ...(v.best_email ? [v.best_email] : [])];
    return emails.length > 0 || (v.phones?.length ?? 0) > 0;
  }

  results.sort((a, b) => {
    const aC = hasContact(a) ? 1 : 0;
    const bC = hasContact(b) ? 1 : 0;
    if (aC !== bC) return bC - aC;
    if (a.signal_count !== b.signal_count) return b.signal_count - a.signal_count;
    return b.opportunity_score - a.opportunity_score;
  });

  const yards: YardPrices = {};
  const priceRows = await pool.query<{ yard: string; country: string; vessel_type: string; price_usd_ldt: number; updated_at: string }>(
    `SELECT yard, country, vessel_type, price_usd_ldt, updated_at FROM scrap_prices ORDER BY updated_at DESC`
  );
  let prices_updated_at: string | null = null;
  for (const p of priceRows.rows) {
    yards[p.yard] ??= { country: p.country, prices: {} };
    yards[p.yard].prices[p.vessel_type] = Number(p.price_usd_ldt);
    if (!prices_updated_at || p.updated_at > prices_updated_at) prices_updated_at = p.updated_at;
  }

  return NextResponse.json({
    total:             results.length,
    contactable_total: results.filter(hasContact).length,
    vessels:           results.slice(0, limit),
    yards,
    prices_updated_at,
  });
}
