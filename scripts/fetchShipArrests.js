'use strict';

/**
 * fetchShipArrests.js — Scrape shipunderarrest.com and populate radar_events
 *
 * Usage:
 *   node scripts/fetchShipArrests.js          # scrape & insert new events
 *   node scripts/fetchShipArrests.js --dry-run # parse only, no DB writes
 *   node scripts/fetchShipArrests.js --pages 3 # scrape first N pages (default: 5)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const BASE_URL = 'https://www.shipunderarrest.com';

// ── Arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = arr[i + 1];
    acc[key] = (!next || next.startsWith('--')) ? true : next;
  }
  return acc;
}, {});

const DRY_RUN  = !!args['dry-run'];
const MAX_PAGES = parseInt(args.pages || '5', 10);

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ShipScout/1.0; +https://shipscout.io)',
      'Accept': 'text/html',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── Minimal HTML parser (no dependencies) ────────────────────────────────────

function extractText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
             .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
}

function findAll(html, tagOrPattern) {
  const results = [];
  const re = typeof tagOrPattern === 'string'
    ? new RegExp(`<${tagOrPattern}[^>]*>([\\s\\S]*?)<\\/${tagOrPattern}>`, 'gi')
    : tagOrPattern;
  let m;
  while ((m = re.exec(html)) !== null) results.push(m);
  return results;
}

function attr(tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1].trim() : null;
}

// ── Parse listing page ────────────────────────────────────────────────────────

function parseListingPage(html) {
  const entries = [];

  // shipunderarrest.com lists vessels in table rows or article divs
  // Try to find rows in the main table
  const tableRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tableMatch;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const row = tableMatch[1];
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(row)) !== null) {
      cells.push(extractText(td[1]));
    }
    if (cells.length >= 3) {
      entries.push({ cells, rawRow: row });
    }
  }

  // Also try article/div based layout (newer site designs)
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let artMatch;
  while ((artMatch = articleRe.exec(html)) !== null) {
    const art = artMatch[1];
    const linkMatch = /href="([^"]*\/vessel[^"]*)"/.exec(art);
    const nameMatch = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(art);
    if (linkMatch || nameMatch) {
      entries.push({
        href: linkMatch ? linkMatch[1] : null,
        rawText: extractText(art),
        rawHtml: art,
      });
    }
  }

  // Fallback: find all links that look like vessel detail pages
  const linkRe = /href="(\/[^"]*(?:arrest|vessel|ship)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRe.exec(html)) !== null) {
    const href = linkMatch[1];
    const text = extractText(linkMatch[2]);
    if (text.length > 3 && text.length < 100) {
      entries.push({ href, linkText: text });
    }
  }

  return entries;
}

// ── Parse individual vessel arrest page ──────────────────────────────────────

function parseVesselPage(html, url) {
  const text = extractText(html);

  // Extract IMO number
  const imoMatch = /IMO[:\s#]*(\d{7})/i.exec(text) || /imo[:\s]*(\d{7})/i.exec(html);
  const imo = imoMatch ? imoMatch[1] : null;

  // Extract vessel name — look for title or h1
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(html);
  const h1Match    = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  let vesselName = null;
  if (h1Match)    vesselName = extractText(h1Match[1]);
  else if (titleMatch) vesselName = extractText(titleMatch[1]).replace(/\s*[\-|].*$/, '').trim();

  // Extract location
  const locationPatterns = [
    /Port(?:\s+of)?:\s*([A-Za-z\s,]+)/i,
    /Location:\s*([A-Za-z\s,]+)/i,
    /arrested?\s+(?:in|at)\s+([A-Za-z\s,]+)/i,
    /detained?\s+(?:in|at)\s+([A-Za-z\s,]+)/i,
  ];
  let location = null;
  for (const p of locationPatterns) {
    const m = p.exec(text);
    if (m) { location = m[1].trim().replace(/[.,]+$/, ''); break; }
  }

  // Extract event date
  const datePatterns = [
    /(?:arrested?|seized?|detain|order).*?(\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}\s+\w+\s+\d{4})/,
  ];
  let eventDate = null;
  for (const p of datePatterns) {
    const m = p.exec(text);
    if (m) {
      try {
        const d = new Date(m[1]);
        if (!isNaN(d)) { eventDate = d.toISOString().slice(0, 10); break; }
      } catch {}
    }
  }

  // Determine event type from text
  let eventType = 'arrest';
  if (/bank|creditor|mortgag|lien|financ/i.test(text))           eventType = 'bank_seizure';
  else if (/auction|judicial\s+sale|court\s+sale/i.test(text))   eventType = 'judicial_auction';

  // Extract source clues
  const courtMatch  = /(\w[\w\s]*Court)/i.exec(text);
  const sourceName  = courtMatch ? `shipunderarrest.com / ${courtMatch[1]}` : 'shipunderarrest.com';

  // Build a raw summary from the most informative paragraph
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paras  = [];
  let pm;
  while ((pm = paraRe.exec(html)) !== null) {
    const t = extractText(pm[1]);
    if (t.length > 60) paras.push(t);
  }
  // Pick the paragraph most likely to describe the arrest
  const arrestPara = paras.find(p =>
    /arrest|seiz|detain|court|order|lien/i.test(p)
  ) || paras[0] || text.slice(0, 500);

  return { imo, vesselName, eventType, eventDate, location, sourceName, rawSummary: arrestPara.slice(0, 600), url };
}

// ── Haiku summary refinement ──────────────────────────────────────────────────

async function refineSummary(vessel) {
  if (!ANTHROPIC_API_KEY) return vessel.rawSummary;
  const prompt = [
    `Write a 2-sentence factual summary for a maritime intelligence report about a vessel arrest or seizure.`,
    vessel.vesselName  ? `Vessel: ${vessel.vesselName}` : '',
    vessel.imo         ? `IMO: ${vessel.imo}` : '',
    vessel.location    ? `Location: ${vessel.location}` : '',
    vessel.eventDate   ? `Date: ${vessel.eventDate}` : '',
    vessel.eventType   ? `Event type: ${vessel.eventType.replace(/_/g, ' ')}` : '',
    `Raw info: ${vessel.rawSummary}`,
    ``,
    `Rules: professional tone, factual only, no markdown, no headers, no speculation. Two sentences, one paragraph. Return only the paragraph.`,
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
      max_tokens: 180,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) { console.warn(`[WARN] Haiku ${res.status}`); return vessel.rawSummary; }
  const data = await res.json();
  return (data.content?.[0]?.text ?? vessel.rawSummary).trim();
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function isDuplicate(imo, vesselName, eventType) {
  // Check by IMO first (most reliable)
  if (imo) {
    const { rows } = await pool.query(
      `SELECT id FROM radar_events
       WHERE imo = $1 AND event_type = $2 AND status != 'resolved'
       LIMIT 1`,
      [imo, eventType]
    );
    if (rows.length) return rows[0].id;
  }
  // Fallback: check by vessel name (case-insensitive) within last 90 days
  if (vesselName) {
    const { rows } = await pool.query(
      `SELECT id FROM radar_events
       WHERE UPPER(vessel_name) = UPPER($1) AND event_type = $2
         AND created_at > now() - interval '90 days'
       LIMIT 1`,
      [vesselName, eventType]
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
      ev.imo         || null,
      ev.vesselName  || null,
      ev.eventType,
      ev.eventDate   || null,
      ev.location    || null,
      ev.sourceName,
      ev.summary,
      ev.matchedVesselId || null,
      ev.rawHeadline || null,
    ]
  );
  return rows[0].id;
}

// ── Scrape one page of listings ───────────────────────────────────────────────

async function scrapeListingPage(pageNum) {
  const url = pageNum === 1
    ? `${BASE_URL}/`
    : `${BASE_URL}/page/${pageNum}/`;

  console.log(`[FETCH] ${url}`);
  const html = await fetchPage(url);

  // Extract links to vessel detail pages
  const detailLinks = new Set();
  const hrefRe = /href="(https?:\/\/(?:www\.)?shipunderarrest\.com\/[^"#?]+)"/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1];
    // Skip pagination, category, tag pages
    if (/\/(page|tag|category|author)\//i.test(href)) continue;
    if (/\.(jpg|png|pdf|css|js)$/i.test(href)) continue;
    if (href === BASE_URL + '/') continue;
    detailLinks.add(href);
  }

  // Also try relative links
  const relHrefRe = /href="(\/[^"#?]+)"/gi;
  while ((m = relHrefRe.exec(html)) !== null) {
    const href = m[1];
    if (/\/(page|tag|category|author|feed|wp-)\//i.test(href)) continue;
    if (/\.(jpg|png|pdf|css|js)$/i.test(href)) continue;
    if (href === '/') continue;
    detailLinks.add(BASE_URL + href);
  }

  return [...detailLinks];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[START] fetchShipArrests — pages=${MAX_PAGES}, dry-run=${DRY_RUN}`);

  const allDetailLinks = new Set();

  for (let p = 1; p <= MAX_PAGES; p++) {
    try {
      const links = await scrapeListingPage(p);
      links.forEach(l => allDetailLinks.add(l));
      console.log(`[PAGE ${p}] Found ${links.length} detail links (total unique: ${allDetailLinks.size})`);
      // Polite delay between listing pages
      if (p < MAX_PAGES) await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.warn(`[WARN] Page ${p} failed: ${e.message}`);
      break; // Stop if we hit a 404 (no more pages)
    }
  }

  console.log(`\n[SCRAPE] Processing ${allDetailLinks.size} vessel pages…\n`);

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const url of allDetailLinks) {
    try {
      await new Promise(r => setTimeout(r, 1200)); // polite delay

      const html   = await fetchPage(url);
      const parsed = parseVesselPage(html, url);

      if (!parsed.vesselName && !parsed.imo) {
        console.log(`[SKIP] No vessel name or IMO at ${url}`);
        skipped++;
        continue;
      }

      console.log(`[PARSE] ${parsed.vesselName || '?'} IMO=${parsed.imo || '?'} type=${parsed.eventType} date=${parsed.eventDate || '?'}`);

      if (!DRY_RUN) {
        const dupId = await isDuplicate(parsed.imo, parsed.vesselName, parsed.eventType);
        if (dupId) {
          console.log(`  [SKIP] Duplicate — existing id=${dupId}`);
          skipped++;
          continue;
        }

        const matchedVesselId = await matchVessel(parsed.imo, parsed.vesselName);
        if (matchedVesselId) {
          console.log(`  [MATCH] Matched vessel MMSI=${matchedVesselId}`);
        }

        const summary = await refineSummary(parsed);

        const rawHeadline = [
          parsed.eventType.replace(/_/g, ' '),
          parsed.vesselName ? `— ${parsed.vesselName}` : '',
          parsed.imo        ? `(IMO ${parsed.imo})`    : '',
          parsed.location   ? `@ ${parsed.location}`   : '',
          parsed.eventDate  ? `[${parsed.eventDate}]`  : '',
        ].filter(Boolean).join(' ');

        const id = await insertEvent({
          ...parsed,
          summary,
          rawHeadline,
          matchedVesselId,
        });
        console.log(`  [OK] Inserted id=${id}`);
        inserted++;
      } else {
        console.log(`  [DRY] Would insert: ${parsed.eventType} — ${parsed.vesselName} IMO=${parsed.imo}`);
        inserted++;
      }
    } catch (e) {
      console.warn(`  [ERR] ${url}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n[DONE] inserted=${inserted} skipped=${skipped} errors=${errors}`);
}

main()
  .then(() => pool.end())
  .catch(err => {
    console.error('[FATAL]', err.message);
    pool.end().finally(() => process.exit(1));
  });
