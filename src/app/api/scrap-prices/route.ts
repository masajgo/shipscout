import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime     = "nodejs";
export const revalidate  = 3600; // 1h edge cache

// GET /api/scrap-prices
// Returns prices grouped by yard with all vessel types
export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT country, yard, vessel_type, price_usd_ldt,
             updated_at, source
      FROM scrap_prices
      ORDER BY yard, vessel_type
    `);

    // Group: { yard → { country, source, updatedAt, prices: { bulker, tanker, container } } }
    const yards: Record<string, {
      country: string; source: string; updatedAt: string;
      prices: Record<string, number>;
    }> = {};

    for (const r of rows) {
      if (!yards[r.yard]) {
        yards[r.yard] = {
          country:   r.country,
          source:    r.source,
          updatedAt: r.updated_at,
          prices:    {},
        };
      }
      yards[r.yard].prices[r.vessel_type] = r.price_usd_ldt;
      // Use latest updated_at
      if (new Date(r.updated_at) > new Date(yards[r.yard].updatedAt)) {
        yards[r.yard].updatedAt = r.updated_at;
        yards[r.yard].source    = r.source;
      }
    }

    return NextResponse.json({ yards, raw: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
