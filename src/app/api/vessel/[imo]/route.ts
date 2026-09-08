import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imo: string }> }
) {
  let imo: string;
  try {
    ({ imo } = await params);
  } catch {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  try {
    const { rows } = await pool.query(`
      SELECT
        v.imo::text, v.mmsi::text, v.name, v.flag, v.type_specific, v.type,
        v.built_year, v.age, v.deadweight, v.gross_tonnage, v.ldt, v.ldt_estimated,
        v.length, v.beam, v.draught, v.callsign, v.home_port,
        v.scrap_score, v.scrap_category,
        v.inspection_count, v.detention_count, v.deficiency_count,
        v.special_survey_date::text, v.dry_dock_date::text,
        v.last_dry_dock_date::text, v.last_inspection_date::text,
        v.photo_url, v.nav_status, v.speed,
        o.owner_name, o.manager_name, o.ism_manager,
        o.best_email AS owner_email, o.phone AS owner_phone,
        o.address AS owner_address, o.country AS owner_country,
        o.website AS owner_website
      FROM vessels v
      LEFT JOIN owners o ON o.imo = v.imo
      WHERE v.imo = $1::bigint
      LIMIT 1
    `, [imo]);

    if (!rows.length) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    const v = rows[0];
    const age = v.age ?? (v.built_year ? new Date().getFullYear() - v.built_year : null);

    return NextResponse.json({
      imo,
      age,
      scrapScore: v.scrap_score ?? 0,
      photoUrl:   v.photo_url,
      particulars: {
        name:         v.name,
        flag:         v.flag,
        type:         v.type_specific ?? v.type,
        builtYear:    v.built_year,
        builtAt:      null,
        dwt:          v.deadweight ? Number(v.deadweight) : 0,
        grt:          v.gross_tonnage ? Number(v.gross_tonnage) : null,
        nrt:          null,
        ldt:          v.ldt ? Number(v.ldt) : null,
        ldt_estimated: v.ldt_estimated ?? false,
        loa:          v.length ? Number(v.length) : null,
        beam:         v.beam ? Number(v.beam) : null,
        draft:        v.draught ? Number(v.draught) : null,
        callSign:     v.callsign,
        mmsi:         v.mmsi,
        classSociety: null,
        status:       v.nav_status != null ? String(v.nav_status) : null,
        homePort:     v.home_port,
      },
      owner: {
        name:         v.owner_name,
        email:        v.owner_email,
        phone:        v.owner_phone,
        address:      v.owner_address,
        country:      v.owner_country,
        managerName:  v.manager_name,
        managerEmail: null,
        website:      v.owner_website,
      },
      surveys: {
        lastDryDock: v.last_dry_dock_date,
        nextDryDock: v.dry_dock_date,
        classExpiry: v.special_survey_date,
      },
      detentions: v.detention_count > 0 ? [{ count: v.detention_count, deficiencies: v.deficiency_count }] : [],
    });
  } catch (e: unknown) {
    console.error(`[vessel/${imo}]`, e);
    return NextResponse.json({ error: "Vessel data unavailable" }, { status: 503 });
  }
}
