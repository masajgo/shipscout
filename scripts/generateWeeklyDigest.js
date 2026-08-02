'use strict';

/**
 * generateWeeklyDigest.js
 *
 * Generates weekly_digests rows from radar_events.
 * Default: processes the previous calendar week (Mon–Sun).
 * With --backfill: processes ALL weeks present in radar_events that don't yet
 *   have a digest row, in chronological order.
 *
 * Usage:
 *   node scripts/generateWeeklyDigest.js            # last week
 *   node scripts/generateWeeklyDigest.js --backfill # all missing weeks
 *   node scripts/generateWeeklyDigest.js --dry-run  # print, no DB writes
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const DRY_RUN  = process.argv.includes('--dry-run');
const BACKFILL = process.argv.includes('--backfill');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY in .env.local');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HAIKU_MODEL            = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_COST_PER_1K  = 0.00025;
const HAIKU_OUTPUT_COST_PER_1K = 0.00125;

let totalInputTok  = 0;
let totalOutputTok = 0;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Returns the Monday (week start) for any given Date. */
function getMondayOf(d) {
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = (day === 0) ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

/** ISO week number (1–53). */
function isoWeekNumber(d) {
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** "Week 32 · Aug 3–9, 2026" */
function buildWeekLabel(weekStart, weekEnd) {
  const wn    = isoWeekNumber(weekStart);
  const sDay  = weekStart.getUTCDate();
  const sMon  = MONTH_ABBR[weekStart.getUTCMonth()];
  const eDay  = weekEnd.getUTCDate();
  const eMon  = MONTH_ABBR[weekEnd.getUTCMonth()];
  const year  = weekEnd.getUTCFullYear();
  const range = sMon === eMon
    ? `${sMon} ${sDay}–${eDay}, ${year}`
    : `${sMon} ${sDay} – ${eMon} ${eDay}, ${year}`;
  return `Week ${wn} · ${range}`;
}

/** YYYY-MM-DD string from a Date (UTC). */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'arrest_seizure', label: 'Arrests & Seizures',  types: ['arrest', 'bank_seizure'] },
  { key: 'auction',        label: 'Judicial Auctions',   types: ['auction'] },
  { key: 'detention',      label: 'PSC Detentions',      types: ['detention'] },
  { key: 'sanction',       label: 'Sanctions',           types: ['sanction'] },
  { key: 'scrap_sale',     label: 'Scrap Candidates',    types: ['scrap_sale'] },
];

function groupByCategory(events) {
  const groups = {};
  for (const cat of CATEGORIES) {
    const items = events.filter(e => cat.types.includes(e.event_type));
    if (items.length > 0) groups[cat.key] = { label: cat.label, events: items };
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Claude Haiku — generate intro paragraph
// ---------------------------------------------------------------------------

async function generateIntro(weekLabel, groups) {
  const summaryLines = [];
  for (const cat of CATEGORIES) {
    const g = groups[cat.key];
    if (!g) continue;
    const names = g.events
      .filter(e => e.vessel_name)
      .map(e => e.vessel_name)
      .slice(0, 3)
      .join(', ');
    summaryLines.push(`${cat.label}: ${g.events.length} event(s)${names ? ` (${names})` : ''}`);
  }

  const prompt = [
    `Write a 2–3 sentence editorial introduction for a maritime intelligence weekly digest titled "${weekLabel}".`,
    `This week's events:`,
    ...summaryLines,
    ``,
    `Rules:`,
    `- Write in your own words. Do NOT copy any headline text.`,
    `- Factual, professional, neutral tone. No hype.`,
    `- Mention the dominant themes this week (e.g. arrests, sanctions).`,
    `- Do NOT use bullet points, headings, or markdown.`,
    `- Return only the paragraph text. No quotes around it.`,
  ].join('\n');

  const body = {
    model: HAIKU_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  totalInputTok  += data.usage?.input_tokens  || 0;
  totalOutputTok += data.usage?.output_tokens || 0;

  return (data.content?.[0]?.text || '').trim();
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

/** Returns all week-start dates already in weekly_digests. */
async function getExistingWeeks() {
  const { rows } = await pool.query(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS ws FROM weekly_digests`
  );
  return new Set(rows.map(r => r.ws));
}

/**
 * Returns the distinct ISO weeks (as Mon dates) that have radar_events
 * but no digest yet.
 */
async function getMissingWeeks(existingSet) {
  const { rows } = await pool.query(`
    SELECT DISTINCT
      date_trunc('week', COALESCE(event_date, created_at::date))::date AS week_mon
    FROM radar_events
    ORDER BY week_mon ASC
  `);
  return rows
    .map(r => {
      // pg may return DATE as a JS Date or as a 'YYYY-MM-DD' string
      const raw = r.week_mon;
      const str = (raw instanceof Date)
        ? raw.toISOString().slice(0, 10)
        : String(raw).slice(0, 10);
      return new Date(str + 'T00:00:00Z');
    })
    .filter(d => !isNaN(d.getTime()) && !existingSet.has(toDateStr(d)));
}

/** Fetch events for a given week window (Mon 00:00 → Sun 23:59:59 UTC). */
async function fetchEventsForWeek(weekStart, weekEnd) {
  const { rows } = await pool.query(`
    SELECT
      re.id, re.imo, re.vessel_name, re.event_type, re.event_date,
      re.location, re.source_name, re.summary, re.matched_vessel_id,
      v.mmsi::text     AS vessel_mmsi,
      v.flag           AS vessel_flag,
      v.type           AS vessel_type,
      o.owner_name,
      o.manager_name,
      CASE WHEN o.emails IS NOT NULL AND array_length(o.emails, 1) > 0
           THEN true ELSE false END AS has_contact
    FROM radar_events re
    LEFT JOIN vessels v ON v.mmsi = re.matched_vessel_id
    LEFT JOIN owners  o ON o.imo  = v.imo
    WHERE COALESCE(re.event_date, re.created_at::date)
          BETWEEN $1 AND $2
    ORDER BY re.event_date ASC NULLS LAST, re.created_at ASC
  `, [toDateStr(weekStart), toDateStr(weekEnd)]);
  return rows;
}

/** Insert a weekly_digest row (or skip if already exists). */
async function insertDigest({ weekStart, weekEnd, weekLabel, introText, eventCount }) {
  await pool.query(`
    INSERT INTO weekly_digests
      (week_start, week_end, week_label, intro_text, event_count, published)
    VALUES ($1, $2, $3, $4, $5, false)
    ON CONFLICT (week_start) DO NOTHING
  `, [toDateStr(weekStart), toDateStr(weekEnd), weekLabel, introText, eventCount]);
}

// ---------------------------------------------------------------------------
// Process one week
// ---------------------------------------------------------------------------

async function processWeek(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6); // Sunday

  const weekLabel = buildWeekLabel(weekStart, weekEnd);
  console.log(`\n  Processing ${weekLabel} (${toDateStr(weekStart)} – ${toDateStr(weekEnd)}) ...`);

  const events = await fetchEventsForWeek(weekStart, weekEnd);
  if (events.length === 0) {
    console.log(`    -> No events — skipping (no empty digests)`);
    return null;
  }

  console.log(`    -> ${events.length} event(s) found`);
  const groups = groupByCategory(events);
  const catSummary = Object.entries(groups)
    .map(([, g]) => `${g.label}: ${g.events.length}`)
    .join(', ');
  console.log(`    -> Categories: ${catSummary}`);

  let introText = null;
  try {
    introText = await generateIntro(weekLabel, groups);
    console.log(`    -> Intro generated (${introText.length} chars)`);
  } catch (err) {
    console.error(`    [WARN] Intro generation failed: ${err.message}`);
    introText = null;
  }

  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Would insert digest: ${weekLabel}, ${events.length} events`);
    if (introText) console.log(`    Intro: ${introText}`);
    return { weekLabel, eventCount: events.length };
  }

  await insertDigest({ weekStart, weekEnd, weekLabel, introText, eventCount: events.length });
  console.log(`    [INSERT] Digest created — published=false (pending admin review)`);
  return { weekLabel, eventCount: events.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  console.log(`\n=== ShipScout Weekly Digest Generator — ${new Date().toISOString()} ===`);
  if (DRY_RUN)  console.log('*** DRY-RUN MODE — no DB writes ***');
  if (BACKFILL) console.log('*** BACKFILL MODE — processing all missing weeks ***');

  const existingWeeks = await getExistingWeeks();
  console.log(`\n  Existing digests: ${existingWeeks.size}`);

  let weeksToDo = [];

  if (BACKFILL) {
    weeksToDo = await getMissingWeeks(existingWeeks);
    console.log(`  Missing weeks with events: ${weeksToDo.length}`);
  } else {
    // Default: previous Monday–Sunday
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 7);
    const prevMon = getMondayOf(now);
    const ws      = toDateStr(prevMon);
    if (existingWeeks.has(ws)) {
      console.log(`\n  Digest for ${ws} already exists — nothing to do.`);
    } else {
      weeksToDo = [prevMon];
    }
  }

  let inserted = 0;
  let skipped  = 0;

  for (const weekStart of weeksToDo) {
    try {
      const result = await processWeek(weekStart);
      if (result) inserted++;
      else        skipped++;
    } catch (err) {
      console.error(`  [ERROR] Failed for week ${toDateStr(weekStart)}: ${err.message}`);
      skipped++;
    }
  }

  const elapsed  = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost = (totalInputTok / 1000) * HAIKU_INPUT_COST_PER_1K
                  + (totalOutputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;

  console.log('\n=== Complete ===');
  console.log(`  Digests created : ${inserted}`);
  console.log(`  Weeks skipped   : ${skipped} (empty or already exists)`);
  console.log(`  Haiku tokens    : ${totalInputTok} in / ${totalOutputTok} out`);
  console.log(`  Haiku cost      : $${totalCost.toFixed(5)}`);
  console.log(`  Elapsed         : ${elapsed}s`);
  if (DRY_RUN) console.log('  (DRY-RUN — nothing written to DB)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end().finally(() => process.exit(1));
});
