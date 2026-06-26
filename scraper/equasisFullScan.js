"use strict";
/**
 * equasisFullScan.js
 *
 * Tek ziyarette Equasis'ten hem vessel specs hem ownership çeker.
 * Sonuçları doğrudan DB'ye yazar (vessels + owners tabloları).
 *
 * Kullanım:
 *   node scraper/equasisFullScan.js                 # tüm queue
 *   node scraper/equasisFullScan.js --limit=200     # max 200 gemi
 *   node scraper/equasisFullScan.js --imo=9038828   # tek gemi test
 *   node scraper/equasisFullScan.js --dry-run       # DB'ye yazma
 *
 *   caffeinate -i node scraper/equasisFullScan.js   # Mac uyumasın
 *
 * Env: EQUASIS_EMAIL, EQUASIS_PASSWORD, DATABASE_URL
 */

const path       = require("path");
const fs         = require("fs");
const { chromium } = require("playwright");
const cheerio    = require("cheerio");
const { Pool }   = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// ─── Config ───────────────────────────────────────────────────────────────────

const EMAIL    = process.env.EQUASIS_EMAIL;
const PASSWORD = process.env.EQUASIS_PASSWORD;
const DB_URL   = process.env.DATABASE_URL;

if (!EMAIL || !PASSWORD) { console.error("EQUASIS_EMAIL / EQUASIS_PASSWORD eksik"); process.exit(1); }
if (!DB_URL)             { console.error("DATABASE_URL eksik"); process.exit(1); }

const HOURLY_LIMIT  = 50;
const DAILY_LIMIT   = 1000;
const LONG_BREAK_EVERY = 12;          // her 12 işlemde uzun mola

// Her işlem arası bekleme
const DELAY_MIN_MS  = 60_000;         // 60s
const DELAY_MAX_MS  = 90_000;         // 90s
const LONG_MIN_MS   = 180_000;        // 3 dakika
const LONG_MAX_MS   = 300_000;        // 5 dakika

const EQUASIS_HOME = "https://www.equasis.org/EquasisWeb/public/HomePage?fs=HomePage";

const DATA_DIR   = path.join(__dirname, "data");
const USAGE_FILE = path.join(DATA_DIR, "equasis_full_usage.json");
const DEBUG_DIR  = path.join(DATA_DIR, "equasis_debug");

// ─── Args ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const limitArg = args.find(a => a.startsWith("--limit="));
const LIMIT    = limitArg ? parseInt(limitArg.split("=")[1]) : 99999;
const imoArg   = args.find(a => a.startsWith("--imo="));
const SINGLE   = imoArg ? imoArg.split("=")[1] : null;

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: DB_URL,
  max: 5,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOG_FILE = path.join(DATA_DIR, "equasis_full_scan.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(LOG_FILE, line); } catch {}
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rnd(min, max) { return Math.round(min + Math.random() * (max - min)); }
function randomDelay(min = DELAY_MIN_MS, max = DELAY_MAX_MS) { return sleep(rnd(min, max)); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function hourStr()  { return new Date().toISOString().slice(11, 13); } // "HH"

// ─── Usage tracking ───────────────────────────────────────────────────────────

function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return { date: todayStr(), hourly: {}, daily_count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    if (u.date !== todayStr()) return { date: todayStr(), hourly: {}, daily_count: 0 };
    return u;
  } catch { return { date: todayStr(), hourly: {}, daily_count: 0 }; }
}

function saveUsage(u) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
}

function incrementUsage() {
  const u = loadUsage();
  const h = hourStr();
  u.hourly[h] = (u.hourly[h] || 0) + 1;
  u.daily_count = (u.daily_count || 0) + 1;
  saveUsage(u);
  return u;
}

function hourlyCount() {
  const u = loadUsage();
  return u.hourly[hourStr()] || 0;
}

// Bir sonraki saat başına kaç ms kaldı
function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(now.getUTCHours() + 1, 0, 5, 0); // 5s buffer
  return Math.max(0, next - now);
}

// ─── Block detection ──────────────────────────────────────────────────────────

function detectBlock(html) {
  return (
    /rate.?limit|daily.?limit|access.?limit|query.?limit|too many request|maximum number of|quota.?exceed|you have been blocked|your access/i.test(html) ||
    /captcha/i.test(html) ||
    (html.toLowerCase().includes("j_password") && html.toLowerCase().includes("j_email") && !html.toLowerCase().includes("logout"))
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  log("Login: Equasis ana sayfasına gidiliyor…");
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('input[name="j_email"]', { timeout: 15000, state: "attached" });

  const filled = await page.evaluate(({ email, pwd }) => {
    const form = Array.from(document.querySelectorAll("form"))
      .find(f => f.querySelector('input[name="j_email"]'));
    if (!form) return false;
    const e = form.querySelector('input[name="j_email"]');
    const p = form.querySelector('input[name="j_password"]');
    if (!e || !p) return false;
    e.value = email; e.dispatchEvent(new Event("input", { bubbles: true }));
    p.value = pwd;   p.dispatchEvent(new Event("input", { bubbles: true }));
    HTMLFormElement.prototype.submit.call(form);
    return true;
  }, { email: EMAIL, pwd: PASSWORD });

  if (!filled) throw new Error("Login formu bulunamadı");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const html = await page.content();
  if (/invalid e-mail or password|session has expired/i.test(html)) {
    throw new Error("Login başarısız — kimlik bilgileri hatalı");
  }
  log("Login başarılı ✓");
}

// ─── Navigate to ship detail ──────────────────────────────────────────────────

async function navigateToShip(page, imo) {
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });

  const searchInput = page.locator('input[placeholder*="IMO"]').first();
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await searchInput.fill(String(imo));

  const shipCb = page.locator("input#checkbox-ship");
  if (await shipCb.count() > 0 && !(await shipCb.isChecked().catch(() => false))) {
    await shipCb.check().catch(() => {});
  }

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    searchInput.press("Enter"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  let html = await page.content();

  // Session expire?
  const lower = html.toLowerCase();
  if (lower.includes("j_password") && lower.includes("j_email") && !lower.includes("logout")) {
    throw new Error("EQUASIS_SESSION_EXPIRED");
  }
  if (detectBlock(html)) throw new Error("EQUASIS_BLOCK");

  // formShip → ShipInfo sayfasına geç
  const hasShipForm = await page.evaluate(() => !!document.forms.formShip);
  if (hasShipForm) {
    const ok = await page.evaluate((imoStr) => {
      const f = document.forms.formShip;
      const inp = f.querySelector('input[name="P_IMO"]');
      if (!inp) return false;
      inp.value = imoStr;
      HTMLFormElement.prototype.submit.call(f);
      return true;
    }, String(imo));
    if (ok) {
      await page.waitForURL(/restricted\/ShipInfo/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  }

  await sleep(500);
  html = await page.content();
  if (detectBlock(html)) throw new Error("EQUASIS_BLOCK");

  // Debug kaydet
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEBUG_DIR, `${imo}.html`), html);

  return html;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parsePage(html) {
  const $ = cheerio.load(html);
  const specs = {
    shipName: null, imo: null, mmsi: null, callSign: null,
    flag: null, shipType: null, builtYear: null, status: null,
    gross: null, deadweight: null, length: null, beam: null,
  };
  const companies = {};
  const history = [];

  // ── Specs from label→value pairs ──
  $("b").each((_, el) => {
    const label = $(el).text().trim().replace(/\s+/g, " ").replace(/:$/, "");
    if (!label) return;

    let value = $(el).parent().next("div").text().trim().replace(/\s+/g, " ");
    if (!value) {
      value = $(el).closest(".row")
        .find(".col-lg-4,.col-md-4,.col-sm-6,.col-xs-6")
        .filter((_, c) => !$(c).find("b").length)
        .first().text().trim().replace(/\s+/g, " ");
    }
    if (value && value.length > 200) value = value.slice(0, 200);
    const L = label.toLowerCase();

    if (L === "flag") {
      const row = $(el).closest(".row");
      const imgSrc  = row.find("img").attr("src") || "";
      const iso     = imgSrc.match(/\/([A-Z]{3})\.png$/)?.[1];
      const paren   = row.text().match(/\(([^)]+)\)/)?.[1];
      specs.flag = paren?.trim() || iso || value || null;
    } else if (L === "call sign")       specs.callSign  = value || null;
    else if (L === "mmsi")              specs.mmsi      = value || null;
    else if (L === "gross tonnage")     specs.gross     = value.replace(/\(.*$/, "").trim().replace(/\D/g, "") || null;
    else if (L === "dwt")               specs.deadweight= value.replace(/\D/g, "") || null;
    else if (L === "type of ship")      specs.shipType  = value.replace(/\(.*$/, "").trim() || null;
    else if (L === "year of build")     specs.builtYear = value.replace(/\D/g, "").slice(0, 4) || null;
    else if (L === "status")            specs.status    = value || null;
    else if (L === "length overall (m)") specs.length   = value.replace(/\D/g, "") || null;
    else if (L === "breadth moulded (m)") specs.beam    = value.replace(/\D/g, "") || null;
    else if (L === "imo number")        specs.imo       = value.replace(/\D/g, "") || null;
  });

  // Ship name from h4
  $("h4").each((_, el) => {
    const txt = $(el).text();
    if (/IMO\s*n[°o]/i.test(txt) && !specs.shipName) {
      const b = $(el).find("b").first().text().trim();
      if (b && b.length < 60) specs.shipName = b;
    }
  });

  // ── Ownership table ──
  const roleTable = $('th[data-field="Role"]').closest("table");
  if (roleTable.length) {
    roleTable.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td").map((_, td) => $(td).text().trim().replace(/\s+/g, " ")).get();
      if (tds.length < 3) return;
      const [companyImo, role, name, address, since] = tds;
      if (role) companies[role] = { companyImo: companyImo || null, name: name || null, address: address || null, since: since || null };
    });
  }

  // ── Ship history ──
  // Equasis shows history in a table with columns: Name, Flag, From, To
  $("table").each((_, table) => {
    const headers = $(table).find("th").map((_, th) => $(th).text().trim().toLowerCase()).get();
    if (headers.some(h => h.includes("from") || h.includes("previous"))) {
      $(table).find("tbody tr").each((_, tr) => {
        const tds = $(tr).find("td").map((_, td) => $(td).text().trim().replace(/\s+/g, " ")).get();
        if (tds.length >= 2) {
          history.push({ name: tds[0], flag: tds[1], from: tds[2] || null, to: tds[3] || null });
        }
      });
    }
  });

  // Derived ownership fields
  const reg   = companies["Registered owner"];
  const sm    = companies["Ship manager/Commercial manager"]
             || companies["Ship manager"]
             || companies["Commercial manager"];
  const ism   = companies["ISM Manager"] || companies["Document of Compliance Doc Company"];

  return {
    specs,
    companies,
    history,
    ownerName:      reg?.name       || null,
    ownerAddress:   reg?.address    || null,
    ownerSince:     reg?.since      || null,
    managerName:    sm?.name        || null,
    managerAddress: sm?.address     || null,
    ismManager:     ism?.name       || null,
  };
}

// ─── DB writes ────────────────────────────────────────────────────────────────

async function writeVessel(imo, specs) {
  if (DRY_RUN) { log(`  [dry-run] vessels UPSERT IMO ${imo}`); return; }

  const builtYear = specs.builtYear ? parseInt(specs.builtYear) : null;
  const age       = builtYear ? new Date().getFullYear() - builtYear : null;
  const gross     = specs.gross     ? parseInt(specs.gross)      : null;
  const dwt       = specs.deadweight? parseInt(specs.deadweight) : null;
  const length    = specs.length    ? parseFloat(specs.length)   : null;
  const beam      = specs.beam      ? parseFloat(specs.beam)     : null;

  await pool.query(`
    UPDATE vessels SET
      built_year    = COALESCE(built_year,    $1::int4),
      age           = COALESCE(age,           $2::int4),
      flag          = COALESCE(flag,          NULLIF($3,'')),
      type_specific = COALESCE(type_specific, NULLIF($4,'')),
      gross_tonnage = COALESCE(gross_tonnage, $5::int4),
      deadweight    = COALESCE(deadweight,    $6::int4),
      length        = COALESCE(length,        $7::float8),
      beam          = COALESCE(beam,          $8::float8),
      callsign      = COALESCE(callsign,      NULLIF($9,'')),
      updated_at    = NOW()
    WHERE imo = $10::bigint
  `, [builtYear, age, specs.flag, specs.shipType, gross, dwt, length, beam, specs.callSign, imo]);
}

async function writeOwner(imo, vesselName, parsed) {
  if (DRY_RUN) { log(`  [dry-run] owners UPSERT IMO ${imo}`); return; }

  await pool.query(`
    INSERT INTO owners (imo, vessel_name, owner_name, manager_name, ism_manager, address, source, equasis_fetched_at, fetched_at)
    VALUES ($1::bigint, $2, $3, $4, $5, $6, 'equasis', NOW(), NOW())
    ON CONFLICT (imo) DO UPDATE SET
      vessel_name       = COALESCE(NULLIF(EXCLUDED.vessel_name,''),    owners.vessel_name),
      owner_name        = COALESCE(NULLIF(EXCLUDED.owner_name,''),     owners.owner_name),
      manager_name      = COALESCE(NULLIF(EXCLUDED.manager_name,''),   owners.manager_name),
      ism_manager       = COALESCE(NULLIF(EXCLUDED.ism_manager,''),    owners.ism_manager),
      address           = COALESCE(NULLIF(EXCLUDED.address,''),        owners.address),
      equasis_fetched_at= NOW()
  `, [imo, vesselName || parsed.specs.shipName, parsed.ownerName, parsed.managerName, parsed.ismManager, parsed.ownerAddress || parsed.managerAddress]);
}

// ─── Queue: öncelik sırasıyla IMO'lar ────────────────────────────────────────

async function buildQueue() {
  if (SINGLE) return [{ imo: SINGLE, name: "single", scrap_score: 99 }];

  // Daha önce işlenenler: owners.equasis_fetched_at NOT NULL ve 90 günden yeni
  const { rows } = await pool.query(`
    SELECT v.imo::text, v.name, v.scrap_score
    FROM vessels v
    WHERE v.imo IS NOT NULL AND v.imo > 0
      AND NOT EXISTS (
        SELECT 1 FROM owners o
        WHERE o.imo = v.imo
          AND o.equasis_fetched_at > NOW() - INTERVAL '90 days'
          AND o.owner_name IS NOT NULL
      )
    ORDER BY
      CASE WHEN v.scrap_score >= 50 THEN 1
           WHEN v.scrap_score >= 38 THEN 2
           WHEN v.scrap_score >= 25 THEN 3
           WHEN v.last_pos_update > NOW() - INTERVAL '7 days' THEN 4
           ELSE 5
      END,
      v.scrap_score DESC NULLS LAST,
      v.imo ASC
    LIMIT $1
  `, [LIMIT]);
  return rows;
}

// ─── Rate limit: saatlik bekleme ─────────────────────────────────────────────

async function waitIfNeeded(processed) {
  const u = loadUsage();

  // Günlük limit
  if (u.daily_count >= DAILY_LIMIT) {
    log(`Günlük limit doldu (${u.daily_count}/${DAILY_LIMIT}). Çıkılıyor.`);
    return "daily_limit";
  }

  // Saatlik limit
  const hCount = u.hourly[hourStr()] || 0;
  if (hCount >= HOURLY_LIMIT) {
    const waitMs = msUntilNextHour();
    const waitMin = Math.round(waitMs / 60000);
    log(`⏳ Saatlik limit doldu (${hCount}/${HOURLY_LIMIT}). Bir sonraki saate ${waitMin} dakika bekleniyor…`);
    await sleep(waitMs);
    log("Saatlik bekleme bitti, devam ediliyor.");
    return "continued";
  }

  // Her 12 işlemde uzun mola
  if (processed > 0 && processed % LONG_BREAK_EVERY === 0) {
    const ms = rnd(LONG_MIN_MS, LONG_MAX_MS);
    log(`☕ Uzun mola (${Math.round(ms / 1000)}s)…`);
    await sleep(ms);
  } else {
    // Normal bekleme
    const ms = rnd(DELAY_MIN_MS, DELAY_MAX_MS);
    log(`  Bekleniyor ${Math.round(ms / 1000)}s…`);
    await sleep(ms);
  }

  return "ok";
}

// ─── Saatlik rapor ────────────────────────────────────────────────────────────

function printHourlyReport(stats) {
  const u = loadUsage();
  const hCount = u.hourly[hourStr()] || 0;
  log(`\n── RAPOR [${new Date().toTimeString().slice(0,5)}] ─────────────────────────────`);
  log(`  İşlenen: ${stats.processed} | Başarılı: ${stats.ok} | Hata: ${stats.errors} | Blok: ${stats.blocked ? "VAR ⛔" : "yok ✓"}`);
  log(`  Bu saat: ${hCount}/${HOURLY_LIMIT} | Günlük toplam: ${u.daily_count}/${DAILY_LIMIT}`);
  log(`────────────────────────────────────────────────────────\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("=== equasisFullScan başlıyor ===");
  log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"} | Limit: ${LIMIT} | Single: ${SINGLE || "no"}`);
  log(`Saatlik: ${HOURLY_LIMIT} | Günlük: ${DAILY_LIMIT} | Delay: ${DELAY_MIN_MS/1000}-${DELAY_MAX_MS/1000}s`);

  const queue = await buildQueue();
  log(`Queue: ${queue.length} gemi`);
  if (!queue.length) { log("İşlenecek gemi yok."); await pool.end(); return; }

  const initUsage = loadUsage();
  if (initUsage.daily_count >= DAILY_LIMIT) {
    log(`Günlük limit zaten doldu (${initUsage.daily_count}/${DAILY_LIMIT}). Çıkılıyor.`);
    await pool.end(); return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const stats = { processed: 0, ok: 0, errors: 0, blocked: false };
  let lastReportHour = hourStr();

  // Graceful shutdown
  process.on("SIGINT",  () => { stats.blocked = true; });
  process.on("SIGTERM", () => { stats.blocked = true; });

  try {
    await login(page);

    for (let i = 0; i < queue.length && !stats.blocked; i++) {
      const vessel = queue[i];
      const imo    = vessel.imo;

      // Saatlik rapor
      const currentHour = hourStr();
      if (currentHour !== lastReportHour) {
        printHourlyReport(stats);
        lastReportHour = currentHour;
      }

      // Rate limit kontrolü (ilk işlemden sonra bekle)
      if (i > 0) {
        const limitResult = await waitIfNeeded(stats.processed);
        if (limitResult === "daily_limit") break;
      }

      log(`[${i + 1}/${queue.length}] IMO ${imo} ${(vessel.name || "").slice(0, 30)} (score=${vessel.scrap_score ?? "?"})`);

      try {
        const html   = await navigateToShip(page, imo);
        const parsed = parsePage(html);
        stats.processed++;
        incrementUsage();

        // DB yazma
        await writeVessel(imo, parsed.specs);
        await writeOwner(imo, vessel.name, parsed);

        const u = loadUsage();
        const hCount = u.hourly[hourStr()] || 0;
        log(`  ✓ owner=${parsed.ownerName || "?"} | mgr=${parsed.managerName || "?"} | built=${parsed.specs.builtYear || "?"} | flag=${parsed.specs.flag || "?"} | bu saat: ${hCount}/${HOURLY_LIMIT} | günlük: ${u.daily_count}/${DAILY_LIMIT}`);

        if (parsed.history.length) {
          log(`  Tarihçe: ${parsed.history.length} kayıt (${parsed.history.map(h => h.name).filter(Boolean).slice(0,3).join(", ")})`);
        }

        stats.ok++;

      } catch (err) {
        if (err.message.includes("EQUASIS_BLOCK") || err.message.includes("captcha") || err.message.includes("403")) {
          log(`\n⛔ EQUASIS BLOK ALGILANDI: ${err.message}`);
          log(`  ${stats.ok} başarılı, ${stats.errors} hata. Anında duruyorum.`);
          stats.blocked = true;
          break;
        }

        if (err.message.includes("EQUASIS_SESSION_EXPIRED")) {
          log(`  Session expire, yeniden login…`);
          try { await login(page); i--; continue; } catch { stats.blocked = true; break; }
        }

        stats.errors++;
        stats.processed++;
        log(`  ✗ IMO ${imo}: ${err.message.slice(0, 80)}`);
      }
    }

  } finally {
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
  }

  printHourlyReport(stats);
  log(`=== Tamamlandı: ${stats.ok} başarılı, ${stats.errors} hata, blok: ${stats.blocked ? "evet" : "hayır"} ===`);
}

main().catch(err => {
  console.error(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
