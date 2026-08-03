'use strict';

/**
 * generateWeeklyDigest.js
 *
 * Generates weekly_digests rows from radar_events.
 * Default: processes the previous calendar week (Mon–Sun).
 * With --backfill: processes ALL weeks present in radar_events that don't yet
 *   have a digest row, in chronological order.
 * With --regen: re-processes ALL existing digests to (re-)select lead story
 *   and generate editorial summaries. Safe to re-run.
 *
 * Usage:
 *   node scripts/generateWeeklyDigest.js            # last week
 *   node scripts/generateWeeklyDigest.js --backfill # all missing weeks
 *   node scripts/generateWeeklyDigest.js --regen    # regenerate all lead stories + editorials
 *   node scripts/generateWeeklyDigest.js --dry-run  # print, no DB writes
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const DRY_RUN  = process.argv.includes('--dry-run');
const BACKFILL = process.argv.includes('--backfill');
const REGEN    = process.argv.includes('--regen');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY in .env.local');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HAIKU_MODEL              = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_COST_PER_1K  = 0.00025;
const HAIKU_OUTPUT_COST_PER_1K = 0.00125;

let totalInputTok  = 0;
let totalOutputTok = 0;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getMondayOf(d) {
  const day = d.getUTCDay();
  const diff = (day === 0) ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

function isoWeekNumber(d) {
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil(((thu - yearStart) / 86400000 + 1) / 7);
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildWeekLabel(weekStart, weekEnd) {
  const wn   = isoWeekNumber(weekStart);
  const sDay = weekStart.getUTCDate();
  const sMon = MONTH_ABBR[weekStart.getUTCMonth()];
  const eDay = weekEnd.getUTCDate();
  const eMon = MONTH_ABBR[weekEnd.getUTCMonth()];
  const year = weekEnd.getUTCFullYear();
  const range = sMon === eMon
    ? `${sMon} ${sDay}–${eDay}, ${year}`
    : `${sMon} ${sDay} – ${eMon} ${eDay}, ${year}`;
  return `Week ${wn} · ${range}`;
}

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
// Lead story selection
// Priority: arrest=1, bank_seizure=2, auction=3, sanction=4, detention=5
// Tiebreak: higher deadweight first
// ---------------------------------------------------------------------------

const EVENT_PRIORITY = { arrest: 1, bank_seizure: 2, auction: 3, sanction: 4, detention: 5 };

function selectLeadStory(events) {
  if (!events || events.length === 0) return null;
  const sorted = [...events].sort((a, b) => {
    const pa = EVENT_PRIORITY[a.event_type] ?? 99;
    const pb = EVENT_PRIORITY[b.event_type] ?? 99;
    if (pa !== pb) return pa - pb;
    return (Number(b.deadweight) || 0) - (Number(a.deadweight) || 0);
  });
  return sorted[0];
}

// ---------------------------------------------------------------------------
// Vessel info for lead story
// ---------------------------------------------------------------------------

async function fetchVesselForLead(imo) {
  if (!imo) return null;
  try {
    const { rows } = await pool.query(
      `SELECT name, type, deadweight, built_year, flag, ldt
       FROM vessels WHERE imo = $1::bigint LIMIT 1`,
      [imo]
    );
    return rows[0] ?? null;
  } catch { return null; }
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

  return callHaiku(prompt, 256);
}

// ---------------------------------------------------------------------------
// Claude Haiku — generate lead story editorial summary
// ---------------------------------------------------------------------------

async function generateLeadSummary(event, vessel) {
  const specs = [
    vessel?.type        ?? null,
    vessel?.deadweight  ? `${Number(vessel.deadweight).toLocaleString()} DWT` : null,
    vessel?.built_year  ? `built ${vessel.built_year}` : null,
    vessel?.flag        ?? null,
  ].filter(Boolean).join(', ');

  const context = [
    `Event type: ${event.event_type.replace(/_/g, ' ')}`,
    `Vessel: ${event.vessel_name || 'Unknown'}${event.imo ? ` (IMO ${event.imo})` : ''}`,
    specs ? `Vessel specs: ${specs}` : null,
    event.location  ? `Location: ${event.location}`   : null,
    event.event_date ? `Date: ${event.event_date}`     : null,
    `Source: ${event.source_name}`,
    `Background: ${event.summary}`,
  ].filter(Boolean).join('\n');

  const prompt = [
    `Write a 3–4 sentence editorial summary for a lead story in a maritime intelligence magazine.`,
    ``,
    `Event details:`,
    context,
    ``,
    `Rules:`,
    `- Write entirely in your own words. Never copy the source text verbatim.`,
    `- Calm, factual, professional tone — like a quality trade magazine, not a news wire.`,
    `- Name the vessel, describe what happened, where, and why it matters commercially.`,
    `- If vessel specs are provided, weave one or two into the narrative naturally.`,
    `- No bullet points, no headings, no markdown. One paragraph only.`,
    `- No speculation beyond what the data confirms.`,
    `- Return only the paragraph text.`,
  ].join('\n');

  return callHaiku(prompt, 320);
}

// ---------------------------------------------------------------------------
// Shared Haiku caller
// ---------------------------------------------------------------------------

async function callHaiku(prompt, maxTokens) {
  const body = {
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
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

async function getExistingWeeks() {
  const { rows } = await pool.query(
    `SELECT to_char(week_start, 'YYYY-MM-DD') AS ws FROM weekly_digests`
  );
  return new Set(rows.map(r => r.ws));
}

async function getAllExistingDigests() {
  const { rows } = await pool.query(`
    SELECT week_start::text, week_end::text, id
    FROM weekly_digests
    ORDER BY week_start ASC
  `);
  return rows;
}

async function getMissingWeeks(existingSet) {
  const { rows } = await pool.query(`
    SELECT DISTINCT
      date_trunc('week', COALESCE(event_date, created_at::date))::date AS week_mon
    FROM radar_events
    ORDER BY week_mon ASC
  `);
  return rows
    .map(r => {
      const raw = r.week_mon;
      const str = (raw instanceof Date)
        ? raw.toISOString().slice(0, 10)
        : String(raw).slice(0, 10);
      return new Date(str + 'T00:00:00Z');
    })
    .filter(d => !isNaN(d.getTime()) && !existingSet.has(toDateStr(d)));
}

async function fetchEventsForWeek(weekStart, weekEnd) {
  const { rows } = await pool.query(`
    SELECT
      re.id, re.imo, re.vessel_name, re.event_type, re.event_date,
      re.location, re.source_name, re.summary, re.matched_vessel_id,
      v.mmsi::text  AS vessel_mmsi,
      v.flag        AS vessel_flag,
      v.type        AS vessel_type,
      v.deadweight,
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

async function insertDigest({ weekStart, weekEnd, weekLabel, introText, eventCount, leadStoryId }) {
  await pool.query(`
    INSERT INTO weekly_digests
      (week_start, week_end, week_label, intro_text, event_count, lead_story_id, published)
    VALUES ($1, $2, $3, $4, $5, $6, false)
    ON CONFLICT (week_start) DO UPDATE
      SET lead_story_id = EXCLUDED.lead_story_id,
          intro_text    = COALESCE(EXCLUDED.intro_text, weekly_digests.intro_text)
  `, [toDateStr(weekStart), toDateStr(weekEnd), weekLabel, introText, eventCount, leadStoryId || null]);
}

async function updateLeadStory(weekStart, leadStoryId) {
  await pool.query(
    `UPDATE weekly_digests SET lead_story_id = $1 WHERE week_start = $2::date`,
    [leadStoryId, weekStart]
  );
}

async function saveEditorialSummary(eventId, summary) {
  await pool.query(
    `UPDATE radar_events SET editorial_summary = $1 WHERE id = $2`,
    [summary, eventId]
  );
}

// ---------------------------------------------------------------------------
// Process one week
// ---------------------------------------------------------------------------

async function processWeek(weekStart, isRegen = false) {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const weekLabel = buildWeekLabel(weekStart, weekEnd);
  console.log(`\n  Processing ${weekLabel} (${toDateStr(weekStart)} – ${toDateStr(weekEnd)}) ...`);

  const events = await fetchEventsForWeek(weekStart, weekEnd);
  if (events.length === 0) {
    console.log(`    -> No events — skipping`);
    return null;
  }

  console.log(`    -> ${events.length} event(s) found`);

  // ── Lead story ──────────────────────────────────────────────────────────
  const lead   = selectLeadStory(events);
  let leadId   = lead?.id ?? null;
  let editorial = null;

  if (lead) {
    console.log(`    -> Lead: ${lead.vessel_name || lead.imo || '?'} (${lead.event_type})`);
    const vessel = await fetchVesselForLead(lead.imo);
    try {
      editorial = await generateLeadSummary(lead, vessel);
      console.log(`    -> Lead editorial generated (${editorial.length} chars)`);
      if (!DRY_RUN) {
        await saveEditorialSummary(lead.id, editorial);
      }
    } catch (err) {
      console.error(`    [WARN] Lead editorial failed: ${err.message}`);
    }
  }

  // ── For regen mode: just update lead + editorial, skip intro re-generation ──
  if (isRegen) {
    if (!DRY_RUN && leadId) {
      await updateLeadStory(weekStart, leadId);
    } else {
      console.log(`    [DRY] Would set lead_story_id=${leadId}`);
    }
    return { weekLabel, eventCount: events.length };
  }

  // ── Groups + intro (new digest only) ───────────────────────────────────
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
  }

  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Would insert digest: ${weekLabel}, ${events.length} events, lead=${leadId}`);
    if (introText)  console.log(`    Intro: ${introText}`);
    if (editorial)  console.log(`    Lead editorial: ${editorial}`);
    return { weekLabel, eventCount: events.length };
  }

  await insertDigest({ weekStart, weekEnd, weekLabel, introText, eventCount: events.length, leadStoryId: leadId });
  console.log(`    [INSERT] Digest created — published=false`);
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
  if (REGEN)    console.log('*** REGEN MODE — regenerating lead stories for all existing digests ***');

  let weeksToDo = [];

  if (REGEN) {
    const existing = await getAllExistingDigests();
    console.log(`\n  Existing digests: ${existing.length}`);
    weeksToDo = existing.map(r => ({
      weekStart: new Date(
        (r.week_start instanceof Date
          ? r.week_start.toISOString().slice(0, 10)
          : String(r.week_start).slice(0, 10)) + 'T00:00:00Z'
      ),
      isRegen: true,
    }));
  } else {
    const existingWeeks = await getExistingWeeks();
    console.log(`\n  Existing digests: ${existingWeeks.size}`);

    if (BACKFILL) {
      const missing = await getMissingWeeks(existingWeeks);
      console.log(`  Missing weeks with events: ${missing.length}`);
      weeksToDo = missing.map(ws => ({ weekStart: ws, isRegen: false }));
    } else {
      const now = new Date();
      now.setUTCDate(now.getUTCDate() - 7);
      const prevMon = getMondayOf(now);
      const ws = toDateStr(prevMon);
      if (existingWeeks.has(ws)) {
        console.log(`\n  Digest for ${ws} already exists — nothing to do.`);
      } else {
        weeksToDo = [{ weekStart: prevMon, isRegen: false }];
      }
    }
  }

  let inserted = 0;
  let skipped  = 0;

  for (const { weekStart, isRegen } of weeksToDo) {
    try {
      const result = await processWeek(weekStart, isRegen);
      if (result) inserted++;
      else        skipped++;
    } catch (err) {
      console.error(`  [ERROR] Failed for week ${toDateStr(weekStart)}: ${err.message}`);
      skipped++;
    }
  }

  const elapsed   = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost = (totalInputTok / 1000)  * HAIKU_INPUT_COST_PER_1K
                  + (totalOutputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;

  console.log('\n=== Complete ===');
  console.log(`  Processed : ${inserted}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Haiku tok : ${totalInputTok} in / ${totalOutputTok} out`);
  console.log(`  Haiku cost: $${totalCost.toFixed(5)}`);
  console.log(`  Elapsed   : ${elapsed}s`);
  if (DRY_RUN) console.log('  (DRY-RUN — nothing written to DB)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end().finally(() => process.exit(1));
});
