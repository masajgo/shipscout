import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authorized } from "@/lib/adminAuth";
import { computeScrapScore, scrapCategory } from "../../../../../scraper/scrapScore";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300;

const BATCH = 500;

async function agentStart(name: string) {
  try {
    await pool.query(
      `INSERT INTO agent_status (agent_name, last_started_at, last_status, run_count, updated_at)
       VALUES ($1, NOW(), 'running', 1, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         last_started_at = NOW(), last_status = 'running',
         run_count = agent_status.run_count + 1, updated_at = NOW()`,
      [name]
    );
  } catch { /* non-fatal */ }
}

async function agentFinish(name: string, status: string, rows?: number, error?: string) {
  try {
    await pool.query(
      `UPDATE agent_status SET last_finished_at=NOW(), last_status=$2, last_rows=$3, last_error=$4, updated_at=NOW()
       WHERE agent_name=$1`,
      [name, status, rows ?? null, error ? error.slice(0, 1000) : null]
    );
  } catch { /* non-fatal */ }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorized(req, url)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await agentStart("scrap-scores");

  try {
    const { rows } = await pool.query(`
      SELECT mmsi, built_year, nav_status, speed, flag, scrap_score, scrap_category
      FROM vessels
    `);

    const changed: [string, number, string][] = [];
    for (const r of rows) {
      const { score } = computeScrapScore({
        builtYear: r.built_year, navStatus: r.nav_status,
        speed: r.speed, flag: r.flag,
      });
      const cat = scrapCategory(score);
      if (score !== r.scrap_score || cat !== r.scrap_category) {
        changed.push([r.mmsi, score, cat]);
      }
    }

    let done = 0;
    for (let i = 0; i < changed.length; i += BATCH) {
      const slice = changed.slice(i, i + BATCH);
      await pool.query(
        `UPDATE vessels v
           SET scrap_score = u.score, scrap_category = u.cat
         FROM (SELECT * FROM unnest($1::bigint[], $2::smallint[], $3::text[])
               AS t(mmsi, score, cat)) u
         WHERE v.mmsi = u.mmsi`,
        [slice.map(s => s[0]), slice.map(s => s[1]), slice.map(s => s[2])]
      );
      done += slice.length;
    }

    await agentFinish("scrap-scores", "success", done);
    return NextResponse.json({ ok: true, total: rows.length, updated: done });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await agentFinish("scrap-scores", "error", undefined, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
