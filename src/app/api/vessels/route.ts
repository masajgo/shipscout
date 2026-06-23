import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET /api/vessels?bbox=minLon,minLat,maxLon,maxLat&zoom=8

const MAX_RESULTS  = 2000;

// Simple in-memory rate limiter (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const bboxParam  = searchParams.get("bbox");
  const scrapParam = searchParams.get("scrap");
  const VALID_CATEGORIES = new Set(["critical", "high", "medium", "low"]);
  const scrapFilter = scrapParam
    ? scrapParam.split(",").map(s => s.trim()).filter(s => VALID_CATEGORIES.has(s))
    : undefined;

  // Dashboard list mode — no bbox required
  if (searchParams.get("list") === "1") {
    try {
      const vessels = await listVessels(1000);
      return NextResponse.json(
        { vessels },
        { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
      );
    } catch (err: any) {
      console.error("[/api/vessels list]", err);
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
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
    console.error("[/api/vessels bbox]", err);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { type: "vessels" as const, source: "postgis", vessels, total: vessels.length },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}
