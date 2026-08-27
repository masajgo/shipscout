import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { imo: string } }
) {
  const imo = parseInt(params.imo);
  if (isNaN(imo)) return NextResponse.json({ error: "Invalid IMO" }, { status: 400 });

  try {
    // Ensure table exists (graceful if agent hasn't run yet)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vessel_events (
        id          BIGSERIAL PRIMARY KEY,
        imo         BIGINT NOT NULL,
        event_type  TEXT NOT NULL,
        source      TEXT,
        title       TEXT,
        url         TEXT,
        summary     TEXT,
        raw_data    JSONB,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query(
      `SELECT id, event_type, source, title, url, summary, created_at
       FROM vessel_events
       WHERE imo = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [imo]
    );

    return NextResponse.json({ events: rows });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
