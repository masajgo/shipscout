"use strict";

/**
 * equasisOwner.js  —  Equasis ship ownership scraper (skeleton)
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

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

// ─── Config ───────────────────────────────────────────────────────────────────

const EMAIL    = process.env.EQUASIS_EMAIL;
const PASSWORD = process.env.EQUASIS_PASSWORD;

const EQUASIS_LOGIN = "https://www.equasis.org/EquasisWeb/public/Login";
const EQUASIS_SHIP  = "https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=Search";

const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 5000;

const DATA_DIR   = path.join(__dirname, "data");
const OWNERS_FILE = path.join(DATA_DIR, "owners.json");
const DEBUG_DIR  = path.join(DATA_DIR, "equasis_debug");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
  const ms = DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
  return sleep(ms);
}

function loadOwners() {
  if (!fs.existsSync(OWNERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(OWNERS_FILE, "utf8"));
}

function saveOwners(owners) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OWNERS_FILE, JSON.stringify(owners, null, 2));
}

function saveDebugHtml(imo, html) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  fs.writeFileSync(path.join(DEBUG_DIR, `${imo}.html`), html);
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(page) {
  console.log("[equasis] Navigating to login page…");
  await page.goto(EQUASIS_LOGIN, { waitUntil: "domcontentloaded", timeout: 30000 });

  // TODO: fill in correct selectors after seeing the login page HTML
  await page.fill('input[name="j_email"]',    EMAIL);
  await page.fill('input[name="j_password"]', PASSWORD);
  await page.click('input[type="submit"]');

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });

  const url = page.url();
  if (url.includes("Login") || url.includes("login")) {
    throw new Error("Login failed — still on login page. Check credentials or selector.");
  }
  console.log("[equasis] Logged in ✓");
}

// ─── Fetch one ship ───────────────────────────────────────────────────────────

async function getOwner(page, imo) {
  console.log(`[equasis] Fetching IMO ${imo}…`);

  // Equasis ship info URL — POST form with IMO number
  await page.goto(EQUASIS_SHIP, { waitUntil: "domcontentloaded", timeout: 30000 });

  // TODO: fill correct search form selectors after seeing the page HTML
  // Placeholder: fill IMO search field and submit
  await page.fill('input[name="P_IMO"]', String(imo));
  await page.click('input[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  const html = await page.content();
  saveDebugHtml(imo, html);
  console.log(`[equasis]   HTML saved → equasis_debug/${imo}.html (${html.length} bytes)`);

  // TODO: parse owner/manager/flag/gross from HTML
  // Returning raw HTML length for now so we can inspect the debug file
  return {
    imo:       String(imo),
    fetchedAt: new Date().toISOString(),
    _debug:    `html saved, parse not yet implemented (${html.length} bytes)`,
  };
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
    // Fall back: pick IMOs from vessel_age_cache.json that aren't in owners.json yet
    const cacheFile = path.join(DATA_DIR, "vessel_age_cache.json");
    const owners = loadOwners();
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      imos = Object.values(cache)
        .filter(v => v.imo && !owners[String(v.imo)])
        .map(v => Number(v.imo))
        .slice(0, 20); // max 20 per run to stay safe
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
        console.log(`[equasis]   ✓ ${imo} — ${JSON.stringify(result)}`);
        saveOwners(owners); // save after each success
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

main().catch(err => {
  console.error("[equasis] Fatal:", err.message);
  process.exit(1);
});
