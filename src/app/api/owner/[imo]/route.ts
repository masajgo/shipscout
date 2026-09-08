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
    const [vRes, oRes] = await Promise.all([
      pool.query(`
        SELECT imo::text, name, flag, type_specific, type, built_year, age,
               deadweight, gross_tonnage, ldt, scrap_score,
               detention_count, deficiency_count,
               special_survey_date::text, dry_dock_date::text, last_dry_dock_date::text
        FROM vessels WHERE imo = $1::bigint LIMIT 1
      `, [imo]),
      pool.query(`
        SELECT owner_name, manager_name, ism_manager,
               best_email, phone, address, country, website, emails, phones
        FROM owners WHERE imo = $1::bigint LIMIT 1
      `, [imo]),
    ]);

    if (!vRes.rows.length) {
      return NextResponse.json({ error: "Vessel not found" }, { status: 404 });
    }

    const v = vRes.rows[0];
    const o = oRes.rows[0] ?? {};
    const age = v.age ?? (v.built_year ? new Date().getFullYear() - v.built_year : null);

    return NextResponse.json({
      imo,
      scrapScore: Math.min(100, v.scrap_score ?? 0),
      age,
      particulars: {
        name:         v.name,
        flag:         v.flag,
        type:         v.type_specific ?? v.type,
        builtYear:    v.built_year,
        dwt:          v.deadweight ? Number(v.deadweight) : null,
        grt:          v.gross_tonnage ? Number(v.gross_tonnage) : null,
        ldt:          v.ldt ? Number(v.ldt) : null,
      },
      owner: {
        name:         o.owner_name,
        email:        o.best_email,
        phone:        o.phone,
        address:      o.address,
        country:      o.country,
        managerName:  o.manager_name,
        website:      o.website,
        emails:       o.emails,
        phones:       o.phones,
      },
      surveys: {
        lastDryDock: v.last_dry_dock_date,
        nextDryDock: v.dry_dock_date,
        classExpiry: v.special_survey_date,
      },
      detentions: v.detention_count > 0
        ? [{ count: v.detention_count, deficiencies: v.deficiency_count }]
        : [],
    });
  } catch (e: unknown) {
    console.error(`[owner/${imo}]`, e);
    return NextResponse.json({ error: "Owner data unavailable" }, { status: 503 });
  }
}
