"use strict";

/**
 * backfillMissingData.js
 *
 * Datalastic vessel_info'dan eksik statik veriyi doldurur.
 * Hedef: built_year IS NULL olan (veya --all flag ile tüm) IMO'lu gemiler.
 *
 * Kullanım:
 *   node scripts/backfillMissingData.js            # ilk 100 (test)
 *   node scripts/backfillMissingData.js --limit 500
 *   node scripts/backfillMissingData.js --all       # tümü (dikkatli kullan)
 *   node scripts/backfillMissingData.js --rescore   # scrap_score yeniden hesapla
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { Pool }                  = require("pg");
const { getVesselInfo, computeScrapScore, scrapCategory, computeLDT, computeScrapValue } =
  require("../scraper/builtYearEnrichment");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

// ─── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const ALL     = args.includes("--all");
const RESCORE = args.includes("--rescore");
const limitArg = args.find(a => a.startsWith("--limit=")) || args[args.indexOf("--limit") + 1];
const LIMIT   = ALL ? 999999 : (parseInt(limitArg) || 100);

// ─── Step 1: Fetch candidates from DB ────────────────────────────────────────

async function getCandidates() {
  let query, params;

  if (RESCORE) {
    // Rescore modu: built_year var ama scrap_score NULL olan gemiler
    query  = `SELECT mmsi::text, imo::text, built_year, flag, speed, nav_status FROM vessels WHERE built_year IS NOT NULL AND scrap_score IS NULL AND imo IS NOT NULL LIMIT $1`;
    params = [LIMIT];
  } else {
    // Normal mod: built_year eksik, IMO var
    query  = `SELECT mmsi::text, imo::text, built_year, flag, speed, nav_status FROM vessels WHERE built_year IS NULL AND imo IS NOT NULL LIMIT $1`;
    params = [LIMIT];
  }

  const { rows } = await pool.query(query, params);
  return rows;
}

// ─── Step 2: Enrich one vessel from Datalastic ───────────────────────────────

async function enrichOne(row) {
  const info = await getVesselInfo(row.imo);
  if (!info) return null;

  return {
    mmsi:               row.mmsi,
    imo:                row.imo,
    builtYear:          info.builtYear          || null,
    flag:               info.flag               || null,
    typeSpecific:       info.typeSpecific        || null,
    grossTonnage:       info.grossTonnage        || null,
    deadweight:         info.deadweight          || null,
    teu:                info.teu                 || null,
    ldt:                info.ldt                 || null,
    ldtEstimated:       info.ldtEstimated        ?? false,
    scrapValueUsd:      info.scrapValueUsd       || null,
    scrapValueEstimated:info.scrapValueEstimated ?? false,
    length:             info.length              || null,
    breadth:            info.breadth             || null,
    homePort:           info.homePort            || null,
    speedMax:           info.speedMax            || null,
    callsign:           info.callsign            || null,
  };
}

// ─── Step 3: Compute scrap score for a row ───────────────────────────────────

function scoreRow(row, info) {
  const merged = {
    builtYear:  (info?.builtYear  || row.built_year) ?? null,
    flag:       (info?.flag       || row.flag)        || null,
    speed:      parseFloat(row.speed)                 || 0,
    navStatus:  parseInt(row.nav_status)              || 0,
  };
  const { score, reasons } = computeScrapScore(merged);
  return { score, category: scrapCategory(score), reasons };
}

// ─── Step 4: UPDATE one vessel in DB ─────────────────────────────────────────

async function updateOne(info, scoreData) {
  const currentYear = new Date().getFullYear();
  const age = info.builtYear ? currentYear - info.builtYear : null;

  await pool.query(`
    UPDATE vessels SET
      built_year            = COALESCE(built_year,            $1::int4),
      age                   = COALESCE(age,                   $2::int4),
      flag                  = COALESCE(flag, NULLIF($3, '')),
      length                = COALESCE(length,                $4::float4),
      beam                  = COALESCE(beam,                  $5::float4),
      deadweight            = COALESCE(deadweight,            $6::int4),
      gross_tonnage         = COALESCE(gross_tonnage,         $7::int4),
      type_specific         = COALESCE(type_specific,         $8),
      teu                   = COALESCE(teu,                   $9::int4),
      ldt                   = COALESCE(ldt,                   $10::int4),
      ldt_estimated         = COALESCE(ldt_estimated,         $11),
      scrap_value_usd       = COALESCE(scrap_value_usd,       $12::float8),
      scrap_value_estimated = COALESCE(scrap_value_estimated, $13),
      home_port             = COALESCE(home_port,             $14),
      speed_max             = COALESCE(speed_max,             $15::float4),
      callsign              = COALESCE(callsign,              $16),
      scrap_score           = $17::int4,
      scrap_category        = $18,
      updated_at            = NOW()
    WHERE imo = $19::bigint
  `, [
    info.builtYear          || null,   // 1
    age,                               // 2
    info.flag               || null,   // 3
    info.length             || null,   // 4
    info.breadth            || null,   // 5
    info.deadweight         || null,   // 6
    info.grossTonnage       || null,   // 7
    info.typeSpecific       || null,   // 8
    info.teu                || null,   // 9
    info.ldt                || null,   // 10
    info.ldtEstimated       ?? false,  // 11
    info.scrapValueUsd      || null,   // 12
    info.scrapValueEstimated ?? false, // 13
    info.homePort           || null,   // 14
    info.speedMax           || null,   // 15
    info.callsign           || null,   // 16
    scoreData.score,                   // 17
    scoreData.category,               // 18
    info.imo,                          // 19
  ]);
}

// ─── Step 5: Rescore-only path ────────────────────────────────────────────────

async function rescoreOnly(rows) {
  log(`Rescoring ${rows.length} vessels with built_year but no scrap_score...`);
  let updated = 0;
  for (const row of rows) {
    const scoreData = scoreRow(row, null);
    try {
      await pool.query(`
        UPDATE vessels SET
          scrap_score    = $1::int4,
          scrap_category = $2,
          updated_at     = NOW()
        WHERE mmsi = $3::bigint
      `, [scoreData.score, scoreData.category, row.mmsi]);
      updated++;
    } catch (err) {
      log(`Rescore error MMSI ${row.mmsi}: ${err.message}`);
    }
  }
  log(`Rescore done: ${updated}/${rows.length} updated`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== ShipScout Backfill ===`);
  log(`Mode: ${RESCORE ? "rescore" : "enrich"} | Limit: ${ALL ? "ALL" : LIMIT}`);

  const rows = await getCandidates();
  log(`Found ${rows.length} candidates`);

  if (!rows.length) {
    log("Nothing to do.");
    return;
  }

  if (RESCORE) {
    await rescoreOnly(rows);
    return;
  }

  // Enrich + update loop
  let enriched = 0, skipped = 0, errors = 0, quotaHits = 0;
  const t0 = Date.now();
  const QUOTA_BAIL = 10; // art arda 10 quota hatası → dur

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    process.stdout.write(`\r[${i + 1}/${rows.length}] IMO ${row.imo} ... `);

    if (quotaHits >= QUOTA_BAIL) {
      process.stdout.write(`\n`);
      log(`WARNING: ${QUOTA_BAIL}+ consecutive quota errors (402) — stopping early. Check Datalastic plan/credits.`);
      break;
    }

    try {
      const info = await enrichOne(row);
      if (!info || !info.builtYear) {
        skipped++;
        quotaHits++;
        process.stdout.write(`skipped (no data)\n`);
      } else {
        quotaHits = 0; // başarı → quota sayacı sıfırla
        const scoreData = scoreRow(row, info);
        await updateOne(info, scoreData);
        enriched++;
        process.stdout.write(`OK — ${info.builtYear} | flag:${info.flag || "-"} | score:${scoreData.score} (${scoreData.category})\n`);
      }
    } catch (err) {
      errors++;
      quotaHits++;
      process.stdout.write(`ERROR: ${err.message}\n`);
    }

    // Rate limit: 1s between calls (Datalastic free tier = ~1 req/s)
    if (i < rows.length - 1) await sleep(1000);
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`\n=== Done in ${elapsed}s ===`);
  log(`Enriched: ${enriched} | Skipped (no data): ${skipped} | Errors: ${errors}`);

  // Auto-rescore: update scrap_score for all vessels with built_year now set
  if (enriched > 0) {
    log(`Running rescore for enriched vessels...`);
    try {
      const { rows: toRescore } = await pool.query(`
        SELECT mmsi::text, imo::text, built_year, flag, speed, nav_status
        FROM vessels
        WHERE built_year IS NOT NULL
          AND (scrap_score IS NULL OR scrap_score = 0)
        LIMIT 5000
      `);
      if (toRescore.length > 0) await rescoreOnly(toRescore);
    } catch (err) {
      log(`Auto-rescore error: ${err.message}`);
    }
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => pool.end());
