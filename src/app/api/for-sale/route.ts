import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type") || "";
  const minDwt = searchParams.get("minDwt") || "";
  const maxDwt = searchParams.get("maxDwt") || "";
  const por    = searchParams.get("por");  // "true" = include price-on-request only

  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let i = 1;

  if (type) {
    conditions.push(`vessel_type ILIKE $${i++}`);
    values.push(`%${type}%`);
  }
  if (minDwt) { conditions.push(`dwt >= $${i++}`); values.push(parseInt(minDwt)); }
  if (maxDwt) { conditions.push(`dwt <= $${i++}`); values.push(parseInt(maxDwt)); }
  if (por === "false") { conditions.push(`price_on_request = false`); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT id, title, vessel_type, year_built, dwt,
            length_m, beam_m, draft_m, classification,
            price_usd, price_on_request, scraped_at
     FROM ship_listings
     ${where}
     ORDER BY scraped_at DESC, price_usd DESC NULLS LAST
     LIMIT 200`,
    values
  );

  const types = await pool.query(
    `SELECT DISTINCT vessel_type FROM ship_listings
     WHERE vessel_type IS NOT NULL ORDER BY vessel_type`
  );

  return NextResponse.json({ listings: rows, types: types.rows.map(r => r.vessel_type) });
}
