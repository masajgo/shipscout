'use strict';

/**
 * fetchShipArrests.js — Monitor maritime news RSS feeds for vessel arrests/seizures
 * and auto-populate radar_events using Claude Haiku for extraction.
 *
 * Sources:
 *   - Hellenic Shipping News (RSS)
 *   - Splash247 (RSS)
 *   - Google News RSS (targeted arrest/seizure queries)
 *
 * Usage:
 *   node scripts/fetchShipArrests.js             # run normally
 *   node scripts/fetchShipArrests.js --dry-run   # parse only, no DB writes
 *   node scripts/fetchShipArrests.js --verbose   # log full Haiku responses
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE  = process.argv.includes('--verbose');

// ── RSS sources ───────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  {
    name: 'Hellenic Shipping News',
    url:  'https://www.hellenicshippingnews.com/feed/',
  },
  {
    name: 'Splash247',
    url:  'https://splash247.com/feed/',
  },
  {
    name: 'gCaptain',
    url:  'https://gcaptain.com/feed/',
  },
  // Targeted Google News: admiralty/court/creditor arrests only (excludes piracy, military)
  {
    name: 'Google News — admiralty arrest',
    url:  'https://news.google.com/rss/search?q=%22admiralty+arrest%22+ship+OR+vessel&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News — ship arrested court',
    url:  'https://news.google.com/rss/search?q=%22ship+arrested%22+court+OR+creditor+OR+mortgage+OR+bank&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News — judicial ship sale',
    url:  'https://news.google.com/rss/search?q=%22judicial+sale%22+ship+OR+vessel+OR+%22judicial+auction%22+vessel&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Google News — vessel arrested port',
    url:  'https://news.google.com/rss/search?q=%22vessel+arrested%22+port+OR+%22ship+arrested%22+port+OR+mortgagee+vessel&hl=en-US&gl=US&ceid=US:en',
  },
];

// Keywords that must appear in title or description to be considered relevant
const ARREST_KEYWORDS = [
  'arrest', 'seized', 'seizure', 'detained', 'judicial auction',
  'court order', 'bank seizure', 'creditor', 'admiralty', 'impounded',
  'el koyma', 'haciz',  // Turkish equivalents
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function httpGet(url, timeoutMs = 15_000) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ShipScout-ArrestMonitor/1.0; +https://shipscout.io)',
      'Accept': 'text/html,application/xhtml+xml,application/xml,application/rss+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ').trim();
}

function isRelevant(title, description) {
  const haystack = `${title} ${description}`.toLowerCase();
  return ARREST_KEYWORDS.some(kw => haystack.includes(kw));
}

// ── RSS parser ────────────────────────────────────────────────────────────────

function parseRSS(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      const mm = r.exec(block);
      return mm ? mm[1].trim() : '';
    };
    items.push({
      title:       get('title'),
      link:        get('link'),
      description: get('description'),
      pubDate:     get('pubDate'),
    });
  }
  return items;
}

function parsePubDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  } catch { return null; }
}

// ── Claude Haiku extraction ───────────────────────────────────────────────────

async function extractWithHaiku(article) {
  if (!ANTHROPIC_API_KEY) throw new Error('No ANTHROPIC_API_KEY');

  const prompt = `You are a maritime intelligence data extractor. Read the following news article and extract vessel arrest/seizure information.

Article title: ${article.title}
Article URL: ${article.url}
Published: ${article.pubDate || 'unknown'}
Content:
${article.content.slice(0, 3000)}

Extract and return ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "relevant": true/false,
  "vessel_name": "string or null",
  "imo": "string or null",
  "event_type": "arrest|bank_seizure|judicial_auction|detention",
  "event_date": "YYYY-MM-DD or null",
  "location": "string or null",
  "summary": "string",
  "creditor": "string or null"
}

Set relevant: TRUE only when ALL of these apply:
  1. A specific, named commercial vessel is arrested/seized
  2. The arrest is by a COURT, bank, creditor, mortgagee, or port authority for FINANCIAL/LEGAL reasons
  3. There is enough detail to identify the vessel

Set relevant: FALSE for:
  - Military seizures (Iran, Houthis, US Navy, etc.)
  - Piracy or criminal drug/weapons seizures
  - General legal commentary, Q&A articles, legislation
  - No specific vessel name mentioned
  - Geopolitical incidents`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text ?? '').trim();

  if (VERBOSE) console.log(`  [HAIKU] ${text}`);

  // Parse JSON — handle potential markdown wrapping
  const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(jsonStr);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function isDuplicate(imo, vesselName, eventType, eventDate) {
  if (imo) {
    const { rows } = await pool.query(
      `SELECT id FROM radar_events
       WHERE imo = $1 AND event_type = $2 AND (status IS NULL OR status != 'resolved')
       LIMIT 1`,
      [imo, eventType]
    );
    if (rows.length) return rows[0].id;
  }
  if (vesselName) {
    // Same vessel name + same event type within 30 days of the event date
    const { rows } = await pool.query(
      `SELECT id FROM radar_events
       WHERE UPPER(vessel_name) = UPPER($1)
         AND event_type = $2
         AND ($3::date IS NULL OR event_date BETWEEN ($3::date - interval '30 days') AND ($3::date + interval '30 days'))
       LIMIT 1`,
      [vesselName, eventType, eventDate || null]
    );
    if (rows.length) return rows[0].id;
  }
  return false;
}

async function matchVessel(imo, vesselName) {
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );
  return rows.length ? rows[0].mmsi : null;
}

async function insertEvent(ev) {
  const { rows } = await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
     RETURNING id`,
    [
      ev.imo              || null,
      ev.vessel_name      || null,
      ev.event_type,
      ev.event_date       || null,
      ev.location         || null,
      ev.source_name,
      ev.summary,
      ev.matched_vessel_id || null,
      ev.raw_headline     || null,
    ]
  );
  return rows[0].id;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processFeed(feed) {
  console.log(`\n[FEED] ${feed.name}`);
  let xml;
  try {
    xml = await httpGet(feed.url);
  } catch (e) {
    console.warn(`  [ERR] Could not fetch feed: ${e.message}`);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  const items = parseRSS(xml);
  console.log(`  [PARSE] ${items.length} items`);

  let inserted = 0, skipped = 0, errors = 0;

  for (const item of items) {
    const title = extractText(item.title);
    const desc  = extractText(item.description);

    if (!isRelevant(title, desc)) continue;

    console.log(`  [MATCH] "${title.slice(0, 80)}"`);

    // Fetch full article
    let content = desc;
    if (item.link && !item.link.includes('news.google.com')) {
      try {
        await new Promise(r => setTimeout(r, 800));
        const html = await httpGet(item.link, 12_000);
        const full = extractText(html);
        content = full.length > 200 ? full : desc;
      } catch (e) {
        console.warn(`    [WARN] Could not fetch article body: ${e.message}`);
      }
    }

    // Haiku extraction
    let extracted;
    try {
      extracted = await extractWithHaiku({
        title,
        url:     item.link,
        pubDate: item.pubDate,
        content,
      });
    } catch (e) {
      console.warn(`    [ERR] Haiku extraction failed: ${e.message}`);
      errors++;
      continue;
    }

    if (!extracted.relevant) {
      console.log(`    [SKIP] Haiku: not a specific vessel arrest`);
      skipped++;
      continue;
    }

    if (!extracted.vessel_name && !extracted.imo) {
      console.log(`    [SKIP] No vessel name or IMO extracted`);
      skipped++;
      continue;
    }

    console.log(`    [EXTRACT] ${extracted.vessel_name || '?'} IMO=${extracted.imo || '?'} type=${extracted.event_type} loc=${extracted.location || '?'}`);

    if (!DRY_RUN) {
      try {
        const dupId = await isDuplicate(extracted.imo, extracted.vessel_name, extracted.event_type, extracted.event_date);
        if (dupId) {
          console.log(`    [SKIP] Duplicate — existing id=${dupId}`);
          skipped++;
          continue;
        }

        const matchedVesselId = await matchVessel(extracted.imo, extracted.vessel_name);
        if (matchedVesselId) console.log(`    [MATCH] Vessel MMSI=${matchedVesselId}`);

        const sourceLine = feed.name !== 'Google News — ship arrest' && feed.name.startsWith('Google')
          ? `Google News / ${feed.name.replace('Google News — ', '')}`
          : feed.name;

        const id = await insertEvent({
          imo:              extracted.imo,
          vessel_name:      extracted.vessel_name,
          event_type:       extracted.event_type || 'arrest',
          event_date:       extracted.event_date || parsePubDate(item.pubDate),
          location:         extracted.location,
          source_name:      sourceLine,
          summary:          extracted.summary,
          matched_vessel_id: matchedVesselId,
          raw_headline:     `${title} — ${item.link}`,
        });

        console.log(`    [OK] Inserted radar_events.id=${id}`);
        inserted++;
      } catch (e) {
        console.warn(`    [ERR] DB insert failed: ${e.message}`);
        errors++;
      }
    } else {
      console.log(`    [DRY] Would insert: ${extracted.event_type} — ${extracted.vessel_name} IMO=${extracted.imo}`);
      inserted++;
    }

    await new Promise(r => setTimeout(r, 500)); // rate limit Haiku
  }

  return { inserted, skipped, errors };
}

async function main() {
  console.log(`[START] fetchShipArrests — dry-run=${DRY_RUN} sources=${RSS_FEEDS.length}`);

  let totalInserted = 0, totalSkipped = 0, totalErrors = 0;

  for (const feed of RSS_FEEDS) {
    const { inserted, skipped, errors } = await processFeed(feed);
    totalInserted += inserted;
    totalSkipped  += skipped;
    totalErrors   += errors;
    // Brief pause between feeds
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n[DONE] inserted=${totalInserted} skipped=${totalSkipped} errors=${totalErrors}`);
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('[FATAL]', err.message);
    pool.end().finally(() => process.exit(1));
  });
