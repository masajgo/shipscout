import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/listings/vessel-search?q=maersk
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const { rows } = await pool.query(
    `SELECT imo, name, type, flag, built_year
     FROM vessels
     WHERE name ILIKE $1
     ORDER BY name
     LIMIT 8`,
    [`%${q}%`]
  );

  return NextResponse.json(
    rows.map(r => ({
      imo:       r.imo,
      name:      r.name,
      type:      r.type,
      flag:      r.flag,
      builtYear: r.built_year,
    }))
  );
}
