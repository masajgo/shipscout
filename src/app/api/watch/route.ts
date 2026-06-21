import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

/*
  Required Supabase migration (run once in SQL editor):

  CREATE TABLE IF NOT EXISTS watched_vessels (
    imo        TEXT PRIMARY KEY,
    name       TEXT,
    flag       TEXT,
    source     TEXT    DEFAULT 'manual',
    added_at   TIMESTAMPTZ DEFAULT NOW(),
    status     TEXT    DEFAULT 'watching'
  );
*/

export const runtime     = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let vessel: any;
  try {
    vessel = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!vessel?.imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  try {
    const { rows } = await pool.query(
      `INSERT INTO watched_vessels (imo, name, flag, source, added_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'watching')
       ON CONFLICT (imo) DO NOTHING
       RETURNING *`,
      [
        vessel.imo,
        vessel.name   || `Vessel ${vessel.imo}`,
        vessel.flag   || null,
        vessel.source || "manual",
      ],
    );

    if (!rows.length) {
      return NextResponse.json({ status: "already_watching" });
    }
    return NextResponse.json({ status: "watching", vessel: rows[0] });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }
}

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT imo, name, flag, source, added_at, status FROM watched_vessels ORDER BY added_at DESC",
    );
    return NextResponse.json({ vessels: rows });
  } catch {
    return NextResponse.json({ vessels: [] }, { status: 503 });
  }
}
