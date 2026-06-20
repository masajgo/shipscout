import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

// GET /api/vessels/:mmsi

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         mmsi::text,
         imo::text,
         name,
         type,
         flag,
         lat,
         lon,
         speed,
         course,
         nav_status,
         length,
         beam,
         draught,
         destination,
         built_year,
         age,
         scrap_score,
         scrap_category,
         last_pos_update,
         last_static_update,
         updated_at
       FROM vessels
       WHERE mmsi = $1::bigint`,
      [mmsi],
    );

    if (!rows.length) {
      return NextResponse.json({ error: "vessel not found" }, { status: 404 });
    }

    const r = rows[0];
    const lastStatic = r.last_static_update ? new Date(r.last_static_update).getTime() : null;

    return NextResponse.json(
      {
        vessel: {
          mmsi:          r.mmsi,
          imo:           r.imo          || null,
          name:          r.name         || "Unknown vessel",
          type:          r.type         || null,
          flag:          r.flag         || null,
          position:      { lat: parseFloat(r.lat), lon: parseFloat(r.lon) },
          speed:         parseFloat(r.speed  ?? 0),
          course:        parseFloat(r.course ?? 0),
          navStatus:     parseInt(r.nav_status ?? 0),
          length:        r.length  ? parseFloat(r.length)  : null,
          beam:          r.beam    ? parseFloat(r.beam)    : null,
          draught:       r.draught ? parseFloat(r.draught) : null,
          destination:   r.destination || null,
          builtYear:     r.built_year  ? parseInt(r.built_year) : null,
          age:           r.age         ? parseInt(r.age)        : null,
          scrapScore:    r.scrap_score ? parseInt(r.scrap_score) : 0,
          scrapCategory: r.scrap_category || "low",
          scrapReasons:  [],
          staticDataAge: lastStatic ? Date.now() - lastStatic : null,
          updatedAt:     r.updated_at,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: "database error", detail: err.message }, { status: 503 });
  }
}
