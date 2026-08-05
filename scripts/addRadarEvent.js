'use strict';

/**
 * addRadarEvent.js — Manual radar event entry tool
 *
 * Modes:
 *   Add event:
 *     node scripts/addRadarEvent.js \
 *       --imo 9000687 \
 *       --vessel-name "MV GEMINI" \
 *       --event-type bank_seizure \
 *       --event-date 2026-06-10 \
 *       --location "Karystos, Greece" \
 *       --source-name "The Maritime Executive" \
 *       --summary "..."
 *
 *   Update status:
 *     node scripts/addRadarEvent.js --update-status --id 1234 --status resolved
 *
 *   List recent events (last N):
 *     node scripts/addRadarEvent.js --list [--limit 20]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAIKU_MODEL       = 'claude-haiku-4-5-20251001';

const VALID_EVENT_TYPES = ['arrest','bank_seizure','auction','judicial_auction','bankruptcy','detention','sanction','scrap_sale','layup'];
const VALID_STATUSES    = ['active','resolved','sold','scrapped'];

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

// ── Haiku summary refinement ──────────────────────────────────────────────────

async function refineSummary(ev) {
  if (!ANTHROPIC_API_KEY) { console.warn('[WARN] No ANTHROPIC_API_KEY — using raw summary'); return ev.summary; }

  const prompt = [
    `Write a 2–3 sentence factual summary for a maritime intelligence report.`,
    `Event type: ${ev.event_type?.replace(/_/g, ' ')}`,
    ev.vessel_name ? `Vessel: ${ev.vessel_name}` : '',
    ev.imo         ? `IMO: ${ev.imo}` : '',
    ev.location    ? `Location: ${ev.location}` : '',
    ev.event_date  ? `Date: ${ev.event_date}` : '',
    ev.source_name ? `Source: ${ev.source_name}` : '',
    `Raw info: ${ev.summary}`,
    ``,
    `Rules: own words only, professional tone, no markdown, no speculation. One paragraph only. Return only the paragraph.`,
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text ?? ev.summary).trim();
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function findMatchedVesselId(imo, vesselName) {
  if (!imo && !vesselName) return null;
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text   IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );
  return rows.length > 0 ? rows[0].mmsi : null;
}

async function isDuplicate(imo, eventType, eventDate) {
  if (!imo) return false;
  const { rows } = await pool.query(
    `SELECT id FROM radar_events
     WHERE imo = $1 AND event_type = $2
       AND (
         ($3::date IS NOT NULL AND event_date BETWEEN ($3::date - interval '7 days') AND ($3::date + interval '7 days'))
         OR ($3::date IS NULL AND created_at > now() - interval '7 days')
       )
     LIMIT 1`,
    [imo, eventType, eventDate || null]
  );
  if (rows.length > 0) { return rows[0].id; }
  return false;
}

async function insertEvent(ev) {
  const { rows } = await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      ev.imo              || null,
      ev.vessel_name      || null,
      ev.event_type,
      ev.event_date       || null,
      ev.location         || null,
      ev.source_name      || null,
      ev.summary,
      ev.matched_vessel_id || null,
      ev.raw_headline     || null,
      ev.status           || 'active',
    ]
  );
  return rows[0].id;
}

async function updateStatus(id, status) {
  const { rowCount } = await pool.query(
    `UPDATE radar_events SET status=$1 WHERE id=$2`,
    [status, id]
  );
  return rowCount;
}

async function listRecent(limit) {
  const { rows } = await pool.query(
    `SELECT id, imo, vessel_name, event_type, event_date::text, location, status, created_at::text
     FROM radar_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

// ── Modes ─────────────────────────────────────────────────────────────────────

async function modeUpdateStatus(args) {
  const id     = args.id     ? parseInt(args.id, 10)   : null;
  const status = args.status ? String(args.status)      : null;

  if (!id || isNaN(id))             { console.error('[ERR] --id <number> required'); process.exit(1); }
  if (!VALID_STATUSES.includes(status)) {
    console.error(`[ERR] --status must be one of: ${VALID_STATUSES.join(', ')}`);
    process.exit(1);
  }

  const n = await updateStatus(id, status);
  if (n === 0) { console.error(`[ERR] No event found with id=${id}`); process.exit(1); }
  console.log(`[OK] Event ${id} status → ${status}`);
}

async function modeList(args) {
  const limit = parseInt(args.limit || '20', 10);
  const rows  = await listRecent(limit);
  if (rows.length === 0) { console.log('No events found.'); return; }
  console.log(`\nRecent ${rows.length} events:\n`);
  for (const r of rows) {
    console.log(`  id=${r.id}  ${r.event_type.padEnd(18)} ${(r.vessel_name || '—').padEnd(24)} IMO=${r.imo || '?'}  date=${r.event_date || '—'}  status=${r.status}  loc=${r.location || '—'}`);
  }
}

async function modeAdd(args) {
  const ev = {
    imo:        args.imo        ? String(args.imo)        : null,
    vessel_name: args['vessel-name'] ? String(args['vessel-name']) : null,
    event_type: args['event-type']  ? String(args['event-type'])  : null,
    event_date: args['event-date']  ? String(args['event-date'])  : null,
    location:   args.location   ? String(args.location)   : null,
    source_name: args['source-name'] ? String(args['source-name']) : null,
    summary:    args.summary    ? String(args.summary)    : null,
    status:     args.status     ? String(args.status)     : 'active',
    raw_headline: null,
  };

  // Validate
  if (!ev.event_type) { console.error('[ERR] --event-type required'); process.exit(1); }
  if (!VALID_EVENT_TYPES.includes(ev.event_type)) {
    console.error(`[ERR] --event-type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    process.exit(1);
  }
  if (!ev.summary)    { console.error('[ERR] --summary required'); process.exit(1); }
  if (!ev.vessel_name && !ev.imo) {
    console.error('[ERR] At least one of --imo or --vessel-name is required');
    process.exit(1);
  }
  if (ev.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(ev.event_date)) {
    console.error('[ERR] --event-date must be YYYY-MM-DD');
    process.exit(1);
  }

  // Build raw headline
  ev.raw_headline = [
    ev.event_type.replace(/_/g, ' '),
    ev.vessel_name ? `— ${ev.vessel_name}` : '',
    ev.imo         ? `(IMO ${ev.imo})`     : '',
    ev.location    ? `— ${ev.location}`    : '',
    ev.event_date  ? `— ${ev.event_date}`  : '',
  ].filter(Boolean).join(' ');

  // Deduplicate
  const dupId = await isDuplicate(ev.imo, ev.event_type, ev.event_date);
  if (dupId) {
    console.error(`[SKIP] Duplicate detected — existing event id=${dupId}`);
    process.exit(0);
  }

  // Match vessel
  ev.matched_vessel_id = await findMatchedVesselId(ev.imo, ev.vessel_name);
  if (ev.matched_vessel_id) {
    console.log(`[INFO] Matched vessel MMSI=${ev.matched_vessel_id}`);
  } else {
    console.log('[INFO] No vessel match in vessels table — inserting without MMSI link');
  }

  // Optionally refine summary with Haiku
  const refine = !args['no-ai'];
  if (refine && ANTHROPIC_API_KEY) {
    console.log('[AI] Refining summary with Haiku…');
    try {
      ev.summary = await refineSummary(ev);
      console.log(`[AI] Summary: ${ev.summary.slice(0, 120)}…`);
    } catch (e) {
      console.warn(`[WARN] Haiku failed: ${e.message} — using raw summary`);
    }
  }

  const id = await insertEvent(ev);
  console.log(`\n[OK] Inserted radar_events.id=${id}`);
  console.log(`     ${ev.event_type} · ${ev.vessel_name || '—'} · IMO ${ev.imo || '?'} · ${ev.event_date || '?'} · ${ev.location || '?'}`);
  console.log(`\n     To regen the week digest:`);
  if (ev.event_date) {
    const d    = new Date(ev.event_date + 'T00:00:00Z');
    const day  = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon  = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    const ws = mon.toISOString().slice(0, 10);
    console.log(`     Week start: ${ws}`);
    console.log(`     curl "https://shipscout.io/api/admin/run-digest?secret=SECRET&mode=regen"`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['update-status']) {
    await modeUpdateStatus(args);
  } else if (args.list) {
    await modeList(args);
  } else {
    await modeAdd(args);
  }
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('[FATAL]', err.message);
    pool.end().finally(() => process.exit(1));
  });
