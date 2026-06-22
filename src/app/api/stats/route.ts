import pool from "@/lib/db";
import { NextResponse } from "next/server";

export const revalidate = 3600; // revalidate every hour

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE TRUE) AS total_vessels,
        COUNT(*) FILTER (WHERE scrap_category = 'critical') AS critical,
        COUNT(*) FILTER (WHERE scrap_category = 'high') AS high_risk,
        COUNT(*) FILTER (WHERE imo IS NOT NULL) AS with_imo
      FROM vessels
    `);
    const owners = await pool.query(`SELECT COUNT(*) AS total FROM owners`);

    return NextResponse.json({
      totalVessels: parseInt(rows[0].total_vessels),
      critical: parseInt(rows[0].critical),
      highRisk: parseInt(rows[0].high_risk),
      withImo: parseInt(rows[0].with_imo),
      ownersFound: parseInt(owners.rows[0].total),
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } });
  } catch (err: any) {
    console.error("[/api/stats]", err);
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
}
