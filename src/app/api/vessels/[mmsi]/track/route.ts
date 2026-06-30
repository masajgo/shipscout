import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vessels/:mmsi/track?hours=24&simplify=0.0001
//
// Returns GeoJSON LineString + raw point array for the last N hours.
// ?simplify=  Douglas-Peucker tolerance in degrees (0 = no simplification)
//             Default 0.0001 ≈ ~11 m — removes redundant collinear points.

const MAX_HOURS   = 168; // 7 days hard cap
const DEFAULT_HRS = 24;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;
  const sp = new URL(req.url).searchParams;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  const hours    = Math.min(parseInt(sp.get("hours") ?? String(DEFAULT_HRS), 10), MAX_HOURS);
  const simplify = parseFloat(sp.get("simplify") ?? "0.0001");

  try {
    // PostGIS query: ordered points → optional Douglas-Peucker simplification
    // ST_Simplify works on geometry, not geography, so we cast temporarily.
    const simplifyExpr = simplify > 0
      ? `ST_Simplify(geom::geometry, ${simplify})`
      : `geom::geometry`;

    const { rows } = await pool.query(
      `SELECT
         ST_Y(${simplifyExpr})            AS lat,
         ST_X(${simplifyExpr})            AS lon,
         recorded_at
       FROM vessel_tracks
       WHERE mmsi        = $1::bigint
         AND recorded_at > NOW() - ($2 || ' hours')::INTERVAL
       ORDER BY recorded_at ASC`,
      [mmsi, hours],
    );

    if (!rows.length) {
      return NextResponse.json({ mmsi, points: [], geojson: null });
    }

    // GeoJSON LineString for map rendering
    const coordinates = rows.map((r: any) => [parseFloat(r.lon), parseFloat(r.lat)]);
    const geojson = coordinates.length >= 2
      ? {
          type:       "Feature" as const,
          properties: { mmsi, hours },
          geometry: {
            type:        "LineString" as const,
            coordinates,
          },
        }
      : null;

    return NextResponse.json(
      {
        mmsi,
        points: rows.map((r: any) => ({
          lat:         parseFloat(r.lat),
          lon:         parseFloat(r.lon),
          recorded_at: r.recorded_at,
        })),
        geojson,
        count: rows.length,
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (err: any) {
    // vessel_tracks table may not exist yet — return empty track gracefully
    if (err.message?.includes("vessel_tracks")) {
      return NextResponse.json({ mmsi, points: [], geojson: null, count: 0 });
    }
    return NextResponse.json({ error: "database error", detail: err.message }, { status: 503 });
  }
}
