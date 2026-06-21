"use strict";

/**
 * builtYearEnrichment.js
 *
 * Datalastic vessel_info'dan TÜM statik alanları çeker, dosya cache'i ile saklar.
 * Sadece scrap adaylarını (anchored / moored / idle / risk flag) enriche eder.
 *
 * Exports:
 *   getVesselInfo(imo)              → cached Datalastic data object | null
 *   enrichCandidates(vessels)       → vessels[] (tüm statik alanlar + scrapScore)
 *   updateStaticsToDB(pool, vessels)→ Promise — vessels tablosuna statik alanları yazar
 *   computeScrapScore(v)            → { score, reasons }
 *   scrapCategory(score)            → string
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

const DATALASTIC_KEY  = process.env.DATALASTIC_API_KEY;
const DATALASTIC_URL  = "https://api.datalastic.com/api/v0";
// Piyasa fiyatı: USD/LDT (Hindistan/Bangladeş güncel; env ile override edilebilir)
const SCRAP_PRICE_LDT = parseInt(process.env.SCRAP_PRICE_PER_LDT || "450");

const DATA_DIR   = path.join(__dirname, "data");
const CACHE_FILE = path.join(DATA_DIR, "vessel_age_cache.json");

// ─── Risk flags ───────────────────────────────────────────────────────────────

const RISK_FLAGS = new Set(["KM","TG","PW","KH","BZ","SL","MN","TZ","VU","CK"]);

// ─── LDT/DWT katsayıları (tip bazlı tahmini — gerçek LDT için Class survey gerekir) ──
//
// Kaynak: deniz endüstrisi genel kabul görmüş tahmin aralıkları.
// Bu değerler TAHMÎN'dir; doğru LDT için "as per request" notu konulmalı.

const LDT_RATIO_BY_TYPE = {
  // Spesifik tip
  "container ship":           0.28,
  "crude oil tanker":         0.20,
  "product tanker":           0.20,
  "chemical tanker":          0.22,
  "bulk carrier":             0.20,
  "general cargo ship":       0.25,
  "general cargo":            0.25,
  "ro-ro cargo ship":         0.40,
  "ro-ro":                    0.40,
  "vehicle carrier":          0.35,
  "car carrier":              0.35,
  "lng tanker":               0.25,
  "lpg tanker":               0.25,
  "offshore supply ship":     0.45,
  "platform supply vessel":   0.45,
  "tug":                      0.60,
  "dredger":                  0.50,
  // Geniş kategori fallback
  "cargo":                    0.25,
  "tanker":                   0.20,
};

// Yolcu gemileri çok değişkendir — tahmin güvenilir değil
const LDT_SKIP_TYPES = new Set(["passenger", "cruise", "ferry"]);

function computeLDT(deadweight, typeSpecific) {
  if (!deadweight || deadweight <= 0) return { ldt: null, estimated: false };

  const typeLower = (typeSpecific || "").toLowerCase().trim();

  // Yolcu/cruise → güvenilmez tahmin
  for (const skip of LDT_SKIP_TYPES) {
    if (typeLower.includes(skip)) return { ldt: null, estimated: false };
  }

  // Tip eşleşmesi (en spesifik önce)
  let ratio = null;
  for (const [key, val] of Object.entries(LDT_RATIO_BY_TYPE)) {
    if (typeLower.includes(key)) { ratio = val; break; }
  }
  if (!ratio) ratio = 0.22; // genel fallback

  const ldt = Math.round(deadweight * ratio);
  return { ldt: ldt >= 500 ? ldt : null, estimated: true };
}

function computeScrapValue(ldt, ldtEstimated) {
  if (!ldt) return { scrapValueUsd: null, scrapValueEstimated: false };
  return {
    scrapValueUsd:       Math.round(ldt * SCRAP_PRICE_LDT),
    scrapValueEstimated: ldtEstimated,
  };
}

// ─── File cache ───────────────────────────────────────────────────────────────
// { "9038828": { builtYear: 1992, source: "datalastic", cachedAt: "...", ...allFields } }

let _cache = null;

function loadCache() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); }
  catch { _cache = {}; }
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

function log(msg) { process.stdout.write(`[builtYearEnrichment] ${msg}\n`); }

// ─── getVesselInfo ────────────────────────────────────────────────────────────

async function getVesselInfo(imo) {
  if (!imo) return null;
  if (!DATALASTIC_KEY) return null;

  const cache = loadCache();
  const key   = String(imo);

  // Cache hit — tüm alanlar zaten varsa dön
  if (cache[key]?.source === "datalastic") {
    return cache[key];
  }

  try {
    const url = `${DATALASTIC_URL}/vessel_info?imo=${imo}&api-key=${DATALASTIC_KEY}`;
    const res = await httpsGet(url);

    if (res.status === 429) {
      log(`Rate limit hit (IMO ${imo}) — skipping`);
      await sleep(5_000);
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      log(`Auth error ${res.status} — check DATALASTIC_API_KEY`);
      return null;
    }
    if (res.status === 404) {
      cache[key] = { builtYear: null, source: "datalastic", cachedAt: new Date().toISOString() };
      saveCache();
      return null;
    }
    if (res.status !== 200) {
      log(`Unexpected status ${res.status} for IMO ${imo}`);
      return null;
    }

    const json = JSON.parse(res.body);
    const d    = json?.data;
    if (!d) return null;

    const yearRaw   = d.year_built;
    const builtYear = yearRaw ? parseInt(yearRaw) : null;
    const deadweight = d.deadweight || null;
    const typeSpec   = d.type_specific || null;
    const { ldt, estimated: ldtEstimated } = computeLDT(deadweight, typeSpec);
    const { scrapValueUsd, scrapValueEstimated } = computeScrapValue(ldt, ldtEstimated);

    const entry = {
      // Temel
      builtYear,
      source:    "datalastic",
      cachedAt:  new Date().toISOString(),
      // Kimlik
      flag:          d.country_iso    || null,
      callsign:      d.callsign       || null,
      // Tip
      typeSpecific:  typeSpec,
      // Tonaj
      grossTonnage:  d.gross_tonnage  || null,
      deadweight,
      teu:           d.teu ? parseInt(d.teu) : null,
      // LDT (tahmini — Datalastic lightship verisi sağlamıyor)
      ldt,
      ldtEstimated,
      // Hurda değeri
      scrapValueUsd,
      scrapValueEstimated,
      // Boyutlar
      length:        d.length         || null,
      breadth:       d.breadth        || null,
      draughtAvg:    d.draught_avg    || null,
      draughtMax:    d.draught_max    || null,
      // Hız
      speedAvg:      d.speed_avg      || null,
      speedMax:      d.speed_max      || null,
      // Liman
      homePort:      d.home_port      || null,
    };

    cache[key] = entry;
    saveCache();
    return entry;

  } catch (err) {
    log(`Fetch error for IMO ${imo}: ${err.message}`);
    return null;
  }
}

// ─── computeScrapScore ────────────────────────────────────────────────────────

function computeScrapScore(v) {
  let score = 0;
  const reasons = [];

  const age = v.builtYear ? (new Date().getFullYear() - v.builtYear) : null;
  if (age != null) {
    if      (age >= 50) { score += 40; reasons.push(`age ${age}y`); }
    else if (age >= 40) { score += 35; reasons.push(`age ${age}y`); }
    else if (age >= 30) { score += 28; reasons.push(`age ${age}y`); }
    else if (age >= 25) { score += 20; reasons.push(`age ${age}y`); }
    else if (age >= 20) { score += 12; reasons.push(`age ${age}y`); }
  }

  const ns = parseInt(v.navStatus) || 0;
  if (ns === 1 || ns === 5) {
    score += 15;
    reasons.push(ns === 1 ? "anchored" : "moored");
  }

  if (v.flag && RISK_FLAGS.has(v.flag)) {
    score += 12;
    reasons.push(`risk flag (${v.flag})`);
  }

  const speed = parseFloat(v.speed) || 0;
  if (speed === 0) { score += 5; reasons.push("stationary"); }

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
    return ns === 1 || ns === 5 || speed === 0 || (v.flag && RISK_FLAGS.has(v.flag));
  });

  const stats = { total: candidates.length, noImo: 0, cacheHit: 0, apiOk: 0, apiNull: 0, skipped: 0 };

  for (const v of candidates) {
    if (!v.imo) { stats.noImo++; continue; }

    const cache    = loadCache();
    const fromCache = cache[String(v.imo)]?.source === "datalastic";

    const info = await getVesselInfo(v.imo);

    if (fromCache)      stats.cacheHit++;
    else if (info)      stats.apiOk++;
    else if (!DATALASTIC_KEY) stats.skipped++;
    else                stats.apiNull++;

    if (info) {
      // Statik alanları vessel objesine ekle (aisWorker updateStaticsToDB'de kullanacak)
      if (info.builtYear)     v.builtYear     = info.builtYear;
      if (info.flag)          v.datalasticFlag = info.flag;   // AIS flag'i ezmemek için ayrı key
      if (info.typeSpecific)  v.typeSpecific   = info.typeSpecific;
      if (info.grossTonnage)  v.grossTonnage   = info.grossTonnage;
      if (info.deadweight)    v.deadweight     = info.deadweight;
      if (info.teu)           v.teu            = info.teu;
      if (info.ldt)           v.ldt            = info.ldt;
      v.ldtEstimated           = info.ldtEstimated ?? false;
      if (info.scrapValueUsd) v.scrapValueUsd  = info.scrapValueUsd;
      v.scrapValueEstimated    = info.scrapValueEstimated ?? false;
      if (info.speedMax)      v.speedMax       = info.speedMax;
      if (info.homePort)      v.homePort       = info.homePort;
      if (info.callsign)      v.callsign       = info.callsign;
    }

    const { score, reasons } = computeScrapScore(v);
    v.scrapScore    = score;
    v.scrapCategory = scrapCategory(score);
    v.scrapReasons  = reasons;

    if (!fromCache) await sleep(250);
  }

  log(
    `enrichCandidates: ${stats.total} candidates | ` +
    `no-IMO: ${stats.noImo} | cache-hit: ${stats.cacheHit} | ` +
    `api-ok: ${stats.apiOk} | api-null(404): ${stats.apiNull} | ` +
    `skipped(no-key): ${stats.skipped}`
  );

  return vessels;
}

// ─── updateStaticsToDB ────────────────────────────────────────────────────────
// aisWorker'ın main upsert'i konum/AIS verisini yazar.
// Bu fonksiyon statik Datalastic verilerini ayrı UPDATE ile yazar.
// Sadece yeni veri olan ve DB'de henüz gross_tonnage olmayan gemileri günceller.

async function updateStaticsToDB(pool, vessels) {
  if (!pool) return;

  const toUpdate = vessels.filter(v =>
    v.imo && (v.grossTonnage || v.deadweight || v.ldt || v.typeSpecific)
  );
  if (!toUpdate.length) return;

  let updated = 0;
  for (const v of toUpdate) {
    try {
      const res = await pool.query(`
        UPDATE vessels SET
          gross_tonnage        = COALESCE(gross_tonnage,        $1),
          deadweight           = COALESCE(deadweight,           $2),
          ldt                  = COALESCE(ldt,                  $3),
          ldt_estimated        = COALESCE(ldt_estimated,        $4),
          type_specific        = COALESCE(type_specific,        $5),
          teu                  = COALESCE(teu,                  $6),
          home_port            = COALESCE(home_port,            $7),
          speed_max            = COALESCE(speed_max,            $8),
          callsign             = COALESCE(callsign,             $9),
          scrap_value_usd      = $10,
          scrap_value_estimated= $11,
          flag                 = COALESCE(flag, NULLIF($12,''))
        WHERE imo = $13::bigint
      `, [
        v.grossTonnage        || null,
        v.deadweight          || null,
        v.ldt                 || null,
        v.ldtEstimated        ?? false,
        v.typeSpecific        || null,
        v.teu                 || null,
        v.homePort            || null,
        v.speedMax            || null,
        v.callsign            || null,
        v.scrapValueUsd       || null,
        v.scrapValueEstimated ?? false,
        v.datalasticFlag      || null,  // sadece AIS flag null ise yaz
        v.imo,
      ]);
      if (res.rowCount > 0) updated++;
    } catch (err) {
      log(`updateStaticsToDB error IMO ${v.imo}: ${err.message}`);
    }
  }

  if (updated > 0) log(`updateStaticsToDB: ${updated}/${toUpdate.length} vessels updated`);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getVesselInfo,
  enrichCandidates,
  updateStaticsToDB,
  computeScrapScore,
  computeLDT,
  computeScrapValue,
  scrapCategory,
};
