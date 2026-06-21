import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

/*
  Required Supabase migration (run once in SQL editor):

  CREATE TABLE IF NOT EXISTS crm_vessels (
    imo        TEXT PRIMARY KEY,
    name       TEXT,
    score      INTEGER DEFAULT 0,
    stage      TEXT    DEFAULT 'lead',
    added_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
*/

export const runtime     = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { imo, name, score, stage } = body;
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  try {
    const { rows } = await pool.query(
      `INSERT INTO crm_vessels (imo, name, score, stage, added_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (imo) DO UPDATE
         SET name       = EXCLUDED.name,
             score      = EXCLUDED.score,
             stage      = EXCLUDED.stage,
             updated_at = NOW()
       RETURNING *`,
      [imo, name || `IMO ${imo}`, score ?? 0, stage || "lead"],
    );
    return NextResponse.json({ success: true, entry: rows[0] });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }
}

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT imo, name, score, stage, added_at, updated_at FROM crm_vessels ORDER BY updated_at DESC",
    );
    return NextResponse.json({ vessels: rows });
  } catch {
    return NextResponse.json({ vessels: [] }, { status: 503 });
  }
}
