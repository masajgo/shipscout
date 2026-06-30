import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
         v.mmsi::text,
         v.imo::text,
         v.name,
         v.type,
         v.flag,
         v.lat,
         v.lon,
         v.speed,
         v.course,
         v.nav_status,
         v.length,
         v.beam,
         v.draught,
         v.destination,
         v.built_year,
         v.age,
         v.scrap_score,
         v.scrap_category,
         v.last_pos_update,
         v.last_static_update,
         v.updated_at,
         v.deadweight          AS dwt,
         v.ldt,
         v.ldt_estimated,
         v.scrap_value_usd,
         v.scrap_value_estimated,
         v.callsign,
         v.gross_tonnage       AS gt,
         v.inspection_count,
         v.detention_count,
         v.deficiency_count,
         v.last_inspection_date,
         v.special_survey_date,
         v.last_dry_dock_date,
         v.manager_name,
         v.photo_thumb,
         v.photo_artist,
         v.photo_license,
         v.photo_license_url,
         (v.licensed_photo->>'pageUrl') AS photo_page_url,
         o.owner_name,
         COALESCE(o.manager_name, v.manager_name) AS mgr_name
       FROM vessels v
       LEFT JOIN owners o ON o.imo = v.imo
       WHERE v.mmsi = $1::bigint`,
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
          scrapCategory:        r.scrap_category || "low",
          scrapReasons:         [],
          staticDataAge:        lastStatic ? Date.now() - lastStatic : null,
          updatedAt:            r.updated_at,
          dwt:                  r.dwt             ? parseInt(r.dwt)             : null,
          ldt:                  r.ldt             ? parseInt(r.ldt)             : null,
          ldtEstimated:         r.ldt_estimated   ?? null,
          scrapValueUsd:        r.scrap_value_usd ? parseFloat(r.scrap_value_usd) : null,
          scrapValueEstimated:  r.scrap_value_estimated ?? null,
          callSign:             r.callsign        || null,
          gt:                   r.gt              ? parseInt(r.gt)              : null,
          inspectionCount:      r.inspection_count  ? parseInt(r.inspection_count)  : 0,
          detentionCount:       r.detention_count   ? parseInt(r.detention_count)   : 0,
          deficiencyCount:      r.deficiency_count  ? parseInt(r.deficiency_count)  : 0,
          lastInspectionDate:   r.last_inspection_date  || null,
          specialSurveyDate:    r.special_survey_date   || null,
          lastDryDockDate:      r.last_dry_dock_date    || null,
          ownerName:            r.owner_name  || null,
          managerName:          r.mgr_name   || null,
          photoThumb:           r.photo_thumb      || null,
          photoArtist:          r.photo_artist     || null,
          photoLicense:         r.photo_license    || null,
          photoLicenseUrl:      r.photo_license_url || null,
          photoPageUrl:         r.photo_page_url   || null,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (err: any) {
    console.error("[/api/vessels/:mmsi]", err);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
}
