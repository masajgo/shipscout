"use strict";

/**
 * backfillFromEquasis.js
 *
 * vessels tablosunda built_year IS NULL olan IMO'ları Equasis'ten enriche eder.
 * Her IMO için: year_built, flag, gross_tonnage, ship_type, callsign çeker → DB UPDATE.
 *
 * Kullanım:
 *   node scripts/backfillFromEquasis.js --limit=20   # test
 *   node scripts/backfillFromEquasis.js --limit=150  # güvenli günlük batch
 *   node scripts/backfillFromEquasis.js --rescore    # sadece scrap_score yeniden hesapla
 *
 * Rate limit: 6-8 sn arayla (equasisOwner.js ile aynı davranış)
 * Günlük limit: 200 (equasis_usage.json ile paylaşımlı — dailyOwnerScan.js ile çakışmaz)
 */

const path     = require("path");
const fs       = require("fs");
const { Pool } = require("pg");
const { chromium } = require("playwright");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { login, getOwner } = require("../scraper/equasisOwner");
const { computeScrapScore, scrapCategory } = require("../scraper/builtYearEnrichment");

// ─── Config ───────────────────────────────────────────────────────────────────

const DAILY_LIMIT  = 200;
const DELAY_MIN_MS = 6000;
const DELAY_MAX_MS = 8000;

const DATA_DIR   = path.join(__dirname, "../scraper/data");
const USAGE_FILE = path.join(DATA_DIR, "equasis_usage.json");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }
if (!process.env.EQUASIS_EMAIL || !process.env.EQUASIS_PASSWORD) {
  console.error("EQUASIS_EMAIL / EQUASIS_PASSWORD not set"); process.exit(1);
}

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

// ─── Args ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const RESCORE  = args.includes("--rescore");
const limitArg = args.find(a => a.startsWith("--limit=")) || args[args.indexOf("--limit") + 1];
const LIMIT    = parseInt(limitArg) || 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() {
  return sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
}
function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ─── Günlük kullanım (equasisOwner.js ile paylaşımlı) ────────────────────────

function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return { date: todayStr(), count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (u.date !== todayStr()) return { date: todayStr(), count: 0 };
    return u;
  } catch { return { date: todayStr(), count: 0 }; }
}

function saveUsage(u) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
}

function incrementUsage() {
  const u = loadUsage();
  u.count++;
  saveUsage(u);
  return u;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getCandidates(limit) {
  const { rows } = await pool.query(`
    SELECT mmsi::text, imo::text, built_year, flag, speed, nav_status
    FROM   vessels
    WHERE  built_year IS NULL
      AND  imo IS NOT NULL
      AND  imo > 0
      AND  imo < 9999999          -- gerçek IMO: 7 basamak
    ORDER  BY scrap_score DESC NULLS LAST
    LIMIT  $1
  `, [limit]);
  return rows;
}

async function updateVessel(imo, data) {
  const currentYear = new Date().getFullYear();
  const age = data.builtYear ? currentYear - data.builtYear : null;

  const { rowCount } = await pool.query(`
    UPDATE vessels SET
      built_year            = COALESCE(built_year,    $1::int4),
      age                   = COALESCE(age,           $2::int4),
      flag                  = COALESCE(flag,          NULLIF($3, '')),
      gross_tonnage         = COALESCE(gross_tonnage, $4::int4),
      type_specific         = COALESCE(type_specific, NULLIF($5, '')),
      callsign              = COALESCE(callsign,      NULLIF($6, '')),
      scrap_score           = $7::int4,
      scrap_category        = $8,
      updated_at            = NOW()
    WHERE imo = $9::bigint
  `, [
    data.builtYear   || null,      // 1
    age,                            // 2
    data.flag        || null,      // 3
    data.grossTonnage ? parseInt(String(data.grossTonnage).replace(/\D/g, "")) || null : null, // 4
    data.shipType    || null,      // 5
    data.callSign    || null,      // 6
    data.scrapScore,               // 7
    data.scrapCategory,            // 8
    imo,                           // 9
  ]);
  return rowCount;
}

// ─── Rescore-only path ────────────────────────────────────────────────────────

async function rescoreOnly() {
  log("Rescore mode: built_year var ama scrap_score NULL olan gemiler…");
  const { rows } = await pool.query(`
    SELECT mmsi::text, imo::text, built_year, flag, speed, nav_status
    FROM   vessels
    WHERE  built_year IS NOT NULL
      AND  (scrap_score IS NULL OR scrap_score = 0)
    LIMIT  5000
  `);
  log(`${rows.length} vessel rescoring…`);
  let updated = 0;
  for (const row of rows) {
    const { score, reasons } = computeScrapScore({
      builtYear:  row.built_year,
      flag:       row.flag,
      speed:      parseFloat(row.speed) || 0,
      navStatus:  parseInt(row.nav_status) || 0,
    });
    const cat = scrapCategory(score);
    await pool.query(
      `UPDATE vessels SET scrap_score=$1, scrap_category=$2, updated_at=NOW() WHERE mmsi=$3::bigint`,
      [score, cat, row.mmsi],
    );
    updated++;
  }
  log(`Rescore done: ${updated} vessels updated`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (RESCORE) { await rescoreOnly(); return; }

  // Günlük limit kontrolü
  const usageNow = loadUsage();
  const remaining = DAILY_LIMIT - usageNow.count;
  if (remaining <= 0) {
    log(`Günlük limit doldu (${usageNow.count}/${DAILY_LIMIT}). Yarın devam.`);
    process.exit(1);
  }
  const effectiveLimit = Math.min(LIMIT, remaining);
  if (effectiveLimit < LIMIT) {
    log(`Günlük limite göre limit düşürüldü: ${LIMIT} → ${effectiveLimit} (bugün kullanılan: ${usageNow.count}/${DAILY_LIMIT})`);
  }

  log(`=== Equasis Backfill — limit:${effectiveLimit} | bugün kullanılan: ${usageNow.count}/${DAILY_LIMIT} ===`);

  const candidates = await getCandidates(effectiveLimit);
  log(`${candidates.length} vessel candidate (built_year IS NULL)`);
  if (!candidates.length) { log("Yapılacak bir şey yok."); return; }

  // Playwright başlat
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let enriched = 0, skipped = 0, errors = 0, blocked = false;

  try {
    await login(page);
    log("Equasis login OK ✓");

    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      const usage = loadUsage();

      if (usage.count >= DAILY_LIMIT) {
        log(`Günlük limit (${DAILY_LIMIT}) doldu — duruyorum.`);
        blocked = true;
        break;
      }

      log(`[${i + 1}/${candidates.length}] IMO ${row.imo} (MMSI ${row.mmsi}) …`);

      try {
        // Rate limit: önce bekle (ilk öğeden sonra)
        if (i > 0) await randomDelay();

        let result;
        try {
          result = await getOwner(page, parseInt(row.imo));
        } catch (sessionErr) {
          if (sessionErr.message !== "EQUASIS_SESSION_EXPIRED") throw sessionErr;
          log("  Session expired — re-logging in…");
          await login(page);
          result = await getOwner(page, parseInt(row.imo));
        }
        incrementUsage();

        if (!result.builtYear && !result.flag) {
          skipped++;
          log(`  → no data (builtYear:${result.builtYear || "-"}, flag:${result.flag || "-"})`);
          continue;
        }

        // Scrap score hesapla (mevcut DB nav/speed ile birleştir)
        const { score, reasons } = computeScrapScore({
          builtYear:  result.builtYear ? parseInt(result.builtYear) : null,
          flag:       result.flag      || row.flag || null,
          speed:      parseFloat(row.speed)     || 0,
          navStatus:  parseInt(row.nav_status)  || 0,
        });
        const cat = scrapCategory(score);

        const rowCount = await updateVessel(row.imo, {
          builtYear:    result.builtYear ? parseInt(result.builtYear) : null,
          flag:         result.flag      || null,
          grossTonnage: result.gross     || null,
          shipType:     result.shipType  || null,
          callSign:     result.callSign  || null,
          scrapScore:   score,
          scrapCategory: cat,
        });

        if (rowCount > 0) {
          enriched++;
          log(`  ✓ year:${result.builtYear || "-"} flag:${result.flag || "-"} gt:${result.gross || "-"} score:${score}(${cat}) [reasons: ${reasons.join(", ") || "none"}]`);
        } else {
          skipped++;
          log(`  → UPDATE hit 0 rows (IMO not in DB?)`);
        }

      } catch (err) {
        if (err.message.startsWith("EQUASIS_BLOCK")) {
          log(`⚠️  EQUASIS BLOK — ${err.message}`);
          blocked = true;
          break;
        }
        errors++;
        log(`  ✗ ${err.message}`);
      }
    }

  } finally {
    await browser.close().catch(() => {});
  }

  const finalUsage = loadUsage();
  log(`\n=== ${blocked ? "DURDURULDU (blok/limit)" : "Tamamlandı"} ===`);
  log(`Enriched: ${enriched} | Skipped: ${skipped} | Errors: ${errors}`);
  log(`Equasis bugün: ${finalUsage.count}/${DAILY_LIMIT} (kalan: ${DAILY_LIMIT - finalUsage.count})`);

  // Sonunda 0-scoreli ama built_year dolu gemileri rescore et
  if (enriched > 0) {
    log(`\nPost-backfill rescore başlatılıyor…`);
    await rescoreOnly();
  }
}

main()
  .catch(err => { log(`FATAL: ${err.message}`); console.error(err); process.exit(1); })
  .finally(() => pool.end());
