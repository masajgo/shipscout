"use strict";
/**
 * bulkEnrichAll.js
 *
 * Datalastic vessel_info + ownership ile vessels tablosunu toplu enrich eder.
 * Unlimited kredi — 10 concurrent, delay yok.
 *
 * Her vessel için:
 *   vessel_info  → built_year, flag, type_specific, gross_tonnage, deadweight,
 *                  length, breadth, callsign, mmsi, ldt, scrap_value_usd
 *   ownership    → operator, commercial_manager, class_code
 *
 * UPSERT: owners tablosuna da yazar.
 *
 * Kullanım:
 *   node scripts/bulkEnrichAll.js                # eksik alanlar olan tüm gemiler
 *   node scripts/bulkEnrichAll.js --limit=500    # ilk 500
 *   node scripts/bulkEnrichAll.js --fresh        # hepsini yeniden çek
 *   node scripts/bulkEnrichAll.js --rescore      # sadece scrap_score yeniden hesapla
 */

const path    = require("path");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { computeScrapScore, scrapCategory } = require("../scraper/builtYearEnrichment");
const API_KEY  = process.env.DATALASTIC_API_KEY;
const DB_URL   = process.env.DATABASE_URL;

if (!API_KEY) { console.error("DATALASTIC_API_KEY not set"); process.exit(1); }
if (!DB_URL)  { console.error("DATABASE_URL not set");       process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 10,
  idleTimeoutMillis: 60_000,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const BASE        = "https://api.datalastic.com/api/v0";
const REPORTS     = "https://api.datalastic.com/api/maritime_reports";
const CONCURRENCY = 10;
const LDT_COEFF   = 0.17;   // DWT → LDT (bulk/tanker default)
const SCRAP_USD   = 450;

// ─── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const FRESH   = args.includes("--fresh");
const RESCORE = args.includes("--rescore");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT   = limitArg ? parseInt(limitArg.split("=")[1]) : 99999;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

async function dlJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.meta?.success ? j : null;
  } catch { return null; }
}

function calcScrap(dwt, existingLdt) {
  const ldt = existingLdt || (dwt ? Math.round(dwt * LDT_COEFF) : null);
  return { ldt, scrapUsd: ldt ? Math.round(ldt * SCRAP_USD) : null, estimated: !existingLdt };
}

// ─── DB: candidates ───────────────────────────────────────────────────────────

async function getCandidates() {
  const condition = FRESH
    ? "imo IS NOT NULL AND imo BETWEEN 1000000 AND 9999999"
    : `imo IS NOT NULL AND imo BETWEEN 1000000 AND 9999999
       AND (built_year IS NULL OR flag IS NULL OR type_specific IS NULL
            OR gross_tonnage IS NULL OR manager_name IS NULL)`;

  const { rows } = await pool.query(`
    SELECT imo::text, name, ldt, deadweight, built_year, flag, scrap_score
    FROM   vessels
    WHERE  ${condition}
    ORDER  BY scrap_score DESC NULLS LAST
    LIMIT  $1
  `, [LIMIT]);
  return rows;
}

// ─── DB: upsert vessel ────────────────────────────────────────────────────────

async function upsertVessel(imo, info, ownership) {
  const year    = new Date().getFullYear();
  const d       = info?.data;
  const o       = ownership?.data?.[0];

  const builtYear   = d?.year_built   ? parseInt(d.year_built)   : (o?.built_year ? parseInt(o.built_year) : null);
  const flag        = d?.country_name || null;
  const typeSpec    = d?.type_specific || null;
  const grossTon    = d?.gross_tonnage ? parseInt(d.gross_tonnage) : null;
  const dwt         = d?.deadweight   ? parseInt(d.deadweight)   : null;
  const loa         = d?.length       ? parseFloat(d.length)     : null;
  const beam        = d?.breadth      ? parseFloat(d.breadth)    : null;
  const callsign    = d?.callsign     || null;
  const mmsi        = d?.mmsi         ? parseInt(d.mmsi)         : null;
  const managerName = o?.commercial_manager || o?.operator       || null;
  const classCode   = o?.class1_code  || null;
  const age         = builtYear ? year - builtYear : null;

  // Fetch existing ldt from DB (passed in row)
  const { ldt: calcLdt, scrapUsd, estimated } = calcScrap(dwt, null);

  // Scrap score
  let scrapScore = null, scrapCat = null;
  if (age !== null) {
    const { score } = computeScrapScore({ builtYear, flag, speed: 0, navStatus: 0 });
    scrapScore = score;
    scrapCat   = scrapCategory(score);
  }

  await pool.query(`
    UPDATE vessels SET
      built_year      = COALESCE(built_year,      $1::int4),
      age             = COALESCE(age,             $2::int4),
      flag            = COALESCE(flag,            NULLIF($3,'')),
      type_specific   = COALESCE(type_specific,   NULLIF($4,'')),
      gross_tonnage   = COALESCE(gross_tonnage,   $5::int4),
      deadweight      = COALESCE(deadweight,      $6::int4),
      length          = COALESCE(length,          $7::float8),
      beam            = COALESCE(beam,            $8::float8),
      callsign        = COALESCE(callsign,        NULLIF($9,'')),
      mmsi            = COALESCE(mmsi,            $10::bigint),
      manager_name    = COALESCE(manager_name,    NULLIF($11,'')),
      ldt             = COALESCE(ldt,             $12::int4),
      ldt_estimated   = COALESCE(ldt_estimated,   $13),
      scrap_value_usd = COALESCE(scrap_value_usd, $14::float8),
      scrap_score     = CASE WHEN $15::int4 IS NOT NULL THEN $15::int4 ELSE scrap_score END,
      scrap_category  = CASE WHEN $16::text IS NOT NULL THEN $16::text ELSE scrap_category END,
      updated_at      = NOW()
    WHERE imo = $17::bigint
  `, [
    builtYear, age, flag, typeSpec, grossTon,
    dwt, loa, beam, callsign, mmsi,
    managerName,
    calcLdt, estimated, scrapUsd,
    scrapScore, scrapCat,
    imo,
  ]);

  return { builtYear, flag, typeSpec, grossTon, managerName, scrapScore };
}

// ─── DB: upsert owner ─────────────────────────────────────────────────────────

async function upsertOwner(imo, info, ownership) {
  const d = info?.data;
  const o = ownership?.data?.[0];
  if (!o && !d) return;

  const ownerName   = o?.beneficial_owner  || null;
  const managerName = o?.commercial_manager || o?.operator || null;
  const vesselName  = d?.name || null;

  if (!ownerName && !managerName) return;

  await pool.query(`
    INSERT INTO owners (imo, vessel_name, owner_name, manager_name, source, fetched_at)
    VALUES ($1::bigint, $2, $3, $4, 'datalastic', NOW())
    ON CONFLICT (imo) DO UPDATE SET
      vessel_name  = COALESCE(NULLIF(EXCLUDED.vessel_name,''),  owners.vessel_name),
      owner_name   = COALESCE(NULLIF(EXCLUDED.owner_name,''),   owners.owner_name),
      manager_name = COALESCE(NULLIF(EXCLUDED.manager_name,''), owners.manager_name)
  `, [imo, vesselName, ownerName, managerName]);
}

// ─── Rescore-only mode ────────────────────────────────────────────────────────

async function rescoreOnly() {
  log("Rescoring vessels with built_year…");
  const { rows } = await pool.query(`
    SELECT mmsi::text, built_year, flag FROM vessels
    WHERE built_year IS NOT NULL AND (scrap_score IS NULL OR scrap_score = 0)
    LIMIT 20000
  `);
  if (!rows.length) { log("Nothing to rescore."); return; }

  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch  = rows.slice(i, i + BATCH);
    const params = [];
    const vals   = batch.map((r, j) => {
      const { score } = computeScrapScore({ builtYear: r.built_year, flag: r.flag, speed: 0, navStatus: 0 });
      const cat = scrapCategory(score);
      params.push(r.mmsi, score, cat);
      return `($${j * 3 + 1}::bigint, $${j * 3 + 2}::int4, $${j * 3 + 3})`;
    });
    await pool.query(`
      UPDATE vessels AS v SET scrap_score=t.score, scrap_category=t.cat, updated_at=NOW()
      FROM (VALUES ${vals.join(",")}) AS t(mmsi,score,cat)
      WHERE v.mmsi = t.mmsi
    `, params);
    updated += batch.length;
    process.stdout.write(`\r  rescored ${updated}/${rows.length}`);
  }
  process.stdout.write("\n");
  log(`Rescore done: ${updated} vessels.`);
}

// ─── Process one vessel ───────────────────────────────────────────────────────

async function processVessel(row) {
  const imo = row.imo;
  const [info, ownership] = await Promise.all([
    dlJSON(`${BASE}/vessel_info?api-key=${API_KEY}&imo=${imo}`),
    dlJSON(`${REPORTS}/ownership?api-key=${API_KEY}&imo=${imo}`),
  ]);

  if (!info && !ownership) return { imo, status: "no_data" };

  const fields = await upsertVessel(imo, info, ownership);
  await upsertOwner(imo, info, ownership);
  return { imo, status: "ok", ...fields };
}

// ─── Concurrent worker pool ───────────────────────────────────────────────────

async function runPool(candidates) {
  let idx = 0, enriched = 0, errors = 0, noData = 0;
  const total = candidates.length;

  async function worker() {
    while (idx < total) {
      const row = candidates[idx++];
      try {
        const result = await processVessel(row);
        if (result.status === "no_data") noData++;
        else enriched++;
      } catch (err) {
        errors++;
        if (errors <= 3) process.stdout.write(`\n  ERR ${row.imo}: ${err.message.slice(0,100)}\n`);
      }
      const done = enriched + noData + errors;
      process.stdout.write(`\r  ${done}/${total} enriched=${enriched} no_data=${noData} errors=${errors}  `);

      if (done % 500 === 0) {
        process.stdout.write("\n");
        log(`Progress: ${done}/${total} | enriched: ${enriched} | no_data: ${noData} | errors: ${errors}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stdout.write("\n");
  return { enriched, errors, noData };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (RESCORE) { await rescoreOnly(); return; }

  log("=== Datalastic Bulk Enrich ===");
  log(`Concurrency: ${CONCURRENCY} | Fresh: ${FRESH} | Limit: ${LIMIT}`);

  const candidates = await getCandidates();
  log(`Candidates: ${candidates.length} vessels to enrich`);
  if (!candidates.length) { log("Nothing to do."); return; }

  const start = Date.now();
  const stats = await runPool(candidates);
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);

  log(`\n=== Done in ${elapsed}s ===`);
  log(`Enriched: ${stats.enriched} | No data (not in Datalastic): ${stats.noData} | Errors: ${stats.errors}`);

  // Final DB stats
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(built_year) as has_year,
      COUNT(flag) as has_flag,
      COUNT(type_specific) as has_type,
      COUNT(gross_tonnage) as has_gt,
      COUNT(manager_name) as has_manager
    FROM vessels WHERE imo IS NOT NULL AND imo BETWEEN 1000000 AND 9999999
  `);
  log(`DB after: ${JSON.stringify(rows[0])}`);

  // Post-enrich rescore
  log("\nPost-enrich rescore…");
  await rescoreOnly();
}

main()
  .catch(err => { log(`FATAL: ${err.message}\n${err.stack}`); process.exit(1); })
  .finally(() => pool.end());
