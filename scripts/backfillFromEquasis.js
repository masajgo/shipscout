"use strict";

/**
 * backfillFromEquasis.js
 *
 * vessels tablosunda built_year IS NULL veya flag IS NULL olan IMO'ları
 * Equasis'ten enriche eder. Aynı anda hem vessel specs hem owner/manager çeker.
 *
 * Her IMO için güncellenen alanlar:
 *   vessels  → built_year, age, flag, gross_tonnage, type_specific, manager_name,
 *              ldt (hesaplanan), scrap_value_usd, scrap_score, scrap_category
 *   owners   → imo, vessel_name, owner_name, manager_name, ism_manager,
 *              source='equasis', equasis_fetched_at
 *
 * Kullanım:
 *   node scripts/backfillFromEquasis.js             # 20 gemi (test)
 *   node scripts/backfillFromEquasis.js --limit=150 # günlük batch
 *   node scripts/backfillFromEquasis.js --rescore   # sadece scrap_score yeniden hesapla
 */

const path     = require("path");
const fs       = require("fs");
const { Pool } = require("pg");
const { chromium } = require("playwright");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { login, getOwner } = require("../scraper/equasisOwner");
const { computeScrapScore, scrapCategory } = require("../scraper/builtYearEnrichment");

// ─── Config ───────────────────────────────────────────────────────────────────

const DAILY_LIMIT    = 200;
const DELAY_MIN_MS   = 6000;
const DELAY_MAX_MS   = 8000;
const SCRAP_PRICE    = 450;   // USD/LDT — Alang/Chittagong güncel benchmark
const LDT_COEFF      = 0.22;  // dwt → ldt tahmini katsayısı (genel cargo/bulk)

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
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 15_000,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

// ─── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const RESCORE = args.includes("--rescore");
const limitArg = args.find(a => a.startsWith("--limit=")) || args[args.indexOf("--limit") + 1];
const LIMIT   = parseInt(limitArg) || 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() {
  return sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
}
function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ─── Günlük kullanım (equasisOwner.js ile paylaşımlı dosya) ──────────────────

function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return { date: todayStr(), count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    return u.date !== todayStr() ? { date: todayStr(), count: 0 } : u;
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

// ─── Scrap value hesaplama ────────────────────────────────────────────────────

function calcScrapValue(existingLdt, existingDwt) {
  const ldt = existingLdt || (existingDwt ? Math.round(existingDwt * LDT_COEFF) : null);
  if (!ldt || ldt < 500) return { ldt: null, scrapValueUsd: null, estimated: false };
  return {
    ldt,
    scrapValueUsd: Math.round(ldt * SCRAP_PRICE),
    estimated: !existingLdt,
  };
}

// ─── DB: candidate listesi ────────────────────────────────────────────────────

async function getCandidates(limit) {
  const { rows } = await pool.query(`
    SELECT
      v.mmsi::text,
      v.imo::text,
      v.built_year,
      v.flag,
      v.speed,
      v.nav_status,
      v.deadweight,
      v.ldt,
      COALESCE(o.owner_name, '') as existing_owner
    FROM vessels v
    LEFT JOIN owners o ON o.imo = v.imo
    WHERE v.imo IS NOT NULL
      AND v.imo BETWEEN 1000000 AND 9999999
      AND (v.built_year IS NULL OR v.flag IS NULL)
    ORDER BY v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [limit]);
  return rows;
}

// ─── DB: vessels UPDATE ───────────────────────────────────────────────────────

async function updateVessel(row, parsed) {
  const currentYear = new Date().getFullYear();
  const builtYear   = parsed.builtYear ? parseInt(parsed.builtYear) : null;
  const age         = builtYear ? currentYear - builtYear : null;

  // Gross tonnage'ı sayıya çevir (Equasis bazen "12,345" verir)
  const grossTonnage = parsed.gross
    ? parseInt(String(parsed.gross).replace(/[^\d]/g, "")) || null
    : null;

  // Scrap value: mevcut ldt varsa onu kullan, yoksa dwt*0.22
  const existingLdt = row.ldt ? parseInt(row.ldt) : null;
  const existingDwt = row.deadweight ? parseInt(row.deadweight) : null;
  const { ldt: calcLdt, scrapValueUsd, estimated } = calcScrapValue(existingLdt, existingDwt);

  // Scrap score (age + flag + navStatus)
  const { score } = computeScrapScore({
    builtYear,
    flag:      parsed.flag   || row.flag || null,
    speed:     parseFloat(row.speed)    || 0,
    navStatus: parseInt(row.nav_status) || 0,
  });
  const category = scrapCategory(score);

  const { rowCount } = await pool.query(`
    UPDATE vessels SET
      built_year            = COALESCE(built_year,    $1::int4),
      age                   = COALESCE(age,           $2::int4),
      flag                  = COALESCE(flag,          NULLIF($3, '')),
      gross_tonnage         = COALESCE(gross_tonnage, $4::int4),
      type_specific         = COALESCE(type_specific, NULLIF($5, '')),
      manager_name          = COALESCE(manager_name,  NULLIF($6, '')),
      ldt                   = COALESCE(ldt,           $7::int4),
      ldt_estimated         = COALESCE(ldt_estimated, $8),
      scrap_value_usd       = COALESCE(scrap_value_usd, $9::float8),
      scrap_value_estimated = COALESCE(scrap_value_estimated, $10),
      scrap_score           = $11::int4,
      scrap_category        = $12,
      updated_at            = NOW()
    WHERE imo = $13::bigint
  `, [
    builtYear,                   // 1
    age,                          // 2
    parsed.flag   || null,       // 3
    grossTonnage,                 // 4
    parsed.shipType || null,     // 5
    parsed.managerName || null,  // 6
    calcLdt       || null,       // 7
    estimated,                    // 8
    scrapValueUsd || null,       // 9
    estimated,                    // 10
    score,                        // 11
    category,                     // 12
    row.imo,                      // 13
  ]);
  return { rowCount, builtYear, age, grossTonnage, score, category, calcLdt, scrapValueUsd };
}

// ─── DB: owners UPSERT ────────────────────────────────────────────────────────

async function upsertOwner(imo, parsed) {
  if (!parsed.ownerName && !parsed.managerName) return;

  await pool.query(`
    INSERT INTO owners (imo, vessel_name, owner_name, manager_name, ism_manager, source, equasis_fetched_at, fetched_at)
    VALUES ($1::bigint, $2, $3, $4, $5, 'equasis', NOW(), NOW())
    ON CONFLICT (imo) DO UPDATE SET
      owner_name          = COALESCE(NULLIF(EXCLUDED.owner_name,   ''), owners.owner_name),
      manager_name        = COALESCE(NULLIF(EXCLUDED.manager_name, ''), owners.manager_name),
      ism_manager         = COALESCE(NULLIF(EXCLUDED.ism_manager,  ''), owners.ism_manager),
      vessel_name         = COALESCE(NULLIF(EXCLUDED.vessel_name,  ''), owners.vessel_name),
      equasis_fetched_at  = NOW()
  `, [
    imo,
    parsed.shipName   || null,
    parsed.ownerName  || null,
    parsed.managerName || null,
    parsed.ismManager || null,
  ]);
}

// ─── Rescore: toplu batch UPDATE ─────────────────────────────────────────────

const RESCORE_BATCH = 200;

async function rescoreOnly() {
  log("Rescore: built_year IS NOT NULL AND scrap_score IS NULL olan gemiler…");
  const { rows } = await pool.query(`
    SELECT mmsi::text, built_year, flag, speed, nav_status
    FROM   vessels
    WHERE  built_year IS NOT NULL
      AND  (scrap_score IS NULL OR scrap_score = 0)
    LIMIT  10000
  `);
  if (!rows.length) { log("Rescore: yapılacak bir şey yok."); return; }
  log(`${rows.length} vessel rescoring (batch ${RESCORE_BATCH})…`);

  const scored = rows.map(r => {
    const { score } = computeScrapScore({
      builtYear:  r.built_year,
      flag:       r.flag,
      speed:      parseFloat(r.speed) || 0,
      navStatus:  parseInt(r.nav_status) || 0,
    });
    return { mmsi: r.mmsi, score, category: scrapCategory(score) };
  });

  let updated = 0;
  for (let i = 0; i < scored.length; i += RESCORE_BATCH) {
    const batch  = scored.slice(i, i + RESCORE_BATCH);
    const params = [];
    const vals   = batch.map((r, j) => {
      params.push(r.mmsi, r.score, r.category);
      return `($${j * 3 + 1}::bigint, $${j * 3 + 2}::int4, $${j * 3 + 3})`;
    });
    await pool.query(`
      UPDATE vessels AS v SET
        scrap_score    = t.score,
        scrap_category = t.cat,
        updated_at     = NOW()
      FROM (VALUES ${vals.join(",")}) AS t(mmsi, score, cat)
      WHERE v.mmsi = t.mmsi
    `, params);
    updated += batch.length;
    process.stdout.write(`\r  rescored ${updated}/${scored.length}`);
  }
  process.stdout.write("\n");
  log(`Rescore done: ${updated} vessels updated`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (RESCORE) { await rescoreOnly(); return; }

  const usageNow     = loadUsage();
  const remaining    = DAILY_LIMIT - usageNow.count;
  if (remaining <= 0) {
    log(`Günlük limit doldu (${usageNow.count}/${DAILY_LIMIT}). Yarın devam.`);
    process.exit(1);
  }
  const effectiveLimit = Math.min(LIMIT, remaining);
  log(`=== Equasis Backfill ===`);
  log(`Limit: ${effectiveLimit} | Bugün kullanılan: ${usageNow.count}/${DAILY_LIMIT} | Kalan: ${remaining}`);

  const candidates = await getCandidates(effectiveLimit);
  log(`${candidates.length} candidate (built_year IS NULL OR flag IS NULL)`);
  if (!candidates.length) { log("Yapılacak bir şey yok."); return; }

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

      if (loadUsage().count >= DAILY_LIMIT) {
        log("Günlük limit doldu — duruyorum.");
        blocked = true;
        break;
      }

      log(`[${i + 1}/${candidates.length}] IMO ${row.imo} (MMSI ${row.mmsi}) …`);

      if (i > 0) await randomDelay();

      try {
        let result;
        try {
          result = await getOwner(page, parseInt(row.imo));
        } catch (sessErr) {
          if (sessErr.message !== "EQUASIS_SESSION_EXPIRED") throw sessErr;
          log("  Session expired → re-login…");
          await login(page);
          result = await getOwner(page, parseInt(row.imo));
        }
        incrementUsage();

        // Parse ettiğimiz alanları normalize et
        const parsed = {
          builtYear:   result.builtYear  || null,
          flag:        result.flag       || null,
          gross:       result.gross      || null,
          shipType:    result.shipType   || null,
          shipName:    result.shipName   || null,
          ownerName:   result.ownerName  || null,
          managerName: result.managerName || null,
          ismManager:  result.companies?.["ISM Manager"]?.name || null,
        };

        const hasData = parsed.builtYear || parsed.flag || parsed.ownerName || parsed.managerName;
        if (!hasData) {
          skipped++;
          log(`  → no data from Equasis`);
          continue;
        }

        // vessels UPDATE
        const upd = await updateVessel(row, parsed);

        // owners UPSERT
        if (parsed.ownerName || parsed.managerName) {
          await upsertOwner(row.imo, parsed);
        }

        enriched++;
        log(
          `  ✓ year:${parsed.builtYear || "-"} | flag:${parsed.flag || "-"} | ` +
          `gt:${upd.grossTonnage || "-"} | score:${upd.score}(${upd.category})` +
          (upd.scrapValueUsd ? ` | scrap:$${(upd.scrapValueUsd / 1000).toFixed(0)}k` : "") +
          (parsed.ownerName ? ` | owner:${parsed.ownerName.slice(0, 30)}` : "") +
          (parsed.managerName ? ` | mgr:${parsed.managerName.slice(0, 25)}` : "")
        );

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

  // Post-backfill rescore
  if (enriched > 0) {
    log("\nPost-backfill rescore…");
    await rescoreOnly();
  }
}

main()
  .catch(err => { log(`FATAL: ${err.message}`); console.error(err.stack); process.exit(1); })
  .finally(() => pool.end());
