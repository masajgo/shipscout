'use strict';

/**
 * newsRadarScan.js
 *
 * Maritime intelligence radar:
 *   1. RSS feeds (gCaptain, Splash247, MarEx) → Haiku classification
 *   2. OFAC SDN XML (sanctions)
 *   3. Judicial auction pages (UK Admiralty Marshal + Singapore Supreme Court)
 *   4. Layup detection (AIS data: vessels stationary >30 days)
 *   5. Bankruptcy fleet-linking (insolvency news → owner's full fleet)
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

const HAIKU_MODEL              = 'claude-haiku-4-5-20251001';
const HAIKU_INPUT_COST_PER_1K  = 0.00025;
const HAIKU_OUTPUT_COST_PER_1K = 0.00125;

const RSS_SOURCES = [
  { name: 'gCaptain',           url: 'https://gcaptain.com/feed/' },
  { name: 'Splash247',          url: 'https://splash247.com/feed/' },
  { name: 'Maritime Executive', url: 'https://maritime-executive.com/feed' },
];

const OFAC_SDN_URL      = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
const BATCH_SIZE        = 10;
const DEDUP_WINDOW_DAYS = 7;
const LAYUP_DAYS        = 30;   // vessel stationary > this many days = layup candidate
const LAYUP_MAX         = 100;  // max layup events per scan

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

let totalInserted  = 0;
let totalSkipped   = 0;
let totalInputTok  = 0;
let totalOutputTok = 0;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function stripTags(str) {
  if (!str) return '';
  return str
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/, '"')
    .replace(/&#039;/, "'")
    .trim();
}

function extractXmlValues(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function extractFirst(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = block.match(re);
  return m ? stripTags(m[1].trim()) : null;
}

/** Extracts all 7-digit IMO-like numbers (7–9xxxxxxx) from arbitrary text. */
function extractIMOs(text) {
  const matches = text.match(/\b([789]\d{6})\b/g);
  return matches ? [...new Set(matches)] : [];
}

// ---------------------------------------------------------------------------
// RSS parsing
// ---------------------------------------------------------------------------

async function fetchRSSFeed(source) {
  const res = await fetch(source.url, {
    headers: { 'User-Agent': 'ShipScout-RadarBot/1.0' },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${source.url}`);
  const xml = await res.text();

  const itemBlocks = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) itemBlocks.push(m[1]);

  return itemBlocks
    .map(block => ({
      title:       stripTags(extractFirst(block, 'title') || ''),
      description: stripTags(extractFirst(block, 'description') || ''),
      pubDate:     extractFirst(block, 'pubDate') || null,
      source:      source.name,
    }))
    .filter(item => item.title.length > 0);
}

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

async function classifyBatch(items) {
  const inputLines = items.map((item, i) =>
    `[${i}] HEADLINE: ${item.title}\nSUMMARY: ${item.description.slice(0, 300)}`
  ).join('\n\n');

  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 2048,
    system: [
      'You are a maritime intelligence classifier.',
      'For each news headline+summary, determine if it describes a maritime event involving a SPECIFIC vessel or shipowner.',
      '',
      'Event types and how to distinguish them:',
      '  arrest        — vessel seized by port authority or law enforcement (criminal/administrative proceedings, coast guard)',
      '  detention     — PSC (Port State Control) detention for safety or compliance deficiencies; keywords: "detained", "PSC", "port state control", "deficiency"',
      '  bank_seizure  — vessel repossessed or arrested by mortgagee/lender; keywords: "mortgagee", "bank arrest", "foreclosure", "lender repossession", "arrested by lender", "under mortgage"',
      '  judicial_auction — court-ordered sale of vessel; keywords: "marshal sale", "sheriff sale", "admiralty auction", "sold by court order", "judicial sale", "forced sale"',
      '  bankruptcy    — shipowner or operator insolvency; keywords: "Chapter 11", "administration", "insolvency", "liquidation", "receivership", "bankrupt"; extract COMPANY name in company_name field',
      '  sanction      — vessel or owner placed on government sanctions list',
      '  scrap_sale    — vessel sold for demolition / scrapping',
      '',
      'Return a JSON array with exactly one object per input item (same order, same count).',
      'Each object must have:',
      '  index         (number, 0-based)',
      '  relevant      (boolean)',
      '  event_type    ("arrest"|"detention"|"bank_seizure"|"judicial_auction"|"bankruptcy"|"sanction"|"scrap_sale"|null)',
      '  vessel_name   (string|null)',
      '  company_name  (string|null — for bankruptcy: the shipowner/operator company name; null otherwise)',
      '  imo           (string|null — 7-digit IMO number if explicitly mentioned)',
      '  location      (string|null — port/country where event occurred)',
      '  event_date    (string|null — ISO date YYYY-MM-DD if mentioned)',
      '  summary       (string — 1-2 sentences in your OWN words; empty string if not relevant)',
      '',
      'If the item does not describe a specific vessel or shipowner event, set relevant=false.',
      'Return ONLY the JSON array. No prose, no markdown fences.',
    ].join('\n'),
    messages: [{ role: 'user', content:
      `Classify each of the following ${items.length} maritime news items.\n\n${inputLines}`,
    }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data      = await res.json();
  const inputTok  = data.usage?.input_tokens  || 0;
  const outputTok = data.usage?.output_tokens || 0;
  totalInputTok  += inputTok;
  totalOutputTok += outputTok;

  const batchCost = (inputTok / 1000) * HAIKU_INPUT_COST_PER_1K
                  + (outputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;
  console.log(`    Haiku: ${inputTok} in / ${outputTok} out | $${batchCost.toFixed(5)}`);

  const rawText  = data.content?.[0]?.text || '[]';
  const jsonText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error(`  [WARN] Failed to parse Haiku response: ${e.message}`);
    parsed = [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

async function classifyRSSItems(rssItems) {
  const relevant = [];

  for (let i = 0; i < rssItems.length; i += BATCH_SIZE) {
    const batch = rssItems.slice(i, i + BATCH_SIZE);
    console.log(`  Classifying batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} items)...`);

    let results;
    try {
      results = await classifyBatch(batch);
    } catch (err) {
      console.error(`  [ERROR] Haiku batch failed: ${err.message}`);
      continue;
    }

    for (const result of results) {
      if (!result.relevant) continue;
      const src = batch[result.index];
      if (!src) continue;

      relevant.push({
        imo:          result.imo          || null,
        vessel_name:  result.vessel_name  || null,
        company_name: result.company_name || null,
        event_type:   result.event_type   || null,
        event_date:   result.event_date   || null,
        location:     result.location     || null,
        source_name:  src.source,
        summary:      result.summary      || '',
        raw_headline: src.title,
      });
    }
  }

  return relevant;
}

// ---------------------------------------------------------------------------
// Judicial auction scraping (best-effort, static-HTML sources only)
// ---------------------------------------------------------------------------

async function fetchJudicialAuctions() {
  const results = [];

  // ── UK Admiralty Marshal ────────────────────────────────────────────────
  // https://www.admiraltymarshal.com/ships-under-arrest/current-ships-under-arrest
  try {
    console.log('  Trying UK Admiralty Marshal...');
    const res = await fetch(
      'https://www.admiraltymarshal.com/ships-under-arrest/current-ships-under-arrest',
      { headers: { 'User-Agent': 'ShipScout-RadarBot/1.0' }, signal: AbortSignal.timeout(15_000) }
    );
    if (res.ok) {
      const html = await res.text();
      const imos = extractIMOs(html);
      if (imos.length > 0) {
        console.log(`    UK Admiralty Marshal: found ${imos.length} IMO candidates`);
        for (const imo of imos) {
          // Try to find vessel name near the IMO in HTML (within 200 chars)
          const idx = html.indexOf(imo);
          const context = html.slice(Math.max(0, idx - 200), idx + 200);
          const vesselNameMatch = context.match(/<(?:h[123456]|strong|b|td)[^>]*>([A-Z][A-Z0-9 \-]{3,40})<\/(?:h[123456]|strong|b|td)>/i);
          const vesselName = vesselNameMatch ? stripTags(vesselNameMatch[1]) : null;
          results.push({
            imo,
            vessel_name:  vesselName,
            event_type:   'judicial_auction',
            event_date:   null,
            location:     'United Kingdom',
            source_name:  'UK Admiralty Marshal',
            summary:      `Vessel (IMO ${imo}) currently under arrest with the UK Admiralty Marshal, subject to potential judicial sale.`,
            raw_headline: `UK Admiralty Marshal — arrest/sale notice: IMO ${imo}`,
          });
        }
      } else {
        // No IMOs found — try to extract vessel names from table cells/headings
        const nameRe = /<(?:td|th|h[23])[^>]*>\s*([A-Z][A-Z0-9 \-]{4,40})\s*<\/(?:td|th|h[23])>/gi;
        const allNames = [];
        let nm;
        while ((nm = nameRe.exec(html)) !== null) allNames.push(nm[1].trim());
        // Filter plausible ship names (ALL CAPS, 5-30 chars)
        const shipNames = allNames.filter(n => /^[A-Z][A-Z0-9 ]{4,29}$/.test(n));
        console.log(`    UK Admiralty Marshal: no IMOs in HTML — ${shipNames.length} name candidates (without IMO, skipping)`);
      }
    } else {
      console.log(`    UK Admiralty Marshal: HTTP ${res.status} — skipping`);
    }
  } catch (err) {
    console.log(`    UK Admiralty Marshal: ${err.message} — skipping`);
  }

  // ── Singapore Supreme Court ─────────────────────────────────────────────
  // TODO: https://www.supremecourt.gov.sg — admiralty listings are rendered
  // via JavaScript (Sitecore CMS), no accessible static HTML feed at this time.
  // Monitor for a structured data endpoint or file download.

  // ── South Africa Sheriff of the High Court ──────────────────────────────
  // TODO: No central public listing of admiralty sales found. Individual High
  // Court divisions (Cape Town, Durban) publish notices separately and
  // inconsistently. Revisit when a consolidated feed becomes available.

  console.log(`  Judicial auctions found: ${results.length}`);
  return results;
}

// ---------------------------------------------------------------------------
// Paris MOU / Tokyo MOU stubs
// ---------------------------------------------------------------------------

async function fetchParisDetentions() {
  // TODO: Paris MOU — no public API. XLS import available via importParisMOU.js.
  return [];
}

async function fetchTokyoDetentions() {
  // TODO: Tokyo MOU — detention list is JS-rendered; no structured data feed.
  return [];
}

// ---------------------------------------------------------------------------
// OFAC SDN XML
// ---------------------------------------------------------------------------

async function fetchOFACSanctions() {
  console.log('  Fetching OFAC SDN XML...');

  let xml;
  try {
    const res = await fetch(OFAC_SDN_URL, {
      headers: { 'User-Agent': 'ShipScout-RadarBot/1.0' },
      signal:  AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.error(`  [ERROR] OFAC SDN fetch failed: ${err.message}`);
    return [];
  }

  console.log(`    Downloaded ${(xml.length / 1024 / 1024).toFixed(1)} MB`);

  const entries = [];
  const entryRe = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null) entries.push(m[1]);

  console.log(`    Total SDN entries: ${entries.length}`);

  const vesselEntries = [];

  for (const entry of entries) {
    const sdnType = extractFirst(entry, 'sdnType');
    if (!sdnType || sdnType.toLowerCase() !== 'vessel') continue;

    const vesselName = extractFirst(entry, 'lastName');
    if (!vesselName) continue;

    let imo = null;
    const idListMatch = entry.match(/<idList>([\s\S]*?)<\/idList>/i);
    if (idListMatch) {
      const idBlocks = [];
      const idRe = /<id>([\s\S]*?)<\/id>/gi;
      let idM;
      while ((idM = idRe.exec(idListMatch[1])) !== null) idBlocks.push(idM[1]);

      for (const idBlock of idBlocks) {
        const idType   = extractFirst(idBlock, 'idType');
        const idNumber = extractFirst(idBlock, 'idNumber');
        if (idType && idNumber &&
            (idType.toUpperCase().includes('IMO') ||
             idType.toUpperCase().includes('VESSEL REGISTRATION'))) {
          const digits = idNumber.replace(/\D/g, '');
          if (/^[789]\d{6}$/.test(digits)) { imo = digits; break; }
        }
      }
    }

    if (!imo) continue;

    const programs = extractXmlValues(entry, 'program');
    vesselEntries.push({ vessel_name: stripTags(vesselName), imo, programs });
  }

  console.log(`    Vessel SDN entries with IMO: ${vesselEntries.length}`);
  return vesselEntries;
}

// ---------------------------------------------------------------------------
// Layup detection — AIS data from vessels table
// ---------------------------------------------------------------------------

async function fetchLayupVessels() {
  console.log(`  Scanning for vessels stationary > ${LAYUP_DAYS} days...`);
  try {
    const { rows } = await pool.query(`
      SELECT
        mmsi::text            AS mmsi,
        imo::text             AS imo,
        name,
        type,
        deadweight,
        flag,
        destination,
        home_port,
        last_pos_update::date::text AS last_seen
      FROM vessels
      WHERE speed          < 0.5
        AND speed          IS NOT NULL
        AND last_pos_update < now() - interval '${LAYUP_DAYS} days'
        AND last_pos_update > now() - interval '2 years'
        AND imo             IS NOT NULL
        AND imo             > 0
      ORDER BY last_pos_update ASC
      LIMIT ${LAYUP_MAX}
    `);
    console.log(`    Layup candidates: ${rows.length}`);
    return rows;
  } catch (err) {
    console.error(`  [ERROR] Layup query failed: ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Bankruptcy fleet-linking
// ---------------------------------------------------------------------------

async function findFleetForCompany(companyName) {
  if (!companyName) return [];
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT
        v.mmsi::text  AS mmsi,
        v.imo::text   AS imo,
        v.name,
        v.type,
        v.flag
      FROM owners o
      JOIN vessels v ON v.imo = o.imo::bigint
      WHERE o.owner_name   ILIKE $1
         OR o.manager_name ILIKE $1
      LIMIT 30
    `, [`%${companyName}%`]);
    return rows;
  } catch (err) {
    console.error(`  [ERROR] Fleet lookup for "${companyName}": ${err.message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function isDuplicate(imo, vesselName, eventType) {
  let query, params;
  if (imo) {
    query = `
      SELECT 1 FROM radar_events
      WHERE imo = $1 AND event_type = $2
        AND created_at > now() - interval '${DEDUP_WINDOW_DAYS} days'
      LIMIT 1
    `;
    params = [imo, eventType];
  } else if (vesselName) {
    query = `
      SELECT 1 FROM radar_events
      WHERE UPPER(vessel_name) = UPPER($1) AND event_type = $2
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

async function insertEvent(event) {
  await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.imo              || null,
      event.vessel_name      || null,
      event.event_type,
      event.event_date       || null,
      event.location         || null,
      event.source_name,
      event.summary,
      event.matched_vessel_id || null,
      event.raw_headline     || null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Process one event (dedup → match → insert)
// ---------------------------------------------------------------------------

async function processEvent(event, label, knownMmsi = null) {
  const { imo, vessel_name, event_type } = event;

  if (!event_type) {
    totalSkipped++;
    return;
  }

  let dup = false;
  try { dup = await isDuplicate(imo, vessel_name, event_type); } catch {}
  if (dup) {
    console.log(`    [DUP]  ${label} — ${vessel_name || imo} (${event_type})`);
    totalSkipped++;
    return;
  }

  let matched_vessel_id = knownMmsi;
  if (!matched_vessel_id) {
    try { matched_vessel_id = await findMatchedVesselId(imo, vessel_name); } catch {}
  }

  const fullEvent = { ...event, matched_vessel_id };

  if (DRY_RUN) {
    const matchInfo = matched_vessel_id ? ` mmsi=${matched_vessel_id}` : '';
    console.log(`    [DRY] ${label} — ${vessel_name || imo} (${event_type})${matchInfo}`);
    totalInserted++;
    return;
  }

  try {
    await insertEvent(fullEvent);
    const matchInfo = matched_vessel_id ? ` matched=${matched_vessel_id}` : ' unmatched';
    console.log(`    [INSERT] ${label} — ${vessel_name || imo} (${event_type})${matchInfo}`);
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

  // ── Step 1: RSS ──────────────────────────────────────────────────────────
  console.log('\n[1/6] Fetching RSS feeds...');
  let rssItems = [];
  try {
    rssItems = await fetchRSSEvents();
    console.log(`  Total RSS items: ${rssItems.length}`);
  } catch (err) {
    console.error(`  [ERROR] RSS stage: ${err.message}`);
  }

  // ── Step 2: Haiku classification ─────────────────────────────────────────
  console.log('\n[2/6] Classifying with Claude Haiku...');
  let relevantRSS = [];
  if (rssItems.length > 0) {
    try {
      relevantRSS = await classifyRSSItems(rssItems);
      console.log(`  Relevant RSS events: ${relevantRSS.length}`);
    } catch (err) {
      console.error(`  [ERROR] Classification: ${err.message}`);
    }
  }

  // ── Step 3: Insert RSS events ────────────────────────────────────────────
  console.log('\n[3/6] Processing RSS events...');
  const bankruptcyEvents = [];

  for (const event of relevantRSS) {
    // Collect bankruptcy events for fleet-linking pass
    if (event.event_type === 'bankruptcy' && event.company_name) {
      bankruptcyEvents.push(event);
    }
    try {
      await processEvent(event, 'RSS');
    } catch (err) {
      console.error(`  [ERROR] RSS event: ${err.message}`);
    }
  }

  // ── Step 3b: Bankruptcy fleet-linking ────────────────────────────────────
  if (bankruptcyEvents.length > 0) {
    console.log(`\n  Linking ${bankruptcyEvents.length} bankruptcy event(s) to fleet...`);
    for (const bk of bankruptcyEvents) {
      const fleet = await findFleetForCompany(bk.company_name);
      console.log(`    ${bk.company_name}: ${fleet.length} vessels found in DB`);
      for (const vessel of fleet) {
        const fleetEvent = {
          imo:          vessel.imo,
          vessel_name:  vessel.name,
          event_type:   'bankruptcy',
          event_date:   bk.event_date || null,
          location:     bk.location   || null,
          source_name:  bk.source_name,
          summary:      `${vessel.name} is operated by ${bk.company_name}, which has entered insolvency proceedings. The vessel may be available for acquisition or charter as part of fleet restructuring.`,
          raw_headline: bk.raw_headline,
        };
        try {
          await processEvent(fleetEvent, 'BANKRUPTCY-FLEET', vessel.mmsi);
        } catch (err) {
          console.error(`    [ERROR] Fleet link: ${err.message}`);
        }
      }
    }
  }

  // ── Step 4: OFAC SDN ─────────────────────────────────────────────────────
  console.log('\n[4/6] Fetching OFAC SDN sanctions...');
  let ofacVessels = [];
  try {
    ofacVessels = await fetchOFACSanctions();
  } catch (err) {
    console.error(`  [ERROR] OFAC: ${err.message}`);
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
      console.error(`  [ERROR] OFAC event: ${err.message}`);
    }
  }

  // ── Step 5: Judicial auctions ─────────────────────────────────────────────
  console.log('\n[5/6] Fetching judicial auction notices...');
  let auctionEvents = [];
  try {
    auctionEvents = await fetchJudicialAuctions();
  } catch (err) {
    console.error(`  [ERROR] Auction fetch: ${err.message}`);
  }

  for (const event of auctionEvents) {
    try {
      await processEvent(event, 'AUCTION');
    } catch (err) {
      console.error(`  [ERROR] Auction event: ${err.message}`);
    }
  }

  // ── Step 6: Layup detection ───────────────────────────────────────────────
  console.log('\n[6/6] Layup detection from AIS data...');
  let layupVessels = [];
  try {
    layupVessels = await fetchLayupVessels();
  } catch (err) {
    console.error(`  [ERROR] Layup fetch: ${err.message}`);
  }

  for (const v of layupVessels) {
    const location = v.destination && v.destination.trim() ? v.destination : (v.home_port || null);
    const event = {
      imo:          v.imo,
      vessel_name:  v.name,
      event_type:   'layup',
      event_date:   v.last_seen || null,
      location,
      source_name:  'AIS Monitor',
      summary:      `${v.name || 'Vessel'} (IMO ${v.imo}) shows no AIS movement since ${v.last_seen || 'over 30 days ago'}, indicating a potential layup or extended idle period.${v.type ? ` Type: ${v.type}.` : ''}`,
      raw_headline: `AIS: ${v.name} inactive since ${v.last_seen}`,
    };
    try {
      await processEvent(event, 'LAYUP', v.mmsi);
    } catch (err) {
      console.error(`  [ERROR] Layup event: ${err.message}`);
    }
  }

  // Paris/Tokyo stubs (return [])
  await fetchParisDetentions();
  await fetchTokyoDetentions();

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed  = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalCost = (totalInputTok  / 1000) * HAIKU_INPUT_COST_PER_1K
                  + (totalOutputTok / 1000) * HAIKU_OUTPUT_COST_PER_1K;

  console.log('\n=== Scan complete ===');
  console.log(`  Events inserted : ${totalInserted}`);
  console.log(`  Events skipped  : ${totalSkipped}`);
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
