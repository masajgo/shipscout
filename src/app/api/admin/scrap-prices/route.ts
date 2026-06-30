import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/scrap-prices
// Body: { yard, vessel_type, price_usd_ldt, source? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { yard, vessel_type, price_usd_ldt, source } = body;

    if (!yard || !vessel_type || price_usd_ldt == null) {
      return NextResponse.json({ error: "yard, vessel_type, price_usd_ldt required" }, { status: 400 });
    }
    if (!["bulker", "tanker", "container"].includes(vessel_type)) {
      return NextResponse.json({ error: "vessel_type must be bulker, tanker, or container" }, { status: 400 });
    }
    if (typeof price_usd_ldt !== "number" || price_usd_ldt < 50 || price_usd_ldt > 2000) {
      return NextResponse.json({ error: "price_usd_ldt must be a number 50–2000" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `UPDATE scrap_prices
       SET price_usd_ldt = $3,
           source        = COALESCE($4, source),
           updated_at    = NOW()
       WHERE yard = $1 AND vessel_type = $2
       RETURNING yard, vessel_type, price_usd_ldt, source, updated_at`,
      [yard, vessel_type, price_usd_ldt, source ?? null]
    );

    if (!rows.length) {
      return NextResponse.json({ error: `No row found for yard=${yard} vessel_type=${vessel_type}` }, { status: 404 });
    }

    return NextResponse.json({ updated: rows[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/admin/scrap-prices — same as public but no cache
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT country, yard, vessel_type, price_usd_ldt, updated_at, source
       FROM scrap_prices ORDER BY yard, vessel_type`
    );
    return NextResponse.json({ rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
