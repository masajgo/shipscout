"use strict";

/**
 * enrichOpportunityContacts.js
 *
 * Fırsat gemilerinde owner adı VAR ama email/telefon YOK olanlar için
 * web enrichment çalıştırır.
 *
 * Öncelik: detention>0 + age>20 → survey baskısı → age>=30 → geri kalan
 *
 * Kullanım:
 *   node scripts/enrichOpportunityContacts.js --dry-run --limit=20
 *   node scripts/enrichOpportunityContacts.js --limit=100
 *   node scripts/enrichOpportunityContacts.js --resume          # checkpoint'ten devam
 *   node scripts/enrichOpportunityContacts.js --fresh           # checkpoint sıfırla
 *
 * Güvenlik:
 *   - best_email sadece web'den bulunan GERÇEK email (guessed asla)
 *   - Bulunamazsa DB değişmez (uydurma eklenmez)
 *   - DuckDuckGo'ya 2-3sn delay, her 20 batch'te 10sn pause
 */

const path     = require("path");
const fs       = require("fs");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { enrichCompanyContact, hunterBudget } = require("../scraper/contactEnrichment");

// ─── Config ───────────────────────────────────────────────────────────────────

const DELAY_MIN_MS   = 2000;
const DELAY_MAX_MS   = 3500;
const BATCH_PAUSE_MS = 10_000; // pause every BATCH_SIZE owners
const BATCH_SIZE     = 20;
const LOG_EVERY      = 50;

const CHECKPOINT_FILE = path.join(__dirname, "../checkpoint_opportunity_contacts.json");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  idleTimeoutMillis: 60_000,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

// ─── Args ─────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FRESH   = args.includes("--fresh");
const RESUME  = args.includes("--resume") || !FRESH;
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT   = parseInt(limitArg?.split("=")?.[1] ?? "50", 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
const randomDelay = () => sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
const log = msg => process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${msg}\n`);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms)
    ),
  ]);
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (FRESH || !fs.existsSync(CHECKPOINT_FILE)) return { done: [] };
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8")); }
  catch { return { done: [] }; }
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ─── ISO flag → country name (for maritime-locked search query context) ────────

const FLAG_COUNTRY = {
  PA: "Panama", LR: "Liberia", MH: "Marshall Islands", BS: "Bahamas",
  MT: "Malta", CY: "Cyprus", BZ: "Belize", TO: "Tonga", PW: "Palau",
  AG: "Antigua", KN: "Saint Kitts", VC: "Saint Vincent", TC: "Turks Caicos",
  KM: "Comoros", SL: "Sierra Leone", MG: "Madagascar", TG: "Togo",
  GQ: "Equatorial Guinea", GD: "Grenada", BB: "Barbados",
  TZ: "Tanzania", MZ: "Mozambique", VU: "Vanuatu",
  NO: "Norway", GR: "Greece", DE: "Germany", GB: "United Kingdom",
  CN: "China", JP: "Japan", KR: "South Korea", IN: "India",
  TR: "Turkey", RU: "Russia", IT: "Italy", NL: "Netherlands",
  DK: "Denmark", FR: "France", ES: "Spain", SE: "Sweden",
  SG: "Singapore", HK: "Hong Kong", PH: "Philippines", ID: "Indonesia",
  MY: "Malaysia", VN: "Vietnam", TH: "Thailand", AE: "UAE",
  SA: "Saudi Arabia", IR: "Iran", PK: "Pakistan", EG: "Egypt",
};

function flagToCountry(isoCode) {
  if (!isoCode) return null;
  return FLAG_COUNTRY[isoCode.toUpperCase()] || null;
}

// ─── Batch DB flush ───────────────────────────────────────────────────────────
// Writes up to BATCH_SIZE enrichment results in a single transaction.
// Uses COALESCE so existing data is never overwritten with NULL.

async function flushToDb(pending, cp) {
  if (!pending.length) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { imo, result } of pending) {
      await client.query(`
        UPDATE owners SET
          website              = COALESCE($2, website),
          emails               = COALESCE($3::text[], emails),
          phones               = COALESCE($4::text[], phones),
          address              = COALESCE($5, address),
          email_format         = COALESCE($6, email_format),
          department_emails    = $7::text[],
          generic_emails       = $8::text[],
          guessed_emails       = $9::jsonb,
          linkedin_company_url = $10,
          linkedin_people_url  = $11,
          email_validations    = COALESCE($12::jsonb, email_validations),
          best_email           = COALESCE($13, best_email),
          contact_source       = 'web',
          web_fetched_at       = now()
        WHERE imo = $1::bigint
      `, [
        imo,
        result.website    || null,
        result.emails?.length   ? result.emails   : null,
        result.phones?.length   ? result.phones   : null,
        result.address          || null,
        result.emailFormat      || null,
        result.emailsByType?.department || [],
        result.emailsByType?.generic    || [],
        JSON.stringify(result.guessedEmails || []),
        result.linkedinCompanyUrl,
        result.linkedinPeopleUrl,
        Object.keys(result.emailValidations || {}).length
          ? JSON.stringify(result.emailValidations) : null,
        result.bestEmail || null,
      ]);
      cp.done.push(imo);
    }
    await client.query("COMMIT");
    saveCheckpoint(cp);
    log(`  [flush] ${pending.length} rows committed to DB`);
  } catch (e) {
    await client.query("ROLLBACK");
    log(`  [flush] ROLLBACK — ${e.message}`);
    throw e;
  } finally {
    client.release();
  }
}

// ─── DB: opportunity owner candidates ─────────────────────────────────────────

async function getCandidates(limit, skipImos) {
  const skipClause = skipImos.length
    ? `AND v.imo::text NOT IN (${skipImos.map((_, i) => `$${i + 2}`).join(",")}) `
    : "";

  const { rows } = await pool.query(`
    SELECT
      v.imo::text        AS imo,
      v.name             AS vessel_name,
      v.age,
      v.detention_count,
      v.special_survey_date,
      v.flag,
      o.owner_name,
      o.manager_name,
      o.ism_manager,
      o.web_fetched_at
    FROM vessels v
    INNER JOIN owners o ON o.imo = v.imo
    WHERE v.age >= 20
      AND (
        v.detention_count > 0
        OR (v.special_survey_date BETWEEN NOW() AND NOW() + INTERVAL '6 months')
        OR v.age >= 25
      )
      AND (o.owner_name IS NOT NULL OR o.manager_name IS NOT NULL)
      AND (
        o.best_email IS NULL
        AND (o.emails IS NULL OR array_length(o.emails, 1) IS NULL)
        AND (o.phones IS NULL OR array_length(o.phones, 1) IS NULL)
        AND o.website IS NULL
      )
      AND (o.web_fetched_at IS NULL OR o.web_fetched_at < NOW() - INTERVAL '30 days')
      ${skipClause}
    ORDER BY
      CASE WHEN v.detention_count > 0 AND v.age > 20 THEN 0 ELSE 1 END,
      CASE WHEN v.special_survey_date BETWEEN NOW() AND NOW() + INTERVAL '6 months'
                AND v.age > 20 THEN 0 ELSE 1 END,
      CASE WHEN v.age >= 30 THEN 0 ELSE 1 END,
      v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [limit, ...skipImos]);

  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cp = loadCheckpoint();
  if (FRESH) { cp.done = []; log("Checkpoint cleared."); }

  const hunterKey = process.env.HUNTER_API_KEY;
  const hBudget   = hunterKey ? hunterBudget() : null;
  log(`Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"} | Limit: ${LIMIT} | Already done: ${cp.done.length}${hBudget ? ` | Hunter: ${hBudget.remaining}/${200} credits remaining today` : " | Hunter: disabled (no HUNTER_API_KEY)"}`);

  const candidates = await getCandidates(LIMIT, cp.done);
  log(`Found ${candidates.length} candidates to enrich`);

  if (candidates.length === 0) {
    log("No candidates remaining. Run with --fresh to reset checkpoint.");
    await pool.end();
    return;
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  let processed = 0;
  let foundEmail = 0;
  let foundPhone = 0;
  let foundWebsite = 0;
  let noResult = 0;

  // Live mode: buffer results for batch DB flush every BATCH_SIZE
  const pendingWrites = [];

  for (const row of candidates) {
    const companyName = row.owner_name || row.manager_name || row.ism_manager;
    if (!companyName) { processed++; continue; }

    const managerName = row.manager_name || row.ism_manager || null;
    const flagCountry = flagToCountry(row.flag) || undefined;
    const enrichOpts  = {
      ...(flagCountry ? { flagCountry } : {}),
      ...(process.env.HUNTER_API_KEY ? { hunterApiKey: process.env.HUNTER_API_KEY } : {}),
    };

    log(`[${processed + 1}/${candidates.length}] IMO ${row.imo} — ${companyName} (${row.vessel_name}, age ${row.age}${row.detention_count > 0 ? ", DETAINED" : ""}${flagCountry ? `, ${flagCountry}` : ""})`);

    try {
      const result = await withTimeout(
        enrichCompanyContact(companyName, managerName, enrichOpts),
        45_000,
        companyName
      );

      const gotEmail   = (result.emails?.length > 0) || !!result.bestEmail;
      const gotPhone   = result.phones?.length > 0;
      const gotWebsite = !!result.website;

      if (gotEmail)   foundEmail++;
      if (gotPhone)   foundPhone++;
      if (gotWebsite) foundWebsite++;
      if (!gotEmail && !gotPhone && !gotWebsite) noResult++;

      const summary = [
        gotEmail   ? `email: ${result.bestEmail || result.emails?.[0] || "(dept)"}` : null,
        gotPhone   ? `phone: ${result.phones?.[0]}` : null,
        gotWebsite ? `web: ${result.website}` : null,
      ].filter(Boolean).join(" | ");

      log(`  → ${summary || "nothing found"}`);

      if (!DRY_RUN) pendingWrites.push({ imo: row.imo, result });

    } catch (e) {
      log(`  ✗ Error: ${e.message}`);
      noResult++;
    }

    processed++;

    // Progress log every LOG_EVERY
    if (processed % LOG_EVERY === 0) {
      const pct = candidates.length > 0 ? ((foundEmail / processed) * 100).toFixed(1) : "0";
      log(`── Progress: ${processed} processed | ${foundEmail} email | ${foundPhone} phone | ${foundWebsite} website | email rate ${pct}% ──`);
    }

    // Batch flush every BATCH_SIZE: one transaction → 10s pause
    if (processed % BATCH_SIZE === 0 && processed < candidates.length) {
      if (!DRY_RUN && pendingWrites.length) {
        await flushToDb(pendingWrites.splice(0), cp);
      }
      log(`  [batch pause ${BATCH_PAUSE_MS / 1000}s]`);
      await sleep(BATCH_PAUSE_MS);
    } else {
      await randomDelay();
    }
  }

  // Flush remaining items (last partial batch)
  if (!DRY_RUN && pendingWrites.length) {
    await flushToDb(pendingWrites.splice(0), cp);
  }

  // ── Final report ─────────────────────────────────────────────────────────────
  const emailPct = processed > 0 ? ((foundEmail / processed) * 100).toFixed(1) : "0";
  const websitePct = processed > 0 ? ((foundWebsite / processed) * 100).toFixed(1) : "0";

  log("");
  log("═══════════════════════════════════════");
  log(`  Processed  : ${processed}`);
  log(`  Email found: ${foundEmail} (${emailPct}%)`);
  log(`  Phone found: ${foundPhone}`);
  log(`  Website    : ${foundWebsite} (${websitePct}%)`);
  log(`  No result  : ${noResult}`);
  log(`  Mode       : ${DRY_RUN ? "DRY RUN — nothing written to DB" : "LIVE — DB updated"}`);
  log("═══════════════════════════════════════");

  await pool.end();
}

main().catch(e => {
  console.error("Fatal:", e.message);
  pool.end();
  process.exit(1);
});
