"use strict";

/**
 * intelligenceAgent.js — Continuous internet-scanning agent
 *
 * Runs on a schedule (via launchd or node-cron). Each cycle:
 *   1. Maritime news scan  — RSS feeds from 5 sources, match vessel IMO/name
 *   2. Contact re-enrichment — stale vessels (>30d) get Hunter + web scrape refresh
 *   3. Vessel event logging  — saves news hits to vessel_events table
 *   4. Priority queue        — critical/high scrap score vessels processed first
 *
 * Usage:
 *   node scraper/intelligenceAgent.js            # run once then exit
 *   node scraper/intelligenceAgent.js --daemon   # run continuously (6h cycle)
 *   node scraper/intelligenceAgent.js --dry-run  # log only, no DB writes
 */

const path   = require("path");
const fs     = require("fs");
// axios and cheerio are lazy-loaded inside functions to avoid slow parse5/undici startup scan
let _axios, _cheerio, _Pool, _pool;
function getAxios()   { if (!_axios)   _axios   = require("axios");    return _axios; }
function getCheerio() { if (!_cheerio) _cheerio = require("cheerio");  return _cheerio; }

// Load .env.local without the dotenv package (avoids vestauth.com hook in dotenv v17)
try {
  const envPath = path.join(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  }
} catch (_) { /* env vars may already be set by launchd */ }

// Lazy-loaded to avoid blocking startup
let _enrichWithDb;
function getEnrichWithDb() {
  if (!_enrichWithDb) _enrichWithDb = require("./contactEnrichment").enrichWithDb;
  return _enrichWithDb;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CYCLE_HOURS          = 6;     // hours between full cycles in daemon mode
const NEWS_BATCH           = 3000;  // how many high-scrap vessels to news-match
const ENRICH_BATCH         = 30;    // max re-enrichments per cycle
const ENRICH_STALE_DAYS    = 30;    // re-enrich if not touched in this many days
const REQUEST_DELAY_MS     = 2000;  // polite pause between HTTP requests

const LOG_DIR  = path.join(process.env.HOME, "Library/Logs/shipscout");
const LOG_FILE = path.join(LOG_DIR, "intelligence_agent.log");

const isDryRun = process.argv.includes("--dry-run");
const isDaemon = process.argv.includes("--daemon");

const ENRICH_OPTS = () => process.env.HUNTER_API_KEY
  ? { hunterApiKey: process.env.HUNTER_API_KEY }
  : {};

function getPool() {
  if (!_pool) {
    const { Pool } = require("pg");
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let logStream;
try {
  logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
} catch (_) { /* log to console only if file fails */ }

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  process.stdout.write(line + "\n");
  if (logStream) logStream.write(line + "\n");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── DB bootstrap ────────────────────────────────────────────────────────────

async function ensureSchema() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS vessel_events (
      id          BIGSERIAL PRIMARY KEY,
      imo         BIGINT NOT NULL,
      event_type  TEXT NOT NULL,   -- 'news_mention' | 'contact_updated' | 'status_change'
      source      TEXT,
      title       TEXT,
      url         TEXT,
      summary     TEXT,
      raw_data    JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS vessel_events_imo_idx ON vessel_events(imo)
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS vessel_events_created_idx ON vessel_events(created_at DESC)
  `);
}

// ─── News sources ─────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: "https://splash247.com/feed/",              source: "Splash247"   },
  { url: "https://www.hellenicshippingnews.com/feed/",source: "HellenicSN" },
  { url: "https://www.maritime-executive.com/rss",   source: "MarExec"     },
  { url: "https://lloydslist.maritimeintelligence.informa.com/rss", source: "LloydsLL" },
  { url: "https://www.seatrade-maritime.com/rss.xml",source: "Seatrade"    },
];

async function fetchFeed(feed) {
  try {
    const { data } = await getAxios().get(feed.url, {
      headers: { "User-Agent": "ShipScout-Intelligence/1.0" },
      timeout: 12000,
    });
    const $ = getCheerio().load(data, { xmlMode: true });
    const items = [];
    $("item").each((_, el) => {
      const title   = $(el).find("title").text().trim();
      const link    = $(el).find("link").text().trim() || $(el).find("guid").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      const desc    = $(el).find("description").text().trim().slice(0, 400);
      if (title) items.push({ title, link, pubDate, desc, source: feed.source });
    });
    return items;
  } catch (err) {
    log(`[News] ${feed.source} RSS error: ${err.message}`);
    return [];
  }
}

async function fetchAllNews() {
  const results = [];
  for (const feed of RSS_FEEDS) {
    const items = await fetchFeed(feed);
    results.push(...items);
    await sleep(500);
  }
  log(`[News] Fetched ${results.length} articles from ${RSS_FEEDS.length} sources`);
  return results;
}

// ─── Vessel name/IMO matching ─────────────────────────────────────────────────

function articlesMatchVessel(articles, vessel) {
  const imoStr  = String(vessel.imo);
  const nameLow = (vessel.name || "").toLowerCase().trim();
  // Skip generic/short names that cause too many false positives
  if (!nameLow || nameLow.length < 5) return [];

  // Word-boundary regex: " anke " matches vessel "ANKE" but not "tanker"
  const nameRe = new RegExp(`\\b${nameLow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");

  return articles.filter(a => {
    const hay = a.title + " " + a.desc;
    return nameRe.test(hay) || hay.includes(imoStr);
  });
}

// ─── News scan phase ─────────────────────────────────────────────────────────

async function runNewsScan(articles) {
  log("[Phase 1] News scan starting...");

  // Load high-scrap vessels (batch limit for performance)
  const { rows: vessels } = await getPool().query(`
    SELECT imo, name, scrap_score
    FROM vessels
    WHERE scrap_score IS NOT NULL
    ORDER BY scrap_score DESC NULLS LAST
    LIMIT $1
  `, [NEWS_BATCH]);

  log(`[News] Matching ${articles.length} articles against ${vessels.length} vessels`);

  let hits = 0;

  for (const vessel of vessels) {
    const matches = articlesMatchVessel(articles, vessel);
    if (!matches.length) continue;

    for (const article of matches) {
      // Avoid duplicate events: check if same URL already stored
      const { rows: existing } = await getPool().query(
        `SELECT 1 FROM vessel_events WHERE imo = $1 AND url = $2 LIMIT 1`,
        [vessel.imo, article.link]
      );
      if (existing.length) continue;

      hits++;
      log(`[News] HIT: ${vessel.name} (${vessel.imo}) — "${article.title}" [${article.source}]`);

      if (!isDryRun) {
        await getPool().query(`
          INSERT INTO vessel_events (imo, event_type, source, title, url, summary, raw_data)
          VALUES ($1, 'news_mention', $2, $3, $4, $5, $6)
        `, [
          vessel.imo,
          article.source,
          article.title.slice(0, 500),
          article.link.slice(0, 1000),
          article.desc.slice(0, 800),
          JSON.stringify({ pubDate: article.pubDate }),
        ]);
      }
    }
  }

  log(`[Phase 1] Done — ${hits} new news events stored`);
  return hits;
}

// ─── Contact re-enrichment phase ─────────────────────────────────────────────

async function runContactRefresh() {
  log("[Phase 2] Contact re-enrichment starting...");

  // Vessels with: owner record exists, has website, not enriched recently OR never
  const { rows: stale } = await getPool().query(`
    SELECT v.imo, v.name, v.scrap_score, v.scrap_category,
           o.manager_name, o.owner_name, o.website, o.web_fetched_at
    FROM vessels v
    JOIN owners o ON o.imo = v.imo
    WHERE o.website IS NOT NULL
      AND o.website != ''
      AND (
        o.web_fetched_at IS NULL
        OR o.web_fetched_at < NOW() - INTERVAL '${ENRICH_STALE_DAYS} days'
      )
    ORDER BY v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [ENRICH_BATCH]);

  log(`[Enrich] ${stale.length} vessels need contact refresh`);

  let updated = 0;

  for (const vessel of stale) {
    const company = vessel.manager_name || vessel.owner_name;
    if (!company) continue;

    log(`[Enrich] ${vessel.name} (${vessel.imo}) — company: ${company}`);

    if (isDryRun) {
      log(`[Enrich] DRY-RUN: would enrich ${company}`);
      continue;
    }

    try {
      const result = await getEnrichWithDb()(company, vessel.imo, getPool(), null, ENRICH_OPTS());
      if (result?.emails?.length || result?.contacts?.length) {
        updated++;
        log(`[Enrich] ✓ ${company}: ${result.emails?.length ?? 0} emails, ${result.contacts?.length ?? 0} contacts`);

        await getPool().query(`
          INSERT INTO vessel_events (imo, event_type, source, title, summary)
          VALUES ($1, 'contact_updated', 'intelligenceAgent',
                  $2, $3)
        `, [
          vessel.imo,
          `Contacts refreshed: ${company}`,
          `emails:${result.emails?.length ?? 0} contacts:${result.contacts?.length ?? 0}`,
        ]);
      } else {
        log(`[Enrich] ○ ${company}: no new data`);
      }
    } catch (err) {
      log(`[Enrich] ✗ ${company}: ${err.message}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  log(`[Phase 2] Done — ${updated}/${stale.length} contacts updated`);
  return updated;
}

// ─── Vessel status change detection ──────────────────────────────────────────

async function runStatusChangeDetection() {
  log("[Phase 3] Status change detection starting...");

  // Look for vessels with speed > 2 heading toward scrap yard regions
  // Aliaga (Turkey): lat 38.84, lon 26.97 | Alang (India): lat 21.41, lon 72.18
  // Gadani (Pakistan): lat 25.12, lon 66.73 | Chittagong (Bangladesh): lat 22.33, lon 91.82
  const SCRAP_ZONES = [
    { name: "Aliaga",     lat: 38.84, lon: 26.97, radius_deg: 2.5 },
    { name: "Alang",      lat: 21.41, lon: 72.18, radius_deg: 2.5 },
    { name: "Gadani",     lat: 25.12, lon: 66.73, radius_deg: 2.5 },
    { name: "Chittagong", lat: 22.33, lon: 91.82, radius_deg: 2.5 },
  ];

  let detections = 0;

  for (const zone of SCRAP_ZONES) {
    const { rows } = await getPool().query(`
      SELECT v.imo, v.name, v.scrap_score, v.lat, v.lon, v.speed, v.nav_status, v.destination
      FROM vessels v
      WHERE v.lat IS NOT NULL AND v.lon IS NOT NULL
        AND v.scrap_score >= 50
        AND ABS(v.lat - $1) < $3
        AND ABS(v.lon - $2) < $3
    `, [zone.lat, zone.lon, zone.radius_deg]);

    for (const v of rows) {
      // Only log if we haven't logged this vessel+zone recently (within 7d)
      const { rows: recent } = await getPool().query(`
        SELECT 1 FROM vessel_events
        WHERE imo = $1
          AND event_type = 'status_change'
          AND summary ILIKE $2
          AND created_at > NOW() - INTERVAL '7 days'
        LIMIT 1
      `, [v.imo, `%${zone.name}%`]);

      if (recent.length) continue;

      detections++;
      const msg = `Near ${zone.name} scrap yard | scrap_score:${v.scrap_score} | speed:${v.speed ?? '?'} | dest:${v.destination ?? '?'}`;
      log(`[Status] 🚨 ${v.name} (${v.imo}) — ${msg}`);

      if (!isDryRun) {
        await getPool().query(`
          INSERT INTO vessel_events (imo, event_type, source, title, summary, raw_data)
          VALUES ($1, 'status_change', 'ais_position', $2, $3, $4)
        `, [
          v.imo,
          `Vessel near ${zone.name} scrap yard`,
          msg,
          JSON.stringify({ lat: v.lat, lon: v.lon, speed: v.speed, nav_status: v.nav_status }),
        ]);
      }
    }

    if (rows.length) log(`[Status] ${zone.name}: ${rows.length} high-risk vessels in zone`);
  }

  log(`[Phase 3] Done — ${detections} new proximity alerts`);
  return detections;
}

// ─── Stats summary ────────────────────────────────────────────────────────────

async function logStats() {
  const { rows } = await getPool().query(`
    SELECT event_type, COUNT(*) as cnt
    FROM vessel_events
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY event_type
    ORDER BY cnt DESC
  `);
  const summary = rows.map(r => `${r.event_type}:${r.cnt}`).join(" | ");
  log(`[Stats] Last 24h events — ${summary || "none"}`);

  const { rows: total } = await getPool().query(`SELECT COUNT(*) FROM vessel_events`);
  log(`[Stats] Total vessel_events in DB: ${total[0].count}`);
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runCycle() {
  const start = Date.now();
  log(`${"─".repeat(60)}`);
  log(`[Agent] Intelligence cycle starting`);

  try {
    await ensureSchema();

    // Fetch news once, reuse across phases
    const articles = await fetchAllNews();

    const newsHits    = await runNewsScan(articles);
    await sleep(1000);
    const enriched    = await runContactRefresh();
    await sleep(1000);
    const proximities = await runStatusChangeDetection();

    await logStats();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[Agent] Cycle complete in ${elapsed}s — news:${newsHits} enriched:${enriched} alerts:${proximities}`);
  } catch (err) {
    log(`[Agent] FATAL: ${err.message}\n${err.stack}`);
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  log("[Agent] Starting intelligence agent");

  if (isDaemon) {
    log(`[Agent] Daemon mode — cycle every ${CYCLE_HOURS}h`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await runCycle();
      log(`[Agent] Sleeping ${CYCLE_HOURS}h until next cycle...`);
      await sleep(CYCLE_HOURS * 60 * 60 * 1000);
    }
  } else {
    await runCycle();
    await getPool().end();
    log("[Agent] Done, exiting.");
  }
}

main().catch(err => {
  console.error("[Agent] Uncaught error:", err);
  process.exit(1);
});
