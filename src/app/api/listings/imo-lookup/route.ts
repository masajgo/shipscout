import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/listings/imo-lookup?imo=9038828
// Returns vessel basic info from our vessels table for pre-filling the listing form.
export async function GET(req: NextRequest) {
  const imo = req.nextUrl.searchParams.get("imo")?.trim();
  if (!imo || !/^\d{7}$/.test(imo)) {
    return NextResponse.json({ error: "Invalid IMO — must be 7 digits" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query<{
      name: string; type: string; flag: string;
      length: number; beam: number; draught: number;
      built_year: number; scrap_score: number; scrap_category: string;
    }>(
      `SELECT name, type, flag, length, beam, draught, built_year, scrap_score, scrap_category
       FROM vessels WHERE imo = $1 LIMIT 1`,
      [imo]
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Vessel not found in our database" }, { status: 404 });
    }

    const v = rows[0];
    return NextResponse.json({
      imo,
      name:         v.name,
      type:         v.type,
      flag:         v.flag,
      length:       v.length,
      beam:         v.beam,
      draught:      v.draught,
      builtYear:    v.built_year,
      scrapScore:   v.scrap_score,
      scrapCategory: v.scrap_category,
    });
  } catch (err) {
    console.error("[imo-lookup]", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
