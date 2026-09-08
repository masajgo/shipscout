import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health?secret=<CRON_SECRET>
// Returns aggregated system status for the leader monitoring agent.
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const checks: Record<string, unknown> = {};

  // DB connectivity + basic data integrity
  try {
    const dbStart = Date.now();
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM vessels)::int       AS vessel_count,
         (SELECT COUNT(*) FROM sp_listings
          WHERE status = 'approved')::int          AS active_listings,
         (SELECT COUNT(*) FROM broker_accounts)::int AS broker_count`
    );
    checks.db = {
      ok:              true,
      ms:              Date.now() - dbStart,
      vessel_count:    rows[0].vessel_count,
      active_listings: rows[0].active_listings,
      broker_count:    rows[0].broker_count,
    };
  } catch (err) {
    checks.db = { ok: false, error: String(err) };
  }

  // Local monitor last heartbeat
  try {
    const { rows } = await pool.query(
      `SELECT agent_name, last_run_at, status, message
       FROM agent_health_log
       ORDER BY last_run_at DESC
       LIMIT 10`
    );
    checks.agents = rows;
  } catch {
    // Table may not exist yet — not an error
    checks.agents = [];
  }

  const dbOk = (checks.db as { ok: boolean }).ok;
  return NextResponse.json({
    status:    dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    ms:        Date.now() - start,
    checks,
  }, { status: dbOk ? 200 : 503 });
}

// POST /api/health  — local agents report their status here
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agent_name, status, message } = await req.json();
  if (!agent_name || !status) {
    return NextResponse.json({ error: "agent_name and status required" }, { status: 400 });
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS agent_health_log (
       agent_name TEXT PRIMARY KEY,
       last_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       status TEXT NOT NULL,
       message TEXT
     )`
  );

  await pool.query(
    `INSERT INTO agent_health_log (agent_name, last_run_at, status, message)
     VALUES ($1, now(), $2, $3)
     ON CONFLICT (agent_name) DO UPDATE
       SET last_run_at = now(), status = $2, message = $3`,
    [agent_name, status, message ?? null]
  );

  return NextResponse.json({ ok: true });
}
