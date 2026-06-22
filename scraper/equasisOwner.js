"use strict";

/**
 * equasisOwner.js  —  Equasis ship ownership scraper
 *
 * Usage:
 *   node scraper/equasisOwner.js [IMO...]
 *   node scraper/equasisOwner.js 9321483 9461978
 *
 * If no IMO args supplied, reads from scraper/data/vessel_age_cache.json
 * and processes vessels that have an IMO but no entry in owners.json yet.
 *
 * Output: scraper/data/owners.json  { [imo]: { ...ownerData } }
 *
 * Env (loaded from .env.local):
 *   EQUASIS_EMAIL
 *   EQUASIS_PASSWORD
 */

const path       = require("path");
const fs         = require("fs");
const { chromium } = require("playwright");
const cheerio    = require("cheerio");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// ─── Config ───────────────────────────────────────────────────────────────────

const EMAIL    = process.env.EQUASIS_EMAIL;
const PASSWORD = process.env.EQUASIS_PASSWORD;

const EQUASIS_HOME  = "https://www.equasis.org/EquasisWeb/public/HomePage?fs=HomePage";
const EQUASIS_LOGIN_ACTION = "https://www.equasis.org/EquasisWeb/authen/HomePage?fs=HomePage";
const EQUASIS_SHIP_SEARCH = "https://www.equasis.org/EquasisWeb/restricted/Search?fs=Search";

// 5-8 sn rastgele aralık (bot gibi görünmesin)
const DELAY_MIN_MS = 5000;
const DELAY_MAX_MS = 8000;

// Günlük güvenli limit (Equasis 300-500 arası, 250 ile güvende kalıyoruz)
const DAILY_LIMIT = 250;

const DATA_DIR    = path.join(__dirname, "data");
const OWNERS_FILE = path.join(DATA_DIR, "owners.json");
const USAGE_FILE  = path.join(DATA_DIR, "equasis_usage.json");
const DEBUG_DIR   = path.join(DATA_DIR, "equasis_debug");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay() {
  const ms = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
  return sleep(ms);
}

function loadOwners() {
  if (!fs.existsSync(OWNERS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(OWNERS_FILE, "utf8")); } catch { return {}; }
}

function saveOwners(owners) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OWNERS_FILE, JSON.stringify(owners, null, 2));
}

function saveDebugHtml(name, html) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEBUG_DIR, `${name}.html`), html);
}

// ─── Günlük kullanım takibi ──────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "2026-06-20"
}

function loadUsage() {
  if (!fs.existsSync(USAGE_FILE)) return { date: todayStr(), count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    // Gün değişmişse sıfırla
    if (u.date !== todayStr()) return { date: todayStr(), count: 0 };
    return u;
  } catch { return { date: todayStr(), count: 0 }; }
}

function saveUsage(usage) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
}

function incrementUsage() {
  const usage = loadUsage();
  usage.count++;
  saveUsage(usage);
  return usage;
}

// ─── Equasis blok / limit tespiti ────────────────────────────────────────────

function detectBlock(html) {
  const lower = html.toLowerCase();
  return (
    /limit|blocked|too many request|maximum number|quota|exceeded/i.test(html) ||
    // Login sayfasına geri atılma: restricted sayfada login formu görünmesi
    (lower.includes("j_password") && lower.includes("j_email") && !lower.includes("logout"))
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  console.log("[equasis] Navigating to home page…");
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });

  await page.waitForSelector('input[name="j_email"]', { timeout: 15000, state: "attached" });

  const filled = await page.evaluate(({ email, pwd }) => {
    const candidates = [
      document.querySelector('#home-login')?.closest('form'),
      document.querySelector('#entete-email')?.closest('form'),
      ...Array.from(document.querySelectorAll('form'))
        .filter(f => f.querySelector('input[name="j_email"]')),
    ].filter(Boolean);
    const form = candidates[0];
    if (!form) return false;
    const eInput = form.querySelector('input[name="j_email"]');
    const pInput = form.querySelector('input[name="j_password"]');
    if (!eInput || !pInput) return false;
    eInput.value = email; eInput.dispatchEvent(new Event('input', { bubbles: true }));
    pInput.value = pwd;   pInput.dispatchEvent(new Event('input', { bubbles: true }));
    HTMLFormElement.prototype.submit.call(form);
    return true;
  }, { email: EMAIL, pwd: PASSWORD });

  if (!filled) throw new Error("No login form found on home page");

  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const html = await page.content();
  if (/Your session has expired/i.test(html) || /Invalid e-mail or password/i.test(html)) {
    saveDebugHtml("login_failed", html);
    throw new Error("Login failed — check credentials or selector (saved login_failed.html).");
  }
  if (!/logout/i.test(html) && !page.url().includes("restricted") && !page.url().includes("authen")) {
    saveDebugHtml("login_unknown", html);
    console.warn("[equasis] Login state unclear; continuing optimistically.");
  }
  console.log("[equasis] Logged in ✓ url=", page.url());
}

// ─── Fetch one ship ───────────────────────────────────────────────────────────

async function getOwner(page, imo) {
  console.log(`[equasis] Fetching IMO ${imo}…`);

  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });

  const searchInput = page.locator('input[placeholder*="IMO"]').first();
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await searchInput.fill(String(imo));

  const shipCb = page.locator('input#checkbox-ship');
  if (await shipCb.count() > 0) {
    if (!(await shipCb.isChecked().catch(() => false))) {
      await shipCb.check().catch(() => {});
    }
  }

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    searchInput.press("Enter"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  let html = await page.content();
  saveDebugHtml(`${imo}_search`, html);

  // Blok kontrolü (arama sonuç sayfasında)
  if (detectBlock(html)) {
    throw new Error("EQUASIS_BLOCK: limit veya blok algılandı");
  }

  const hasShipForm = await page.evaluate(() => !!document.forms.formShip);
  if (hasShipForm) {
    const submitted = await page.evaluate((imoStr) => {
      const f = document.forms.formShip;
      const i = f.querySelector('input[name="P_IMO"]');
      if (!i) return false;
      i.value = imoStr;
      HTMLFormElement.prototype.submit.call(f);
      return true;
    }, String(imo));
    if (submitted) {
      await page.waitForURL(/restricted\/ShipInfo/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  }

  await sleep(500);
  html = await page.content();
  saveDebugHtml(String(imo), html);

  // Blok kontrolü (gemi detay sayfasında)
  if (detectBlock(html)) {
    throw new Error("EQUASIS_BLOCK: limit veya blok algılandı");
  }

  console.log(`[equasis]   HTML saved → equasis_debug/${imo}.html (${html.length} bytes)`);

  const parsed = parseShipPage(html);
  return {
    imo:       String(imo),
    fetchedAt: new Date().toISOString(),
    ...parsed,
  };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseShipPage(html) {
  const $ = cheerio.load(html);
  const out = {
    shipName: null, flag: null, callSign: null, mmsi: null,
    gross: null, deadweight: null, shipType: null, builtYear: null, status: null,
    companies: {}, ownerName: null, ownerAddress: null,
    managerName: null, managerAddress: null,
    docCompanyName: null, docCompanyAddress: null,
  };

  $('h4').each((_, el) => {
    const txt = $(el).text();
    if (/IMO\s*n[°o]/.test(txt) && !out.shipName) {
      const firstB = $(el).find('b').first().text().trim();
      if (firstB && firstB.length < 60) out.shipName = firstB;
    }
  });

  $('b').each((_, el) => {
    const label = $(el).text().trim().replace(/\s+/g, " ").replace(/:$/, "");
    if (!label) return;
    let valueEl = $(el).parent().next('div');
    let value = valueEl.text().trim().replace(/\s+/g, " ");
    if (!value) {
      value = $(el).closest('.row').find('.col-lg-4, .col-md-4, .col-sm-6, .col-xs-6')
        .filter((_, c) => !$(c).find('b').length)
        .first().text().trim().replace(/\s+/g, " ");
    }
    if (value && value.length > 200) value = value.slice(0, 200);

    const L = label.toLowerCase();
    if (L === "flag") {
      const row = $(el).closest('.row');
      const countryDiv = row.children('div').filter((_, c) =>
        /\([A-Za-z][A-Za-z\s]+\)/.test($(c).text())
      ).first();
      const countryTxt = countryDiv.text().trim().replace(/\s+/g, " ");
      const parenMatch = countryTxt.match(/\(([^)]+)\)/) || (value || "").match(/\(([^)]+)\)/);
      const imgSrc = row.find('img').attr('src') || "";
      const iso = imgSrc.match(/\/([A-Z]{3})\.png$/)?.[1] || null;
      out.flag = parenMatch ? parenMatch[1].trim() : (iso || value || null);
    } else if (L === "call sign")        out.callSign   = value || null;
    else if (L === "mmsi")               out.mmsi       = value || null;
    else if (L === "gross tonnage")      out.gross      = value.replace(/\(.*$/, "").trim() || null;
    else if (L === "dwt")                out.deadweight = value || null;
    else if (L === "type of ship")       out.shipType   = value.replace(/\(.*$/, "").trim() || null;
    else if (L === "year of build")      out.builtYear  = value.replace(/\D+/g, "").slice(0, 4) || null;
    else if (L === "status")             out.status     = value || null;
  });

  const roleTable = $('th[data-field="Role"]').closest('table');
  if (roleTable.length) {
    roleTable.find('tbody tr').each((_, tr) => {
      const tds = $(tr).find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, " ")).get();
      if (tds.length < 4) return;
      const [companyImo, role, name, address, since] = tds;
      if (!role) return;
      out.companies[role] = {
        companyImo: companyImo || null,
        name: name || null,
        address: address || null,
        since: since || null,
      };
    });
  }

  const owner = out.companies["Registered owner"];
  if (owner) { out.ownerName = owner.name; out.ownerAddress = owner.address; }

  const sm = out.companies["Ship manager/Commercial manager"]
         || out.companies["Ship manager"]
         || out.companies["Commercial manager"]
         || out.companies["ISM Manager"];
  if (sm) { out.managerName = sm.name; out.managerAddress = sm.address; }

  const doc = out.companies["Document of Compliance Doc Company"]
          || out.companies["Document of compliance Doc company"]
          || out.companies["DoC company"];
  if (doc) { out.docCompanyName = doc.name; out.docCompanyAddress = doc.address; }

  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("[equasis] EQUASIS_EMAIL / EQUASIS_PASSWORD not set in .env.local");
    process.exit(1);
  }

  let imos = process.argv.slice(2).map(Number).filter(Boolean);

  if (imos.length === 0) {
    const cacheFile = path.join(DATA_DIR, "vessel_age_cache.json");
    const owners = loadOwners();
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      imos = Object.values(cache)
        .filter(v => v.imo && !owners[String(v.imo)])
        .map(v => Number(v.imo))
        .slice(0, 20);
    }
  }

  if (imos.length === 0) {
    console.log("[equasis] No IMOs to fetch. Pass IMOs as CLI args or populate vessel_age_cache.json.");
    return;
  }

  // Checkpoint: 90 gün içinde işlenmiş IMO'ları atla
  const owners = loadOwners();
  const TTL_90D = 90 * 24 * 60 * 60 * 1000;
  const pending = imos.filter(imo => {
    const row = owners[String(imo)];
    if (!row) return true;
    if (row.error) return true; // retry errors
    const age = row.fetchedAt ? Date.now() - new Date(row.fetchedAt).getTime() : Infinity;
    return age >= TTL_90D;
  });
  const skipped = imos.length - pending.length;
  if (skipped > 0) console.log(`[equasis] ${skipped} IMO 90 gün içinde işlenmiş, atlandı.`);

  if (pending.length === 0) {
    console.log("[equasis] Tüm IMO'lar zaten owners.json'da. Çıkılıyor.");
    return;
  }

  // Günlük limit kontrolü
  const usage = loadUsage();
  const remaining = DAILY_LIMIT - usage.count;
  if (remaining <= 0) {
    console.error(`[equasis] Günlük limit doldu (${usage.count}/${DAILY_LIMIT}). Yarın devam.`);
    process.exit(1);
  }
  const toFetch = pending.slice(0, remaining);
  if (toFetch.length < pending.length) {
    console.warn(`[equasis] Bugün sadece ${toFetch.length}/${pending.length} IMO işlenebilir (günlük limit: ${DAILY_LIMIT}, kullanılan: ${usage.count}).`);
  }

  console.log(`[equasis] İşlenecek: ${toFetch.length} IMO, bugün kullanılan: ${usage.count}/${DAILY_LIMIT}`);
  console.log(`[equasis] İlk 5: ${toFetch.slice(0, 5).join(", ")}${toFetch.length > 5 ? "…" : ""}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let fetched = 0;
  let failed  = 0;
  let blocked = false;

  try {
    await login(page);

    for (let i = 0; i < toFetch.length; i++) {
      const imo = toFetch[i];
      const currentUsage = loadUsage();
      const kalan = DAILY_LIMIT - currentUsage.count;

      try {
        await randomDelay();
        const result = owners[String(imo)] = await getOwner(page, imo);

        // Her IMO işlendikten hemen sonra kaydet (checkpoint)
        saveOwners(owners);
        const u = incrementUsage();
        fetched++;

        console.log(`[equasis] [${i + 1}/${toFetch.length}] ✓ IMO ${imo} — owner=${result.ownerName || "?"}, manager=${result.managerName || "?"}, flag=${result.flag || "?"} | bugün: ${u.count}/${DAILY_LIMIT} (kalan: ${DAILY_LIMIT - u.count})`);

      } catch (err) {
        if (err.message.startsWith("EQUASIS_BLOCK")) {
          console.error(`\n[equasis] ⚠️  EQUASIS BLOK ALGILANDI — ${err.message}`);
          console.error(`[equasis] ${fetched} gemi kaydedildi. Bir süre bekleyip tekrar dene.`);
          blocked = true;
          break;
        }
        failed++;
        console.error(`[equasis]   ✗ IMO ${imo} — ${err.message}`);
        owners[String(imo)] = { imo: String(imo), error: err.message, fetchedAt: new Date().toISOString() };
        saveOwners(owners);
      }
    }
  } finally {
    await browser.close();
  }

  const finalUsage = loadUsage();
  if (blocked) {
    console.log(`\n[equasis] Blok nedeniyle duruldu — ${fetched} başarılı, ${failed} hata | Toplam bugün: ${finalUsage.count}/${DAILY_LIMIT}`);
  } else {
    console.log(`\n[equasis] Tamamlandı — ${fetched} başarılı, ${failed} hata | Toplam bugün: ${finalUsage.count}/${DAILY_LIMIT} (kalan: ${DAILY_LIMIT - finalUsage.count})`);
  }
  console.log(`[equasis] Sonuçlar: ${OWNERS_FILE}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error("[equasis] Fatal:", err.message);
    process.exit(1);
  });
}

module.exports = { parseShipPage, login, getOwner };
