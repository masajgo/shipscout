import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET /api/vessels?bbox=minLon,minLat,maxLon,maxLat&zoom=8

const CLUSTER_ZOOM = 12;
const MAX_RESULTS  = 2000;

function gridDeg(zoom: number): number {
  if (zoom <=  4) return 8;
  if (zoom <=  6) return 2;
  if (zoom <=  8) return 0.5;
  if (zoom <= 10) return 0.15;
  return 0.05;
}

interface RawVessel {
  mmsi:           string;
  name:           string;
  type:           string;
  speed:          string;
  course:         string;
  nav:            string;
  lat:            string;
  lon:            string;
  scrap_score:    string;
  scrap_category: string;
  ts:             string;
}

async function fromSupabase(
  minLon: number, minLat: number,
  maxLon: number, maxLat: number,
  scrapFilter?: string[],
): Promise<RawVessel[]> {
  const params: (number | string | string[])[] = [minLon, minLat, maxLon, maxLat, MAX_RESULTS];
  const scrapClause = scrapFilter && scrapFilter.length > 0
    ? `AND scrap_category = ANY($6::text[])`
    : "";
  if (scrapFilter && scrapFilter.length > 0) params.push(scrapFilter);

  const { rows } = await pool.query(
    `SELECT
       mmsi::text,
       COALESCE(name, '')              AS name,
       COALESCE(type, '')              AS type,
       COALESCE(speed,      0)::text   AS speed,
       COALESCE(course,     0)::text   AS course,
       COALESCE(nav_status, 0)::text   AS nav,
       lat::text,
       lon::text,
       COALESCE(scrap_score, 0)::text  AS scrap_score,
       COALESCE(scrap_category, 'low') AS scrap_category,
       updated_at::text                AS ts
     FROM vessels
     WHERE lat BETWEEN $2 AND $4
       AND lon BETWEEN $1 AND $3
       ${scrapClause}
     ORDER BY scrap_score DESC NULLS LAST
     LIMIT $5`,
    params,
  );
  return rows as RawVessel[];
}

interface Cluster {
  lon:           number;
  lat:           number;
  count:         number;
  mmsis:         string[];
  maxScrapScore: number;
}

function clusterVessels(vessels: RawVessel[], cellDeg: number): Cluster[] {
  const cells = new Map<string, Cluster>();

  for (const v of vessels) {
    const lon   = parseFloat(v.lon);
    const lat   = parseFloat(v.lat);
    const score = parseInt(v.scrap_score) || 0;
    const cx    = Math.floor(lon / cellDeg) * cellDeg + cellDeg / 2;
    const cy    = Math.floor(lat / cellDeg) * cellDeg + cellDeg / 2;
    const key   = `${cx.toFixed(6)},${cy.toFixed(6)}`;

    const cell = cells.get(key);
    if (cell) {
      cell.lon   = (cell.lon * cell.count + lon) / (cell.count + 1);
      cell.lat   = (cell.lat * cell.count + lat) / (cell.count + 1);
      cell.count++;
      if (cell.mmsis.length < 10) cell.mmsis.push(v.mmsi);
      if (score > cell.maxScrapScore) cell.maxScrapScore = score;
    } else {
      cells.set(key, { lon, lat, count: 1, mmsis: [v.mmsi], maxScrapScore: score });
    }
  }

  return [...cells.values()];
}

// GET /api/vessels?list=1  — dashboard list mode (no bbox needed)
async function listVessels(limit = 1000): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT
       mmsi::text,
       imo::text,
       COALESCE(name, '')           AS name,
       COALESCE(type, '')           AS type,
       flag,
       built_year,
       age,
       deadweight                   AS dwt,
       ldt,
       ldt_estimated,
       scrap_value_usd,
       scrap_value_estimated,
       COALESCE(scrap_score,    0)  AS score,
       COALESCE(scrap_category,'low') AS scrap_category,
       manager_name
     FROM vessels
     WHERE imo IS NOT NULL
     ORDER BY scrap_score DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bboxParam  = searchParams.get("bbox");
  const zoom       = parseInt(searchParams.get("zoom") ?? "8", 10);
  const scrapParam = searchParams.get("scrap");
  const scrapFilter = scrapParam ? scrapParam.split(",").map(s => s.trim()).filter(Boolean) : undefined;

  // Dashboard list mode — no bbox required
  if (searchParams.get("list") === "1") {
    try {
      const vessels = await listVessels(1000);
      return NextResponse.json(
        { vessels },
        { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
      );
    } catch (err: any) {
      return NextResponse.json({ error: "database unavailable", detail: err.message }, { status: 503 });
    }
  }

  if (!bboxParam) {
    return NextResponse.json({ error: "bbox required: minLon,minLat,maxLon,maxLat" }, { status: 400 });
  }

  const parts = bboxParam.split(",").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    return NextResponse.json({ error: "invalid bbox" }, { status: 400 });
  }
  const [minLon, minLat, maxLon, maxLat] = parts;

  let vessels: RawVessel[];
  try {
    vessels = await fromSupabase(minLon, minLat, maxLon, maxLat, scrapFilter);
  } catch (err: any) {
    return NextResponse.json({ error: "database unavailable", detail: err.message }, { status: 503 });
  }

  const payload =
    zoom < CLUSTER_ZOOM
      ? { type: "clusters" as const, source: "postgis", clusters: clusterVessels(vessels, gridDeg(zoom)), total: vessels.length }
      : { type: "vessels"  as const, source: "postgis", vessels,  total: vessels.length };

  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
