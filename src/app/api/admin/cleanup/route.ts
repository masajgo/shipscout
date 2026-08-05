import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function auth(req: Request) {
  const s = new URL(req.url).searchParams.get("secret");
  return s === process.env.ADMIN_SECRET;
}

function stripMd(t: string | null): string | null {
  if (!t) return t;
  const cleaned = t
    .replace(/^#+\s+.*$/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned || null;
}

// Bad filename patterns for non-ship photos
const BAD_FILENAME = /signature|sign\b|logo|emblem|stamp|portrait|drawing|painting|coat[_-]of[_-]arms|crest|seal\b|symbol|autograph/i;

export async function GET(req: Request) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const action = new URL(req.url).searchParams.get("action") ?? "status";
  const results: Record<string, any> = {};

  // ── Status ────────────────────────────────────────────────────────────────
  if (action === "status") {
    const [events, digests, photos, markdown_it, markdown_es] = await Promise.all([
      pool.query("SELECT count(*), min(event_date)::text, max(event_date)::text FROM radar_events WHERE event_date IS NOT NULL"),
      pool.query("SELECT count(*), min(week_start)::text, max(week_start)::text FROM weekly_digests"),
      pool.query("SELECT count(*) FILTER (WHERE photo_url <> 'none') AS real, count(*) FILTER (WHERE photo_url = 'none') AS sentinel FROM vessel_photos"),
      pool.query("SELECT count(*) FROM weekly_digests WHERE intro_text LIKE '#%' OR intro_text LIKE '%**%'"),
      pool.query("SELECT count(*) FROM radar_events WHERE editorial_summary LIKE '#%' OR editorial_summary LIKE '%**%'"),
    ]);
    return NextResponse.json({
      radar_events: events.rows[0],
      weekly_digests: digests.rows[0],
      vessel_photos: photos.rows[0],
      markdown_in_intro: markdown_it.rows[0].count,
      markdown_in_editorial: markdown_es.rows[0].count,
    });
  }

  // ── Strip markdown from weekly_digests.intro_text ─────────────────────────
  if (action === "fix-markdown") {
    // Fix intro_text in weekly_digests
    const { rows: dirty_it } = await pool.query(
      `SELECT id, intro_text FROM weekly_digests WHERE intro_text IS NOT NULL`
    );
    let fixed_it = 0;
    for (const row of dirty_it) {
      const clean = stripMd(row.intro_text);
      if (clean !== row.intro_text) {
        await pool.query(`UPDATE weekly_digests SET intro_text = $1 WHERE id = $2`, [clean, row.id]);
        fixed_it++;
      }
    }

    // Fix editorial_summary in radar_events
    const { rows: dirty_es } = await pool.query(
      `SELECT id, editorial_summary FROM radar_events WHERE editorial_summary IS NOT NULL`
    );
    let fixed_es = 0;
    for (const row of dirty_es) {
      const clean = stripMd(row.editorial_summary);
      if (clean !== row.editorial_summary) {
        await pool.query(`UPDATE radar_events SET editorial_summary = $1 WHERE id = $2`, [clean, row.id]);
        fixed_es++;
      }
    }

    // Fix summary field too
    const { rows: dirty_sum } = await pool.query(
      `SELECT id, summary FROM radar_events WHERE summary LIKE '#%' OR summary LIKE '%**%'`
    );
    let fixed_sum = 0;
    for (const row of dirty_sum) {
      const clean = stripMd(row.summary);
      if (clean && clean !== row.summary) {
        await pool.query(`UPDATE radar_events SET summary = $1 WHERE id = $2`, [clean, row.id]);
        fixed_sum++;
      }
    }

    results.fixed_intro_text = fixed_it;
    results.fixed_editorial_summary = fixed_es;
    results.fixed_summary = fixed_sum;
    return NextResponse.json(results);
  }

  // ── Remove bad photo matches ───────────────────────────────────────────────
  if (action === "fix-photos") {
    // Remove sentinel rows (photo_url = 'none') from previous scan runs
    // so they can be re-scanned with better validation
    // Actually keep sentinels — just remove clearly bad real photos

    // Find photos with bad filenames (SVG non-ship, signatures, logos)
    const { rows: all_photos } = await pool.query(
      `SELECT id, imo, photo_url FROM vessel_photos WHERE photo_url <> 'none' AND photo_url IS NOT NULL`
    );

    const to_delete: number[] = [];
    for (const p of all_photos) {
      const url = p.photo_url as string;
      const filename = decodeURIComponent(url.split("/").pop() ?? "");
      // SVG files — almost never actual ship photos
      if (filename.toLowerCase().endsWith(".svg")) { to_delete.push(p.id); continue; }
      // Bad keyword in filename
      if (BAD_FILENAME.test(filename)) { to_delete.push(p.id); continue; }
    }

    let deleted = 0;
    for (const id of to_delete) {
      await pool.query(`DELETE FROM vessel_photos WHERE id = $1`, [id]);
      deleted++;
    }

    // Also reset sentinels for IMOs that had bad real photos deleted,
    // so they can be re-scanned
    results.deleted_bad_photos = deleted;
    results.deleted_ids = to_delete;
    return NextResponse.json(results);
  }

  // ── Delete old data (pre-2026) ─────────────────────────────────────────────
  if (action === "delete-old-data") {
    const cutoff = new URL(req.url).searchParams.get("before") ?? "2026-01-01";

    // Count first
    const { rows: ev_count } = await pool.query(
      `SELECT count(*) FROM radar_events WHERE COALESCE(event_date, created_at::date) < $1::date`,
      [cutoff]
    );
    const { rows: dig_count } = await pool.query(
      `SELECT count(*) FROM weekly_digests WHERE week_start < $1::date`,
      [cutoff]
    );

    const confirm = new URL(req.url).searchParams.get("confirm");
    if (confirm !== "yes") {
      return NextResponse.json({
        radar_events_to_delete: ev_count[0].count,
        weekly_digests_to_delete: dig_count[0].count,
        message: "Add &confirm=yes to execute deletion",
        cutoff,
      });
    }

    // Delete digests first (FK dependency)
    const { rowCount: d_deleted } = await pool.query(
      `DELETE FROM weekly_digests WHERE week_start < $1::date`, [cutoff]
    );
    const { rowCount: e_deleted } = await pool.query(
      `DELETE FROM radar_events WHERE COALESCE(event_date, created_at::date) < $1::date`, [cutoff]
    );

    results.deleted_digests = d_deleted;
    results.deleted_events  = e_deleted;
    results.cutoff = cutoff;
    return NextResponse.json(results);
  }

  // ── Run pending DB migrations ──────────────────────────────────────────────
  if (action === "migrate") {
    const migrations = [
      // Article columns for radar_events
      `ALTER TABLE radar_events ADD COLUMN IF NOT EXISTS article_headline TEXT`,
      `ALTER TABLE radar_events ADD COLUMN IF NOT EXISTS article_body TEXT`,
      `CREATE INDEX IF NOT EXISTS radar_events_article_idx ON radar_events(id) WHERE article_headline IS NOT NULL`,
      // Distressed event types
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radar_events' AND column_name='event_type') THEN
           ALTER TABLE radar_events DROP CONSTRAINT IF EXISTS radar_events_event_type_check;
         END IF;
       END $$`,
    ];
    const done: string[] = [];
    for (const sql of migrations) {
      try {
        await pool.query(sql);
        done.push(`OK: ${sql.slice(0, 60)}`);
      } catch (e: any) {
        done.push(`ERR: ${e.message}`);
      }
    }
    return NextResponse.json({ migrations_run: done.length, results: done });
  }

  // ── Publish all digests ────────────────────────────────────────────────────
  if (action === "publish-all") {
    const { rowCount } = await pool.query(`UPDATE weekly_digests SET published=true WHERE published=false`);
    return NextResponse.json({ published: rowCount });
  }

  // ── Delete baseline OFAC sanctions ─────────────────────────────────────────
  if (action === "delete-sanctions") {
    const { rows: cnt } = await pool.query(
      `SELECT count(*)::int AS n FROM radar_events WHERE event_type = 'sanction'`
    );
    // Clear FK references before deleting
    await pool.query(
      `UPDATE weekly_digests SET lead_story_id = NULL
       WHERE lead_story_id IN (
         SELECT id FROM radar_events WHERE event_type = 'sanction'
       )`
    );
    await pool.query(`DELETE FROM radar_events WHERE event_type = 'sanction'`);
    return NextResponse.json({ deleted_sanctions: cnt[0].n });
  }

  return NextResponse.json({ error: "Unknown action. Use: status, fix-markdown, fix-photos, delete-old-data, migrate, publish-all, delete-sanctions" });
}
