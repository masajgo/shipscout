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

// The login form lives on the public HomePage and POSTs to /authen/HomePage.
const EQUASIS_HOME  = "https://www.equasis.org/EquasisWeb/public/HomePage?fs=HomePage";
const EQUASIS_LOGIN_ACTION = "https://www.equasis.org/EquasisWeb/authen/HomePage?fs=HomePage";
// Ship search endpoint (POST, available once logged in)
const EQUASIS_SHIP_SEARCH = "https://www.equasis.org/EquasisWeb/restricted/Search?fs=Search";

const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 5000;

const DATA_DIR   = path.join(__dirname, "data");
const OWNERS_FILE = path.join(DATA_DIR, "owners.json");
const DEBUG_DIR  = path.join(DATA_DIR, "equasis_debug");

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

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  console.log("[equasis] Navigating to home page…");
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Multiple login forms exist (mobile collapsed + header + access section).
  // The #home-login / #home-password pair in <section id="access"> is reliably
  // visible. Fall back to evaluate() if Playwright considers all hidden.
  await page.waitForSelector('input[name="j_email"]', { timeout: 15000, state: "attached" });

  const filled = await page.evaluate(({ email, pwd }) => {
    // Prefer the access-section form, else the first form containing j_email
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

  // Give it a beat then verify.
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const html = await page.content();
  if (/Your session has expired/i.test(html) || /Invalid e-mail or password/i.test(html)) {
    saveDebugHtml("login_failed", html);
    throw new Error("Login failed — check credentials or selector (saved login_failed.html).");
  }
  // Successful login redirects to a 'restricted' URL or shows "Logout" link
  if (!/logout/i.test(html) && !page.url().includes("restricted") && !page.url().includes("authen")) {
    saveDebugHtml("login_unknown", html);
    console.warn("[equasis] Login state unclear; continuing optimistically.");
  }
  console.log("[equasis] Logged in ✓ url=", page.url());
}

// ─── Fetch one ship ───────────────────────────────────────────────────────────

async function getOwner(page, imo) {
  console.log(`[equasis] Fetching IMO ${imo}…`);

  // Equasis ship lookup: simulate filling the search form on home then submit.
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Fill the IMO/name search bar
  const searchInput = page.locator('input[placeholder*="IMO"]').first();
  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await searchInput.fill(String(imo));

  // Ensure "Ship" checkbox is checked
  const shipCb = page.locator('input#checkbox-ship');
  if (await shipCb.count() > 0) {
    if (!(await shipCb.isChecked().catch(() => false))) {
      await shipCb.check().catch(() => {});
    }
  }

  // Submit the surrounding form
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    searchInput.press("Enter"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // Sometimes we land on a results list — drill into ShipInfo via the formShip POST.
  let html = await page.content();
  saveDebugHtml(`${imo}_search`, html);

  // Equasis results page has a hidden form `formShip` with action ShipInfo and
  // `<a onclick="document.formShip.P_IMO.value='IMO';document.formShip.submit();">`
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
      await page.waitForURL(/ShipInfo/, { timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    }
  }

  // Tiny grace period for any post-load DOM updates
  await sleep(500);
  html = await page.content();
  saveDebugHtml(String(imo), html);
  console.log(`[equasis]   HTML saved → equasis_debug/${imo}.html (${html.length} bytes)`);

  const parsed = parseShipPage(html);
  return {
    imo:       String(imo),
    fetchedAt: new Date().toISOString(),
    ...parsed,
  };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Equasis ShipInfo page parser.
 *
 * Page structure (verified against IMO 9321483):
 *   • Ship basic info — pairs of <b>Label</b> / <div class="col">value</div>
 *     inside the first access-body section. Labels: Flag, Call Sign, MMSI,
 *     Gross tonnage, DWT, Type of ship, Year of build, Status…
 *   • Management table — <table> with thead columns
 *     [IMO, Role, Name of company, Address, Date of effect, Details].
 *     Rows enumerate: Registered owner, ISM Manager, Ship manager/Commercial manager,
 *     Document of Compliance company, Bareboat charterer, etc.
 */
function parseShipPage(html) {
  const $ = cheerio.load(html);
  const out = {
    shipName: null, flag: null, callSign: null, mmsi: null,
    gross: null, deadweight: null, shipType: null, builtYear: null, status: null,
    companies: {}, ownerName: null, ownerAddress: null,
    managerName: null, managerAddress: null,
    docCompanyName: null, docCompanyAddress: null,
  };

  // Ship name lives in the page heading: <h4><b>SHIP NAME</b> - IMO n° <b>NNNNNNN</b></h4>
  // Strategy: find the h4 that mentions "IMO n°" and take its first <b>.
  $('h4').each((_, el) => {
    const txt = $(el).text();
    if (/IMO\s*n[°o]/.test(txt) && !out.shipName) {
      const firstB = $(el).find('b').first().text().trim();
      if (firstB && firstB.length < 60) out.shipName = firstB;
    }
  });

  // Basic info: walk <b>Label</b> elements and grab next sibling .col text.
  $('b').each((_, el) => {
    const label = $(el).text().trim().replace(/\s+/g, " ").replace(/:$/, "");
    if (!label) return;
    // The value sits in the next sibling column (next .col-* div).
    let valueEl = $(el).parent().next('div');
    let value = valueEl.text().trim().replace(/\s+/g, " ");
    // If empty (image-only flag), use parent's row + look for following columns
    if (!value) {
      value = $(el).closest('.row').find('.col-lg-4, .col-md-4, .col-sm-6, .col-xs-6')
        .filter((_, c) => !$(c).find('b').length)
        .first().text().trim().replace(/\s+/g, " ");
    }
    // Cap length to prevent runaway captures
    if (value && value.length > 200) value = value.slice(0, 200);

    const L = label.toLowerCase();
    if (L === "flag") {
      // Flag has 3 columns: label, flag <img>, then "(Country)".
      // The image alt may be empty; the visible "(Country)" sibling is the source of truth.
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

  // Management table — find rows in the management section.
  // Identified by <th data-field="Role">.
  const roleTable = $('th[data-field="Role"]').closest('table');
  if (roleTable.length) {
    roleTable.find('tbody tr').each((_, tr) => {
      const tds = $(tr).find('td').map((_, td) => $(td).text().trim().replace(/\s+/g, " ")).get();
      if (tds.length < 4) return;
      // [IMO_company, Role, Name, Address, Date, (icon)]
      const [companyImo, role, name, address, since] = tds;
      if (!role) return;
      const key = role;
      out.companies[key] = {
        companyImo: companyImo || null,
        name: name || null,
        address: address || null,
        since: since || null,
      };
    });
  }

  // Flatten primary roles for convenience.
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

  // Determine IMO list
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

  console.log(`[equasis] Will fetch ${imos.length} IMO(s): ${imos.slice(0, 5).join(", ")}${imos.length > 5 ? "…" : ""}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const owners = loadOwners();
  let fetched = 0;
  let failed  = 0;

  try {
    await login(page);

    for (const imo of imos) {
      try {
        await randomDelay();
        const result = owners[String(imo)] = await getOwner(page, imo);
        fetched++;
        console.log(`[equasis]   ✓ ${imo} — owner=${result.ownerName || "?"}, manager=${result.managerName || "?"}, flag=${result.flag || "?"}`);
        saveOwners(owners);
      } catch (err) {
        failed++;
        console.error(`[equasis]   ✗ ${imo} — ${err.message}`);
        owners[String(imo)] = { imo: String(imo), error: err.message, fetchedAt: new Date().toISOString() };
        saveOwners(owners);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n[equasis] Done — ${fetched} fetched, ${failed} failed → ${OWNERS_FILE}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error("[equasis] Fatal:", err.message);
    process.exit(1);
  });
}

module.exports = { parseShipPage, login, getOwner };
