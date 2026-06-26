"use strict";
/**
 * bulkEnrichAll.js  v4
 *
 * 9xxx IMO'ları enrich eder — 4 çalışan endpoint:
 *   vessel_info                    → built_year, flag, dwt, gt, length, beam, type, callsign, teu
 *   maritime_reports/ownership     → beneficial_owner, commercial_manager, operator, technical_manager
 *   maritime_reports/inspections   → last_inspection_date, detention_count, deficiency_count
 *   maritime_reports/dry_dock_dates → last_dry_dock_date, special_survey_date
 *
 * ÖNCELİK: scrap_score >= 25 önce (ORDER BY scrap_score DESC)
 *
 * Yazar:
 *   vessels            → tüm teknik alanlar + inspection stats + scrap_score/value
 *   owners             → UPSERT owner/manager + fleet stats (sonunda)
 *   company_vessels    → her gemi-şirket ilişkisi (role: owner/manager/operator)
 *
 * Checkpoint: checkpoint_enrich.json
 * Her 200 gemide log satırı basar.
 *
 * Kullanım:
 *   node scripts/bulkEnrichAll.js                # tüm eksik 9xxx
 *   node scripts/bulkEnrichAll.js --limit=100    # ilk 100
 *   node scripts/bulkEnrichAll.js --fresh        # checkpoint sıfırla
 *   node scripts/bulkEnrichAll.js --rescore      # sadece scrap_score yeniden hesapla
 *   node scripts/bulkEnrichAll.js --fleetstats   # sadece fleet istatistiklerini güncelle
 */

const path   = require("path");
const fs     = require("fs");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { computeScrapScore, scrapCategory } = require("../scraper/builtYearEnrichment");

const API_KEY = process.env.DATALASTIC_API_KEY;
const DB_URL  = process.env.DATABASE_URL;

if (!API_KEY) { console.error("DATALASTIC_API_KEY not set"); process.exit(1); }
if (!DB_URL)  { console.error("DATABASE_URL not set");       process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 25,
  idleTimeoutMillis: 60_000,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const BASE    = "https://api.datalastic.com/api/v0";
const REPORTS = "https://api.datalastic.com/api/maritime_reports";

const CONCURRENCY = 20;
const DELAY_MS    = 300;
const LDT_COEFF   = 0.17;
const SCRAP_USD   = 450;

const CHECKPOINT_FILE = path.join(__dirname, "../checkpoint_enrich.json");

// ─── Args ─────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const FRESH      = args.includes("--fresh");
const RESCORE    = args.includes("--rescore");
const FLEETSTATS = args.includes("--fleetstats");
const limitArg   = args.find(a => a.startsWith("--limit="));
const LIMIT      = limitArg ? parseInt(limitArg.split("=")[1]) : 99999;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function dlJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.meta?.success ? j : null;
  } catch { return null; }
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (FRESH) {
    const cp = { done: new Set(), errors: [] };
    saveCheckpoint(cp);
    return cp;
  }
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return { done: new Set(), errors: [] };
    const raw = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
    return { done: new Set(raw.done || []), errors: raw.errors || [] };
  } catch { return { done: new Set(), errors: [] }; }
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
    done:   [...cp.done],
    errors: cp.errors.slice(-100),   // son 100 hata
  }));
}

// ─── DB: candidates ───────────────────────────────────────────────────────────

async function getCandidates(cp) {
  const { rows } = await pool.query(`
    SELECT imo::text, name, mmsi::text, ldt, deadweight, built_year, flag, scrap_score, type_specific
    FROM   vessels
    WHERE  imo IS NOT NULL
      AND  imo BETWEEN 9000000 AND 9999999
      AND  (built_year IS NULL OR flag IS NULL OR type_specific IS NULL
            OR gross_tonnage IS NULL OR manager_name IS NULL)
    ORDER  BY scrap_score DESC NULLS LAST, imo ASC
    LIMIT  $1
  `, [LIMIT]);
  return rows.filter(r => !cp.done.has(r.imo));
}

// ─── Enrich one vessel ────────────────────────────────────────────────────────

async function enrichVessel(row) {
  const { imo, mmsi } = row;

  // Fetch all 4 endpoints in parallel
  let [info, ownershipResp, inspResp, dockResp] = await Promise.all([
    dlJSON(`${BASE}/vessel_info?api-key=${API_KEY}&imo=${imo}`),
    dlJSON(`${REPORTS}/ownership?api-key=${API_KEY}&imo=${imo}`),
    dlJSON(`${REPORTS}/inspections?api-key=${API_KEY}&imo=${imo}`),
    dlJSON(`${REPORTS}/dry_dock_dates?api-key=${API_KEY}&imo=${imo}`),
  ]);

  // MMSI fallback if vessel_info returned nothing
  if (!info && mmsi) {
    const fb = await dlJSON(`${BASE}/vessel_find?api-key=${API_KEY}&mmsi=${mmsi}`);
    if (fb?.data?.length) info = { data: fb.data[0], meta: fb.meta };
  }

  if (!info && !ownershipResp) return "no_data";

  // ── vessel_info fields ──────────────────────────────────────────────────────
  const d = info?.data;
  const year      = new Date().getFullYear();
  const builtYear = d?.year_built  ? parseInt(d.year_built)     : null;
  const age       = builtYear      ? year - builtYear           : null;
  const flag      = d?.country_name                             || null;
  const typeSpec  = d?.type_specific                            || null;
  const grossTon  = d?.gross_tonnage ? parseInt(d.gross_tonnage) : null;
  const dwt       = d?.deadweight    ? parseInt(d.deadweight)    : null;
  const loa       = d?.length        ? parseFloat(d.length)      : null;
  const beam      = d?.breadth       ? parseFloat(d.breadth)     : null;
  const callsign  = d?.callsign                                 || null;
  const dbMmsi    = d?.mmsi          ? parseInt(d.mmsi)          : null;
  const teu       = d?.teu           ? parseInt(d.teu)           : null;
  const homePort  = d?.home_port                                || null;
  const speedMax  = d?.speed_max     ? parseFloat(d.speed_max)  : null;

  // LDT / scrap value
  const ldt      = row.ldt || (dwt ? Math.round(dwt * LDT_COEFF) : null);
  const scrapUsd = ldt ? Math.round(ldt * SCRAP_USD) : null;
  const estimated = !row.ldt && !!ldt;

  // Scrap score
  let scrapScore = null, scrapCat = null;
  if (age !== null) {
    const { score } = computeScrapScore({ builtYear, flag, speed: 0, navStatus: 0 });
    scrapScore = score;
    scrapCat   = scrapCategory(score);
  }

  // ── ownership fields ────────────────────────────────────────────────────────
  const o          = ownershipResp?.data?.[0];
  const ownerName  = o?.beneficial_owner                        || null;
  const ownerCtry  = o?.beneficial_owner_country                || null;
  const ownerImo   = o?.beneficial_owner_imo ? String(o.beneficial_owner_imo) : null;
  const mgr        = o?.commercial_manager || o?.operator       || null;
  const mgrCtry    = o?.commercial_manager_country || o?.operator_country || null;
  const mgrImo     = o?.commercial_manager_imo || o?.operator_imo
                     ? String(o.commercial_manager_imo || o.operator_imo) : null;
  const techMgr    = o?.technical_manager                       || null;
  const operator   = o?.operator                                || null;

  // ── company detail lookup via companies endpoint ────────────────────────────
  // Look up company IMOs to get phone/email/address for the owner + manager
  let ownerDetails = null, mgrDetails = null;
  const companyLookups = await Promise.all([
    ownerImo ? dlJSON(`${REPORTS}/companies?api-key=${API_KEY}&company_imo=${ownerImo}`) : null,
    mgrImo   ? dlJSON(`${REPORTS}/companies?api-key=${API_KEY}&company_imo=${mgrImo}`)   : null,
  ]);
  if (companyLookups[0]?.data?.length) ownerDetails = companyLookups[0].data[0];
  if (companyLookups[1]?.data?.length) mgrDetails   = companyLookups[1].data[0];

  // ── inspection stats ────────────────────────────────────────────────────────
  const inspections  = inspResp?.data || [];
  const inspCount    = inspections.length;
  const detentCount  = inspections.filter(i => i.detention === "1" || i.detention === 1).length;
  const defCount     = inspections.reduce((s, i) => s + (parseInt(i.deficiency_count || i.number_of_deficiencies || 0) || 0), 0);
  const lastInspDate = inspections.length
    ? inspections.map(i => i.inspection_date).filter(Boolean).sort().at(-1) || null
    : null;

  // ── dry dock / survey dates ─────────────────────────────────────────────────
  const dock = dockResp?.data?.[0];
  const specialSurveyDate = dock?.special_survey_date || null;
  const lastDryDockDate   = dock?.dry_dock_date       || null;
  const ioppExpDate       = dock?.iopp_exp_date       || null;

  // ── UPDATE vessels ──────────────────────────────────────────────────────────
  await pool.query(`
    UPDATE vessels SET
      built_year       = COALESCE(built_year,      $1::int4),
      age              = COALESCE(age,             $2::int4),
      flag             = COALESCE(flag,            NULLIF($3,'')),
      type_specific    = COALESCE(type_specific,   NULLIF($4,'')),
      gross_tonnage    = COALESCE(gross_tonnage,   $5::int4),
      deadweight       = COALESCE(deadweight,      $6::int4),
      length           = COALESCE(length,          $7::float8),
      beam             = COALESCE(beam,            $8::float8),
      callsign         = COALESCE(callsign,        NULLIF($9,'')),
      mmsi             = COALESCE(mmsi,            $10::bigint),
      teu              = COALESCE(teu,             $11::int4),
      home_port        = COALESCE(home_port,       NULLIF($12,'')),
      speed_max        = COALESCE(speed_max,       $13::float8),
      manager_name     = COALESCE(manager_name,    NULLIF($14,'')),
      ldt              = COALESCE(ldt,             $15::int4),
      ldt_estimated    = COALESCE(ldt_estimated,   $16),
      scrap_value_usd  = COALESCE(scrap_value_usd, $17::int4),
      inspection_count    = GREATEST(COALESCE(inspection_count,0),    $18::int4),
      detention_count     = GREATEST(COALESCE(detention_count,0),     $19::int4),
      scrap_score         = CASE WHEN $20::int4 IS NOT NULL THEN $20::int4 ELSE scrap_score END,
      scrap_category      = CASE WHEN $21::text IS NOT NULL THEN $21::text ELSE scrap_category END,
      special_survey_date = COALESCE(special_survey_date, $23::date),
      dry_dock_date       = COALESCE(dry_dock_date,       $24::date),
      iopp_exp_date       = COALESCE(iopp_exp_date,       $25::date),
      last_inspection_date = COALESCE(last_inspection_date, $26::date),
      deficiency_count    = GREATEST(COALESCE(deficiency_count,0),    $27::int4),
      last_dry_dock_date  = COALESCE(last_dry_dock_date,  $28::date),
      updated_at          = NOW()
    WHERE imo = $22::bigint
  `, [builtYear, age, flag, typeSpec, grossTon, dwt, loa, beam, callsign, dbMmsi,
      teu, homePort, speedMax, mgr || techMgr,
      ldt, estimated, scrapUsd,
      inspCount, detentCount,
      scrapScore, scrapCat,
      imo,
      specialSurveyDate, lastDryDockDate, ioppExpDate,
      lastInspDate, defCount, lastDryDockDate]);

  // ── UPSERT owners ───────────────────────────────────────────────────────────
  const primaryOwner = ownerName || mgr;
  if (primaryOwner) {
    // Merge contact info: prefer owner details, fall back to manager details
    const cd = ownerDetails || mgrDetails;
    const compPhone   = cd?.phone   || null;
    const compEmail   = cd?.email   || null;
    const compWeb     = cd?.website || null;
    const compAddr    = cd?.address || null;
    const compType    = (ownerDetails || mgrDetails)?.company_type || null;

    await pool.query(`
      INSERT INTO owners (imo, vessel_name, owner_name, manager_name, country,
                          beneficial_owner_imo, manager_imo, company_type,
                          phones, emails, website, address, source, fetched_at)
      VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8,
              CASE WHEN $9::text IS NOT NULL THEN ARRAY[$9::text] ELSE NULL END,
              CASE WHEN $10::text IS NOT NULL THEN ARRAY[$10::text] ELSE NULL END,
              $11, $12, 'datalastic', NOW())
      ON CONFLICT (imo) DO UPDATE SET
        vessel_name          = COALESCE(NULLIF(EXCLUDED.vessel_name,''),          owners.vessel_name),
        owner_name           = COALESCE(NULLIF(EXCLUDED.owner_name,''),           owners.owner_name),
        manager_name         = COALESCE(NULLIF(EXCLUDED.manager_name,''),         owners.manager_name),
        country              = COALESCE(NULLIF(EXCLUDED.country,''),              owners.country),
        beneficial_owner_imo = COALESCE(NULLIF(EXCLUDED.beneficial_owner_imo,''), owners.beneficial_owner_imo),
        manager_imo          = COALESCE(NULLIF(EXCLUDED.manager_imo,''),          owners.manager_imo),
        company_type         = COALESCE(NULLIF(EXCLUDED.company_type,''),         owners.company_type),
        phones               = COALESCE(EXCLUDED.phones,                          owners.phones),
        emails               = COALESCE(EXCLUDED.emails,                          owners.emails),
        website              = COALESCE(NULLIF(EXCLUDED.website,''),              owners.website),
        address              = COALESCE(NULLIF(EXCLUDED.address,''),              owners.address)
    `, [imo, d?.name || o?.vessel_name || null,
        ownerName, mgr || techMgr,
        ownerCtry || mgrCtry,
        ownerImo, mgrImo, compType,
        compPhone, compEmail, compWeb, compAddr]);
  }

  // ── company_vessels: insert one row per unique company role ─────────────────
  const roles = [];
  if (ownerName)                              roles.push([ownerName, "owner"]);
  if (mgr && mgr !== ownerName)               roles.push([mgr, "manager"]);
  if (operator && operator !== mgr && operator !== ownerName) roles.push([operator, "operator"]);
  if (techMgr && !roles.find(([n]) => n === techMgr))        roles.push([techMgr, "technical_manager"]);

  for (const [company, role] of roles) {
    if (!company) continue;
    await pool.query(`
      INSERT INTO company_vessels (company_name, imo, vessel_name, vessel_type, year_built, flag, deadweight, scrap_score, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (company_name, imo) DO UPDATE SET
        vessel_name = COALESCE(EXCLUDED.vessel_name, company_vessels.vessel_name),
        vessel_type = COALESCE(EXCLUDED.vessel_type, company_vessels.vessel_type),
        year_built  = COALESCE(EXCLUDED.year_built,  company_vessels.year_built),
        flag        = COALESCE(EXCLUDED.flag,         company_vessels.flag),
        deadweight  = COALESCE(EXCLUDED.deadweight,   company_vessels.deadweight),
        scrap_score = COALESCE(EXCLUDED.scrap_score,  company_vessels.scrap_score),
        role        = EXCLUDED.role
    `, [company, imo, d?.name || o?.vessel_name || null,
        typeSpec, builtYear, flag,
        dwt || row.deadweight || null,
        scrapScore || row.scrap_score || null,
        role]);
  }

  return {
    ownerFilled:   !!(ownerName || mgr),
    drydockFilled: !!(lastDryDockDate || specialSurveyDate),
  };
}

// ─── Fleet stats update ───────────────────────────────────────────────────────

async function updateFleetStats() {
  log("Updating fleet stats on owners…");
  const { rowCount } = await pool.query(`
    UPDATE owners SET
      fleet_count         = (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name),
      fleet_avg_age       = (SELECT ROUND(AVG(2026 - cv.year_built)::numeric, 1) FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.year_built IS NOT NULL),
      fleet_total_dwt     = (SELECT SUM(cv.deadweight) FROM company_vessels cv WHERE cv.company_name = owners.owner_name),
      fleet_critical_count= (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.scrap_score >= 50),
      fleet_high_count    = (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.scrap_score >= 38),
      last_enriched_at    = NOW()
    WHERE owner_name IS NOT NULL
  `);
  log(`Fleet stats updated: ${rowCount} owner records.`);

  // Also update by manager_name
  const { rowCount: rc2 } = await pool.query(`
    UPDATE owners SET
      fleet_count         = GREATEST(fleet_count, (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.manager_name)),
      fleet_total_dwt     = GREATEST(COALESCE(fleet_total_dwt,0), COALESCE((SELECT SUM(cv.deadweight) FROM company_vessels cv WHERE cv.company_name = owners.manager_name),0)),
      last_enriched_at    = NOW()
    WHERE manager_name IS NOT NULL AND fleet_count = 0
  `);
  log(`Fleet stats (manager fallback): ${rc2} records updated.`);
}

// ─── Rescore-only ─────────────────────────────────────────────────────────────

async function rescoreOnly() {
  log("Rescoring vessels with built_year but missing/zero scrap_score…");
  const { rows } = await pool.query(`
    SELECT mmsi::text, built_year, flag FROM vessels
    WHERE built_year IS NOT NULL AND (scrap_score IS NULL OR scrap_score = 0)
    LIMIT 50000
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
      return `($${j * 3 + 1}::bigint, $${j * 3 + 2}::int4, $${j * 3 + 3}::text)`;
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

// ─── Concurrent worker pool ───────────────────────────────────────────────────

async function runPool(candidates, cp) {
  let idx = 0, enriched = 0, noData = 0, errors = 0;
  let ownerFilled = 0, drydockFilled = 0;
  const total = candidates.length;
  let lastSave = Date.now();
  const startTime = Date.now();

  async function worker() {
    while (idx < total) {
      const row = candidates[idx++];
      try {
        const result = await enrichVessel(row);
        if (result === "no_data") noData++;
        else {
          enriched++;
          if (result.ownerFilled)   ownerFilled++;
          if (result.drydockFilled) drydockFilled++;
        }
        cp.done.add(row.imo);
      } catch (err) {
        errors++;
        cp.errors.push({ imo: row.imo, msg: err.message.slice(0, 120), ts: new Date().toISOString() });
        if (errors <= 5) log(`  ERR ${row.imo}: ${err.message.slice(0, 80)}`);
      }

      const done = enriched + noData + errors;
      process.stdout.write(`\r  ${done}/${total} enriched=${enriched} no_data=${noData} errors=${errors}  `);

      if (done % 100 === 0 && done > 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const rate    = Math.round(done / elapsed * 60);
        process.stdout.write("\n");
        log(`[${new Date().toTimeString().slice(0,5)}] ${done.toLocaleString()}/${total.toLocaleString()} | enriched=${enriched} no_data=${noData} errors=${errors} | dolu owner: ${ownerFilled} | dolu drydock: ${drydockFilled} | ~${rate}/min`);
      }

      if (Date.now() - lastSave > 30000) {
        saveCheckpoint(cp);
        lastSave = Date.now();
      }

      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stdout.write("\n");
  saveCheckpoint(cp);
  return { enriched, noData, errors, ownerFilled, drydockFilled };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (RESCORE)    { await rescoreOnly();    return; }
  if (FLEETSTATS) { await updateFleetStats(); return; }

  log("=== Datalastic Bulk Enrich v4 (9xxx IMOs | vessel_info + ownership + inspections + dry_dock_dates) ===");
  log(`Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms | Limit: ${LIMIT} | Fresh: ${FRESH}`);

  const cp = loadCheckpoint();
  log(`Checkpoint: ${cp.done.size} already processed`);

  const candidates = await getCandidates(cp);
  log(`Candidates: ${candidates.length} vessels (9xxx, missing data)`);
  if (!candidates.length) { log("Nothing to do."); return; }

  const start = Date.now();
  const stats = await runPool(candidates, cp);
  const elapsed = Math.round((Date.now() - start) / 1000);

  log(`\n=== Enrich done in ${elapsed}s ===`);
  log(`Enriched: ${stats.enriched} | No data: ${stats.noData} | Errors: ${stats.errors} | Owner dolu: ${stats.ownerFilled} | Drydock dolu: ${stats.drydockFilled}`);

  // DB summary
  const { rows } = await pool.query(`
    SELECT COUNT(*) as total,
      COUNT(built_year) as has_year, COUNT(flag) as has_flag,
      COUNT(type_specific) as has_type, COUNT(gross_tonnage) as has_gt,
      COUNT(manager_name) as has_manager,
      SUM(inspection_count) as total_inspections,
      SUM(detention_count) as total_detentions
    FROM vessels WHERE imo BETWEEN 9000000 AND 9999999
  `);
  log(`9xxx vessels: ${JSON.stringify(rows[0])}`);

  const { rows: cv } = await pool.query(`SELECT COUNT(*) as rows, COUNT(DISTINCT company_name) as companies FROM company_vessels`);
  log(`company_vessels: ${cv[0].rows} rows | ${cv[0].companies} unique companies`);

  log("\nPost-enrich rescore…");
  await rescoreOnly();

  log("\nUpdating fleet stats…");
  await updateFleetStats();
}

main()
  .catch(err => { log(`FATAL: ${err.message}\n${err.stack}`); process.exit(1); })
  .finally(() => pool.end());
