'use strict';

/**
 * newsRadarScan.js
 *
 * Maritime intelligence radar — pulls RSS feeds + OFAC SDN XML, classifies
 * headlines with Claude Haiku, deduplicates, and inserts into radar_events.
 *
 * Usage:
 *   node scripts/newsRadarScan.js           # live run
 *   node scripts/newsRadarScan.js --dry-run # print only, no DB writes
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY in .env.local');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_COST_PER_1K  = 0.00025;
const HAIKU_OUTPUT_COST_PER_1K = 0.00125;

const RSS_SOURCES = [
  { name: 'gCaptain',            url: 'https://gcaptain.com/feed/' },
  { name: 'Splash247',           url: 'https://splash247.com/feed/' },
  { name: 'Maritime Executive',  url: 'https://maritime-executive.com/feed' },
];

const OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';

const BATCH_SIZE = 10;
const DEDUP_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

let totalInserted  = 0;
let totalSkipped   = 0;
let totalInputTok  = 0;
let totalOutputTok = 0;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Strips HTML/CDATA tags from RSS text fields.
 */
function stripTags(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

/**
 * Extracts all values for a given XML tag from raw XML text.
 * Returns an array of strings.
 */
function extractXmlValues(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

/**
 * Extracts the first value for a given XML tag within a block of text.
 */
function extractFirst(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? stripTags(m[1].trim()) : null;
}

// ---------------------------------------------------------------------------
// RSS parsing (regex-based, no external XML parser)
// ---------------------------------------------------------------------------

/**
 * Fetches an RSS feed and returns an array of { title, description, source }.
 */
async function fetchRSSFeed(source) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'ShipScout-RadarBot/1.0' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.url}`);
  const xml = await res.text();

  // Split into <item> blocks
  const itemBlocks = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    itemBlocks.push(m[1]);
  }

  return itemBlocks.map(block => ({
    title:       stripTags(extractFirst(block, 'title') || ''),
    description: stripTags(extractFirst(block, 'description') || ''),
    source:      source.name,
  })).filter(item => item.title.length > 0);
}

/**
 * Fetches all configured RSS sources, returns flat array of items.
 * Individual source failures are caught and logged.
 */
async function fetchRSSEvents() {
  const allItems = [];

  for (const source of RSS_SOURCES) {
    try {
      console.log(`  Fetching RSS: ${source.name} ...`);
      const items = await fetchRSSFeed(source);
      console.log(`    -> ${items.length} items`);
      allItems.push(...items);
    } catch (err) {
      console.error(`  [ERROR] RSS fetch failed for ${source.name}: ${err.message}`);
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Claude Haiku classification
// ---------------------------------------------------------------------------

/**
 * Sends one batch of up to BATCH_SIZE headlines to Claude Haiku for classification.
 * Returns parsed JSON array of classification objects.
 */
async function classifyBatch(items) {
  const inputLines = items.map((item, i) =>
    `[${i}] HEADLINE: ${item.title}\nSUMMARY: ${item.description.slice(0, 300)}`
  ).join('\n\n');

  const userMessage = `Classify each of the following ${items.length} maritime news items.\n\n${inputLines}`;

  const body = {
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: [
      'You are a maritime intelligence classifier.',
      'For each news headline+summary, determine if it describes a maritime event involving a SPECIFIC vessel.',
      'Relevant event types: arrest, detention, auction, bank_seizure, sanction, scrap_sale.',
      'Return a JSON array with exactly one object per input item (same order, same count).',
      'Each object must have:',
      '  index (number, 0-based),',
      '  relevant (boolean),',
      '  event_type ("arrest"|"detention"|"auction"|"bank_seizure"|"sanction"|"scrap_sale"|null),',
      '  vessel_name (string|null),',
      '  imo (string|null — 7-digit IMO number if mentioned),',
      '  location (string|null),',
      '  event_date (string|null — ISO date YYYY-MM-DD if mentioned),',
      '  summary (string — 1-2 sentences in your own words describing the event; empty string if not relevant).',
      'If the item does not describe a specific vessel event, set relevant=false and all other fields to null/empty.',
      'Return ONLY the JSON array. No prose, no markdown fences.',
    ].join(' '),
    messages: [{ role: 'user', content: userMessage }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const inputTok  = data.usage?.input_tokens  || 0;
  const outputTok = data.usage?.output_tokens || 0;
  totalInputTok  += inputTok;
  totalOutputTok += outputTok;

  const batchInputCost  = (inputTok  / 1000) * HAIKU_INPUT_COST_PER_1K;
  const batchOutputCost = (outputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;
  console.log(
    `    Haiku batch: ${inputTok} in / ${outputTok} out tokens` +
    ` | cost $${(batchInputCost + batchOutputCost).toFixed(5)}`
  );

  const rawText = data.content?.[0]?.text || '[]';

  // Robustly strip any accidental markdown fences
  const jsonText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error(`  [WARN] Failed to parse Haiku JSON response: ${e.message}`);
    console.error('  Raw response:', rawText.slice(0, 500));
    parsed = [];
  }

  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Classifies all RSS items in batches of BATCH_SIZE.
 * Returns flat array of relevant classification results (with source injected).
 */
async function classifyRSSItems(rssItems) {
  const relevant = [];

  for (let i = 0; i < rssItems.length; i += BATCH_SIZE) {
    const batch = rssItems.slice(i, i + BATCH_SIZE);
    console.log(`  Classifying batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items) ...`);

    let results;
    try {
      results = await classifyBatch(batch);
    } catch (err) {
      console.error(`  [ERROR] Haiku classification failed for batch: ${err.message}`);
      continue;
    }

    for (const result of results) {
      if (!result.relevant) continue;
      const sourceItem = batch[result.index];
      if (!sourceItem) continue;

      relevant.push({
        imo:          result.imo         || null,
        vessel_name:  result.vessel_name || null,
        event_type:   result.event_type  || null,
        event_date:   result.event_date  || null,
        location:     result.location    || null,
        source_name:  sourceItem.source,
        summary:      result.summary     || '',
        raw_headline: sourceItem.title,
      });
    }
  }

  return relevant;
}

// ---------------------------------------------------------------------------
// Paris MOU + Tokyo MOU (stubs — no official public API available)
// ---------------------------------------------------------------------------

async function fetchParisDetentions() {
  // TODO: Paris MOU — use official data feed when available.
  // The Paris MOU website does not expose a public API or machine-readable feed.
  // When an official XML/JSON feed is published, parse and insert detention events here.
  return [];
}

async function fetchTokyoDetentions() {
  // TODO: Tokyo MOU — official detention feed.
  // Same situation as Paris MOU — no public API at this time.
  return [];
}

// ---------------------------------------------------------------------------
// OFAC SDN XML
// ---------------------------------------------------------------------------

/**
 * Downloads the OFAC SDN XML (~15 MB) and extracts all Vessel entries that
 * have an IMO number. Returns array of { vessel_name, imo, programs }.
 */
async function fetchOFACSanctions() {
  console.log('  Fetching OFAC SDN XML (this may take a moment) ...');

  let xml;
  try {
    const res = await fetch(OFAC_SDN_URL, {
      headers: { 'User-Agent': 'ShipScout-RadarBot/1.0' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.error(`  [ERROR] OFAC SDN fetch failed: ${err.message}`);
    return [];
  }

  console.log(`    Downloaded ${(xml.length / 1024 / 1024).toFixed(1)} MB`);

  // Split into <sdnEntry> blocks
  const entries = [];
  const entryRe = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    entries.push(m[1]);
  }

  console.log(`    Total SDN entries: ${entries.length}`);

  const vesselEntries = [];

  for (const entry of entries) {
    // Only process Vessel type
    const sdnType = extractFirst(entry, 'sdnType');
    if (!sdnType || sdnType.toLowerCase() !== 'vessel') continue;

    // Vessel name is in <lastName>
    const vesselName = extractFirst(entry, 'lastName');
    if (!vesselName) continue;

    // Extract IMO from <idList>
    let imo = null;
    const idListMatch = entry.match(/<idList>([\s\S]*?)<\/idList>/i);
    if (idListMatch) {
      const idBlocks = [];
      const idRe = /<id>([\s\S]*?)<\/id>/gi;
      let idM;
      while ((idM = idRe.exec(idListMatch[1])) !== null) {
        idBlocks.push(idM[1]);
      }
      for (const idBlock of idBlocks) {
        const idType   = extractFirst(idBlock, 'idType');
        const idNumber = extractFirst(idBlock, 'idNumber');
        if (idType && idType.toUpperCase().includes('IMO') && idNumber) {
          imo = idNumber.replace(/\D/g, ''); // digits only
          break;
        }
      }
    }

    // Only include entries with an IMO number
    if (!imo) continue;

    // Extract sanction programs
    const programs = extractXmlValues(entry, 'program');

    vesselEntries.push({
      vessel_name: stripTags(vesselName),
      imo,
      programs,
    });
  }

  console.log(`    Vessel SDN entries with IMO: ${vesselEntries.length}`);
  return vesselEntries;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a radar_event for this IMO + event_type already exists
 * within the deduplication window.
 */
async function isDuplicate(imo, vesselName, eventType) {
  // Match on IMO if available, else on vessel name (case-insensitive)
  let query, params;
  if (imo) {
    query = `
      SELECT 1 FROM radar_events
      WHERE imo = $1
        AND event_type = $2
        AND created_at > now() - interval '${DEDUP_WINDOW_DAYS} days'
      LIMIT 1
    `;
    params = [imo, eventType];
  } else if (vesselName) {
    query = `
      SELECT 1 FROM radar_events
      WHERE UPPER(vessel_name) = UPPER($1)
        AND event_type = $2
        AND created_at > now() - interval '${DEDUP_WINDOW_DAYS} days'
      LIMIT 1
    `;
    params = [vesselName, eventType];
  } else {
    return false;
  }

  const { rows } = await pool.query(query, params);
  return rows.length > 0;
}

/**
 * Attempts to find a matching vessel in the vessels table by IMO or name.
 * Returns mmsi (bigint as string) or null.
 */
async function findMatchedVesselId(imo, vesselName) {
  if (!imo && !vesselName) return null;

  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );

  return rows.length > 0 ? rows[0].mmsi : null;
}

/**
 * Inserts a single radar_event row.
 */
async function insertEvent(event) {
  await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.imo             || null,
      event.vessel_name     || null,
      event.event_type,
      event.event_date      || null,
      event.location        || null,
      event.source_name,
      event.summary,
      event.matched_vessel_id || null,
      event.raw_headline    || null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Process a single candidate event (dedup + match + insert/log)
// ---------------------------------------------------------------------------

async function processEvent(event, label) {
  const { imo, vessel_name, event_type } = event;

  if (!event_type) {
    console.log(`    [SKIP] No event_type resolved for "${vessel_name || imo || 'unknown'}"`);
    totalSkipped++;
    return;
  }

  // Duplicate check
  let dup = false;
  try {
    dup = await isDuplicate(imo, vessel_name, event_type);
  } catch (err) {
    console.error(`    [ERROR] Duplicate check failed: ${err.message}`);
  }

  if (dup) {
    console.log(`    [DUP]  ${label} — ${vessel_name || imo} (${event_type})`);
    totalSkipped++;
    return;
  }

  // Vessel match
  let matched_vessel_id = null;
  try {
    matched_vessel_id = await findMatchedVesselId(imo, vessel_name);
  } catch (err) {
    console.error(`    [ERROR] Vessel match failed: ${err.message}`);
  }

  const fullEvent = { ...event, matched_vessel_id };

  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Would insert: ${JSON.stringify(fullEvent, null, 2)}`);
    totalInserted++;
    return;
  }

  try {
    await insertEvent(fullEvent);
    console.log(
      `    [INSERT] ${label} — ${vessel_name || imo} (${event_type})` +
      (matched_vessel_id ? ` matched mmsi=${matched_vessel_id}` : ' unmatched')
    );
    totalInserted++;
  } catch (err) {
    console.error(`    [ERROR] Insert failed: ${err.message}`);
    totalSkipped++;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  console.log(`\n=== ShipScout News Radar Scan — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log('*** DRY-RUN MODE — no DB writes ***\n');

  // ---------- Step 1: RSS -------------------------------------------------
  console.log('\n[1/4] Fetching RSS feeds ...');
  let rssItems = [];
  try {
    rssItems = await fetchRSSEvents();
    console.log(`  Total RSS items: ${rssItems.length}`);
  } catch (err) {
    console.error(`  [ERROR] RSS stage failed: ${err.message}`);
  }

  // ---------- Step 2: Classify with Haiku ---------------------------------
  console.log('\n[2/4] Classifying with Claude Haiku ...');
  let relevantRSS = [];
  if (rssItems.length > 0) {
    try {
      relevantRSS = await classifyRSSItems(rssItems);
      console.log(`  Relevant events from RSS: ${relevantRSS.length}`);
    } catch (err) {
      console.error(`  [ERROR] Classification stage failed: ${err.message}`);
    }
  }

  // ---------- Step 3: Insert RSS events -----------------------------------
  console.log('\n[3/4] Processing RSS events ...');
  for (const event of relevantRSS) {
    try {
      await processEvent(event, 'RSS');
    } catch (err) {
      console.error(`  [ERROR] Processing event failed: ${err.message}`);
    }
  }

  // ---------- Step 4: OFAC SDN --------------------------------------------
  console.log('\n[4/4] Fetching OFAC SDN sanctions ...');
  let ofacVessels = [];
  try {
    ofacVessels = await fetchOFACSanctions();
  } catch (err) {
    console.error(`  [ERROR] OFAC stage failed: ${err.message}`);
  }

  for (const vessel of ofacVessels) {
    const programLabel = vessel.programs.join(', ') || 'UNKNOWN';
    const event = {
      imo:          vessel.imo,
      vessel_name:  vessel.vessel_name,
      event_type:   'sanction',
      event_date:   null,
      location:     null,
      source_name:  'OFAC SDN',
      summary:      `Vessel sanctioned under OFAC program(s): ${programLabel}.`,
      raw_headline: `OFAC SDN: ${vessel.vessel_name} (IMO ${vessel.imo}) — ${programLabel}`,
    };

    try {
      await processEvent(event, 'OFAC');
    } catch (err) {
      console.error(`  [ERROR] OFAC event processing failed: ${err.message}`);
    }
  }

  // ---------- Paris / Tokyo stubs -----------------------------------------
  // These return empty arrays currently; results would be processed the same way.
  await fetchParisDetentions();
  await fetchTokyoDetentions();

  // ---------- Final summary -----------------------------------------------
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost  =
    (totalInputTok  / 1000) * HAIKU_INPUT_COST_PER_1K +
    (totalOutputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;

  console.log('\n=== Scan complete ===');
  console.log(`  Events inserted : ${totalInserted}`);
  console.log(`  Events skipped  : ${totalSkipped} (duplicates / errors)`);
  console.log(`  Haiku tokens    : ${totalInputTok} in / ${totalOutputTok} out`);
  console.log(`  Haiku cost      : $${totalCost.toFixed(5)}`);
  console.log(`  Elapsed         : ${elapsedSec}s`);
  if (DRY_RUN) console.log('  (DRY-RUN — nothing written to DB)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end().finally(() => process.exit(1));
});
