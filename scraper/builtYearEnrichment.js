"use strict";

/**
 * builtYearEnrichment.js
 *
 * Datalastic'ten built year çeker, dosya cache'i ile saklar.
 * Sadece scrap adaylarını (anchored / moored / idle / risk flag) enriche eder.
 *
 * Exports:
 *   getBuiltYear(imo)         → number | null
 *   enrichCandidates(vessels) → vessels[] (builtYear + tam scrapScore eklendi)
 *   computeScrapScore(v)      → { score, reasons }
 *   scrapCategory(score)      → string
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const DATALASTIC_KEY = process.env.DATALASTIC_API_KEY;
const DATALASTIC_URL = "https://api.datalastic.com/api/v0";

const DATA_DIR   = path.join(__dirname, "data");
const CACHE_FILE = path.join(DATA_DIR, "vessel_age_cache.json");

// ─── Risk flags ───────────────────────────────────────────────────────────────

const RISK_FLAGS = new Set(["KM","TG","PW","KH","BZ","SL","MN","TZ","VU","CK"]);

// ─── File cache ───────────────────────────────────────────────────────────────
// { "9038828": { builtYear: 1992, cachedAt: "2026-01-01T00:00:00.000Z" } }

let _cache = null;

function loadCache() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    _cache = {};
  }
  return _cache;
}

function saveCache() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(_cache, null, 2));
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "ShipScout/1.0" } }, (res) => {
      let body = "";
      res.on("data", c => { body += c; if (body.length > 200_000) res.destroy(); });
      res.on("end",  () => resolve({ status: res.statusCode, body }));
      res.on("error",() => resolve({ status: 0, body: "" }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.setTimeout(10_000, () => { req.destroy(); resolve({ status: 0, body: "" }); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── getBuiltYear ─────────────────────────────────────────────────────────────

async function getBuiltYear(imo) {
  if (!imo) return null;

  // No key — fail fast, do NOT cache (key may be added later)
  if (!DATALASTIC_KEY) return null;

  const cache = loadCache();
  const key   = String(imo);

  // Cache hit (only trust entries that have an explicit builtYear or were
  // fetched successfully — skip entries written when key was absent)
  if (cache[key] !== undefined && cache[key].source === "datalastic") {
    return cache[key].builtYear ?? null;
  }

  try {
    const url = `${DATALASTIC_URL}/vessel_info?imo=${imo}&api-key=${DATALASTIC_KEY}`;
    const res = await httpsGet(url);

    if (res.status === 429) {
      log(`Datalastic rate limit hit (IMO ${imo}) — backing off`);
      await sleep(5_000);
      return null; // do not cache — retry next cycle
    }
    if (res.status === 401 || res.status === 403) {
      log(`Datalastic auth error ${res.status} — check DATALASTIC_API_KEY`);
      return null;
    }
    if (res.status === 404) {
      // IMO genuinely unknown to Datalastic — cache to avoid repeat calls
      cache[key] = { builtYear: null, source: "datalastic", cachedAt: new Date().toISOString() };
      saveCache();
      return null;
    }
    if (res.status !== 200) {
      log(`Datalastic unexpected status ${res.status} for IMO ${imo}`);
      return null; // transient — do not cache
    }

    const json      = JSON.parse(res.body);
    const yearRaw   = json?.data?.year_built;
    const builtYear = yearRaw ? parseInt(yearRaw) : null;

    cache[key] = { builtYear, source: "datalastic", cachedAt: new Date().toISOString() };
    saveCache();
    return builtYear;
  } catch (err) {
    log(`Datalastic fetch error for IMO ${imo}: ${err.message}`);
    return null; // network error — do not cache
  }
}

function log(msg) {
  process.stdout.write(`[builtYearEnrichment] ${msg}\n`);
}

// ─── computeScrapScore ────────────────────────────────────────────────────────

function computeScrapScore(v) {
  let score = 0;
  const reasons = [];

  // Age (0-40) — dominant signal
  const age = v.builtYear ? (new Date().getFullYear() - v.builtYear) : null;
  if (age != null) {
    if      (age >= 50) { score += 40; reasons.push(`age ${age}y`); }
    else if (age >= 40) { score += 35; reasons.push(`age ${age}y`); }
    else if (age >= 30) { score += 28; reasons.push(`age ${age}y`); }
    else if (age >= 25) { score += 20; reasons.push(`age ${age}y`); }
    else if (age >= 20) { score += 12; reasons.push(`age ${age}y`); }
  }

  // Nav status (0-15)
  const ns = parseInt(v.navStatus) || 0;
  if (ns === 1 || ns === 5) {
    score += 15;
    reasons.push(ns === 1 ? "anchored" : "moored");
  }

  // Risk flag (0-12)
  if (v.flag && RISK_FLAGS.has(v.flag)) {
    score += 12;
    reasons.push(`risk flag (${v.flag})`);
  }

  // Idle (0-5)
  const speed = parseFloat(v.speed) || 0;
  if (speed === 0) {
    score += 5;
    reasons.push("stationary");
  }

  return { score: Math.min(100, score), reasons };
}

// ─── scrapCategory ────────────────────────────────────────────────────────────

function scrapCategory(score) {
  if (score > 35) return "critical";
  if (score >= 25) return "high";
  if (score >= 15) return "medium";
  return "low";
}

// ─── enrichCandidates ────────────────────────────────────────────────────────

async function enrichCandidates(vessels) {
  const candidates = vessels.filter(v => {
    const ns    = parseInt(v.navStatus) || 0;
    const speed = parseFloat(v.speed)   || 0;
    return (
      ns === 1 ||
      ns === 5 ||
      speed === 0 ||
      (v.flag && RISK_FLAGS.has(v.flag))
    );
  });

  const stats = { total: candidates.length, noImo: 0, cacheHit: 0, apiOk: 0, apiNull: 0, skipped: 0 };

  for (const v of candidates) {
    if (!v.imo) { stats.noImo++; continue; }

    const cache   = loadCache();
    const cacheEntry = cache[String(v.imo)];
    const fromCache  = cacheEntry?.source === "datalastic";

    const builtYear = await getBuiltYear(v.imo);

    if (fromCache)       stats.cacheHit++;
    else if (builtYear)  stats.apiOk++;
    else if (!DATALASTIC_KEY) stats.skipped++;
    else                 stats.apiNull++;

    if (builtYear) v.builtYear = builtYear;

    const { score, reasons } = computeScrapScore(v);
    v.scrapScore    = score;
    v.scrapCategory = scrapCategory(score);
    v.scrapReasons  = reasons;

    if (!fromCache) await sleep(250); // rate limit only on live API calls
  }

  log(
    `enrichCandidates: ${stats.total} candidates | ` +
    `no-IMO: ${stats.noImo} | ` +
    `cache-hit: ${stats.cacheHit} | ` +
    `api-ok: ${stats.apiOk} | ` +
    `api-null(404): ${stats.apiNull} | ` +
    `skipped(no-key): ${stats.skipped}`
  );

  return vessels;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { getBuiltYear, enrichCandidates, computeScrapScore, scrapCategory };
