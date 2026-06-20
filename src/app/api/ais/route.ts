import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";

// Returns live vessel count from Supabase (used by the nav "Live · X vessels" badge)
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(CASE WHEN scrap_category IN ('critical','high') THEN 1 END)::int AS at_risk
       FROM vessels`
    );
    const { total, at_risk } = rows[0];
    return NextResponse.json(
      { vessels: Array(total).fill(null), total, at_risk, ts: Date.now() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ vessels: [], total: 0, at_risk: 0 }, { status: 503 });
  }
}
