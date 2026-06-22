"use strict";

/**
 * dailyOwnerScan.js — Günlük Equasis owner enrichment pipeline
 *
 * Her gün sabah launchd tarafından çağrılır.
 * 1. Equasis günlük limitini kontrol eder (200/gün güvenli)
 * 2. owners tablosunda olmayan critical/high gemileri seçer (9x/8x IMO)
 * 3. equasisOwner → contactEnrichment → Supabase owners UPSERT
 *
 * Usage:
 *   node scraper/dailyOwnerScan.js           # normal çalışma
 *   node scraper/dailyOwnerScan.js --dry-run # sadece ne yapacağını göster
 */

const path      = require("path");
const fs        = require("fs");
const { Pool }  = require("pg");
const { chromium } = require("playwright");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { login, getOwner }    = require("./equasisOwner");
const { enrichWithDb }       = require("./contactEnrichment");

// ─── Config ───────────────────────────────────────────────────────────────────

const DAILY_LIMIT  = 200;      // günlük Equasis arama limiti (güvenli)
const BATCH_SIZE   = 50;       // tek seferde max gemi (launchd günde birden fazla çalışırsa birikmez)
const DELAY_MIN_MS = 5000;
const DELAY_MAX_MS = 8000;

const DATA_DIR   = path.join(__dirname, "data");
const USAGE_FILE = path.join(DATA_DIR, "equasis_usage.json");
const LOG_FILE   = path.join(DATA_DIR, "daily_scan.log");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes("--dry-run");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() {
  return sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch { /* non-fatal */ }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return { date: todayStr(), count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (u.date !== todayStr()) return { date: todayStr(), count: 0 };
    return u;
  } catch { return { date: todayStr(), count: 0 }; }
}

function saveUsage(usage) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function detectBlock(html) {
  return /limit|blocked|too many request|maximum number|quota|exceeded/i.test(html) ||
    (html.toLowerCase().includes("j_password") &&
     html.toLowerCase().includes("j_email") &&
     !html.toLowerCase().includes("logout"));
}

// ─── DB: hedef gemi seçimi ────────────────────────────────────────────────────

async function selectTargetVessels(limit) {
  const { rows } = await pool.query(`
    SELECT v.imo::text AS imo, v.name, v.scrap_score, v.scrap_category
    FROM vessels v
    LEFT JOIN owners o ON o.imo = v.imo::bigint
    WHERE v.scrap_category IN ('critical', 'high')
      AND v.imo >= 8000000
      AND v.imo IS NOT NULL
      AND (
        o.imo IS NULL
        OR o.equasis_fetched_at IS NULL
        OR o.equasis_fetched_at < now() - interval '90 days'
      )
    ORDER BY v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [limit]);
  return rows;
}

// ─── DB: owners UPSERT ────────────────────────────────────────────────────────

async function upsertOwner(entry) {
  await pool.query(`
    INSERT INTO owners
      (imo, vessel_name, owner_name, manager_name, ism_manager,
       website, emails, phones, address, email_format, linkedin_url,
       department_emails, generic_emails, guessed_emails,
       linkedin_company_url, linkedin_people_url,
       contact_source, equasis_fetched_at, web_fetched_at,
       source, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,'equasis',now())
    ON CONFLICT (imo) DO UPDATE SET
      vessel_name          = EXCLUDED.vessel_name,
      owner_name           = EXCLUDED.owner_name,
      manager_name         = EXCLUDED.manager_name,
      ism_manager          = EXCLUDED.ism_manager,
      website              = COALESCE(EXCLUDED.website,              owners.website),
      emails               = COALESCE(EXCLUDED.emails,               owners.emails),
      phones               = COALESCE(EXCLUDED.phones,               owners.phones),
      address              = COALESCE(EXCLUDED.address,              owners.address),
      email_format         = COALESCE(EXCLUDED.email_format,         owners.email_format),
      linkedin_url         = COALESCE(EXCLUDED.linkedin_url,         owners.linkedin_url),
      department_emails    = COALESCE(EXCLUDED.department_emails,    owners.department_emails),
      generic_emails       = COALESCE(EXCLUDED.generic_emails,       owners.generic_emails),
      guessed_emails       = COALESCE(EXCLUDED.guessed_emails,       owners.guessed_emails),
      linkedin_company_url = COALESCE(EXCLUDED.linkedin_company_url, owners.linkedin_company_url),
      linkedin_people_url  = COALESCE(EXCLUDED.linkedin_people_url,  owners.linkedin_people_url),
      contact_source       = COALESCE(EXCLUDED.contact_source,       owners.contact_source),
      equasis_fetched_at   = now(),
      web_fetched_at       = COALESCE(EXCLUDED.web_fetched_at,       owners.web_fetched_at),
      fetched_at           = now()
  `, [
    entry.imo,
    entry.vessel_name        || null,
    entry.owner_name         || null,
    entry.manager_name       || null,
    entry.ism_manager        || null,
    entry.website            || null,
    entry.emails?.length     ? entry.emails  : null,
    entry.phones?.length     ? entry.phones  : null,
    entry.address            || null,
    entry.email_format       || null,
    entry.linkedin_url       || null,
    entry.department_emails?.length ? entry.department_emails : null,
    entry.generic_emails?.length    ? entry.generic_emails    : null,
    entry.guessed_emails?.length    ? JSON.stringify(entry.guessed_emails) : null,
    entry.linkedin_company_url || null,
    entry.linkedin_people_url  || null,
    entry.contact_source       || null,
    entry.web_fetched_at       || null,
  ]);
}

// ─── DB: vessels.manager_name senkronize et ───────────────────────────────────

async function syncManagerName(imo, managerName) {
  if (!managerName) return;
  await pool.query(
    "UPDATE vessels SET manager_name = $1 WHERE imo = $2::bigint AND manager_name IS DISTINCT FROM $1",
    [managerName, imo]
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("=== dailyOwnerScan başladı ===");
  if (isDryRun) log("[DRY-RUN] Gerçek arama yapılmayacak.");

  // 1. Günlük limit kontrolü
  const usage = loadUsage();
  const remaining = DAILY_LIMIT - usage.count;
  log(`Equasis kullanım: bugün ${usage.count}/${DAILY_LIMIT}, kalan: ${remaining}`);

  if (remaining <= 0) {
    log(`Günlük limit doldu (${usage.count}). Yarın devam. Çıkılıyor.`);
    await pool.end();
    return;
  }

  const toFetch = Math.min(remaining, BATCH_SIZE);

  // 2. Hedef gemi seçimi
  const vessels = await selectTargetVessels(toFetch);
  log(`Hedef gemi sayısı: ${vessels.length} (scrap_category: critical/high, IMO >= 8000000)`);

  if (vessels.length === 0) {
    log("İşlenecek yeni gemi yok. Çıkılıyor.");
    await pool.end();
    return;
  }

  if (isDryRun) {
    log("[DRY-RUN] İşlenecek gemiler:");
    vessels.forEach((v, i) =>
      log(`  ${i + 1}. IMO ${v.imo} — ${v.name || "?"} (score: ${v.scrap_score || "?"}, cat: ${v.scrap_category})`)
    );
    log("[DRY-RUN] Tamamlandı. Çıkılıyor.");
    await pool.end();
    return;
  }

  // 3. Playwright başlat
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let found   = 0;
  let skipped = 0;
  let errors  = 0;
  let blocked = false;

  try {
    await login(page);

    for (let i = 0; i < vessels.length; i++) {
      const vessel = vessels[i];
      const currentUsage = loadUsage();

      if (currentUsage.count >= DAILY_LIMIT) {
        log(`Limit doldu (${currentUsage.count}). Duruyorum.`);
        break;
      }

      try {
        await randomDelay();

        // Equasis'ten owner/manager çek
        const ownerData = await getOwner(page, vessel.imo);

        // Blok kontrolü
        if (!ownerData || (ownerData.error && detectBlock(ownerData.error))) {
          log(`EQUASIS BLOK ALGILANDI — ${ownerData?.error}. Duruyorum.`);
          blocked = true;
          break;
        }

        // Sayacı artır
        currentUsage.count++;
        saveUsage(currentUsage);

        // Contact enrichment (DB-first, 30-day TTL)
        const companyForEnrich = ownerData.managerName || ownerData.ownerName;
        let contact = null;
        if (companyForEnrich) {
          try {
            contact = await enrichWithDb(companyForEnrich, vessel.imo, pool, ownerData.managerName);
          } catch (e) {
            log(`  Contact enrichment hatası (${companyForEnrich}): ${e.message}`);
          }
        }

        // owners tablosuna UPSERT
        const entry = {
          imo:                 vessel.imo,
          vessel_name:         ownerData.shipName || vessel.name || null,
          owner_name:          ownerData.ownerName || null,
          manager_name:        ownerData.managerName || null,
          ism_manager:         ownerData.companies?.["ISM Manager"]?.name || null,
          website:             contact?.website || null,
          emails:              contact?.emails || [],
          phones:              contact?.phones || [],
          address:             contact?.address || ownerData.ownerAddress || ownerData.managerAddress || null,
          email_format:        contact?.emailFormat || null,
          linkedin_url:        contact?.linkedinSearchUrl || null,
          department_emails:   contact?.emailsByType?.department || [],
          generic_emails:      contact?.emailsByType?.generic    || [],
          guessed_emails:      contact?.guessedEmails || [],
          linkedin_company_url: contact?.linkedinCompanyUrl || null,
          linkedin_people_url:  contact?.linkedinPeopleUrl  || null,
          contact_source:      contact?.source || null,
          web_fetched_at:      contact?.source === "db" ? undefined : (contact ? new Date().toISOString() : null),
        };
        await upsertOwner(entry);

        // vessels.manager_name senkronize et
        await syncManagerName(vessel.imo, ownerData.managerName);

        const hasContact = contact && (contact.emails?.length > 0 || contact.website);
        if (ownerData.ownerName || ownerData.managerName) found++;
        else skipped++;

        log(`[${i + 1}/${vessels.length}] ✓ IMO ${vessel.imo} — owner=${ownerData.ownerName || "?"}, manager=${ownerData.managerName || "?"}, contact=${hasContact ? "✓" : "—"} | bugün: ${currentUsage.count}/${DAILY_LIMIT}`);

      } catch (err) {
        errors++;
        log(`[${i + 1}/${vessels.length}] ✗ IMO ${vessel.imo} — ${err.message}`);
      }
    }

  } finally {
    await browser.close();
  }

  await pool.end();

  const finalUsage = loadUsage();
  if (blocked) {
    log(`=== BLOK NEDENİYLE DURULDU — ${found} owner bulundu, ${skipped} boş, ${errors} hata | bugün: ${finalUsage.count}/${DAILY_LIMIT} ===`);
  } else {
    log(`=== Tamamlandı — ${found} owner bulundu, ${skipped} boş, ${errors} hata | bugün: ${finalUsage.count}/${DAILY_LIMIT} (kalan: ${DAILY_LIMIT - finalUsage.count}) ===`);
  }
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
