/**
 * snpSignals.js
 * S&P market signal pipeline:
 *   1. Playwright → GRS offshore-vessels-for-sale → vessel names only
 *   2. Datalastic vessel_find → real IMO + specs
 *   3. Equasis → owner company + address
 *   4. Web search → owner email
 *   5. Save to scraper/data/snp_signals.json
 *
 * Run: node scraper/snpSignals.js
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const http = require("https");
const { enrichCompanyContact } = require("./contactEnrichment");

// ─── Env ──────────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const DATALASTIC_KEY  = process.env.DATALASTIC_API_KEY;
const EQUASIS_EMAIL   = process.env.EQUASIS_EMAIL;
const EQUASIS_PASS    = process.env.EQUASIS_PASSWORD;

const DATA_DIR  = path.join(__dirname, "data");
const OUT_FILE  = path.join(DATA_DIR, "snp_signals.json");

const GRS_URL   = "https://grs.group/grs-offshore-renewables/purchase/offshore-vessels-for-sale/offshore-vessels-for-sale-results/";
const DATALASTIC = "https://api.datalastic.com/api/v0";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { "User-Agent": "Mozilla/5.0", ...headers } };
    http.get(url, opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    }).on("error", reject).setTimeout(12000, function() { this.destroy(new Error("timeout")); });
  });
}

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj  = new URL(url);
    const bodyBuf = Buffer.from(body);
    const opts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": bodyBuf.length,
        "User-Agent":     "Mozilla/5.0",
        ...headers,
      },
    };
    const req = http.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    req.setTimeout(12000, () => { req.destroy(new Error("timeout")); });
    req.write(bodyBuf);
    req.end();
  });
}

// ─── Step 1: Playwright → GRS vessel names ────────────────────────────────────

async function scrapeGRSNames() {
  // Auto-install Playwright if needed
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.log("📦 Installing Playwright...");
    require("child_process").execSync("npm install playwright && npx playwright install chromium", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    ({ chromium } = require("playwright"));
  }

  console.log("🌐 Opening GRS offshore vessel listing...");
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });

  await page.goto(GRS_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "Load All Results" to get the full listing
  try {
    const btn = page.locator("a, button").filter({ hasText: /load all results/i }).first();
    if (await btn.isVisible({ timeout: 3000 })) {
      console.log("   Clicking 'Load All Results'...");
      await btn.click();
      await page.waitForTimeout(10000);
    }
  } catch { /* no button visible */ }

  // Extract ONLY the heading text from H3 elements
  // GRS offshore headings: "24M MULTIROLE DIVE SUPPORT VESSEL / #1234567"
  // We take only the descriptive part (vessel name candidate) — not price, not spec block
  const rawNames = await page.evaluate(() => {
    const names = [];
    for (const h3 of document.querySelectorAll("h3")) {
      const text = h3.textContent?.trim() || "";
      // Must contain a GRS listing ID
      if (!/#\d{7}/.test(text)) continue;
      // Strip GRS ID, "for sale", and leading size markers to get the name part
      const cleaned = text
        .replace(/#\d+/g, "")
        .replace(/for sale/gi, "")
        .replace(/^\s*[\d.]+m\s*/i, "")        // leading dimension e.g. "76m"
        .replace(/\s*\/\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
      if (cleaned.length >= 4 && cleaned.length <= 80) {
        names.push(cleaned);
      }
    }
    return names;
  });

  await browser.close();

  const unique = [...new Set(rawNames)].filter(n => n.length >= 4);
  console.log(`✅ Found ${unique.length} vessel name candidates from GRS offshore`);
  return unique;
}

// ─── Step 2: Datalastic vessel_find ──────────────────────────────────────────

async function datalasticFind(name) {
  if (!DATALASTIC_KEY) return null;
  try {
    const url = `${DATALASTIC}/vessel_find?name=${encodeURIComponent(name)}&api-key=${DATALASTIC_KEY}`;
    const res = await httpsGet(url);
    if (res.status !== 200) return null;
    const json = JSON.parse(res.body);
    const matches = json?.data || [];
    if (!matches.length) return null;
    // Prefer exact name match
    return matches.find(m => m.name?.toUpperCase() === name) || matches[0];
  } catch {
    return null;
  }
}

async function datalasticInfo(imo) {
  if (!DATALASTIC_KEY) return null;
  try {
    const url = `${DATALASTIC}/vessel_info?imo=${imo}&api-key=${DATALASTIC_KEY}`;
    const res = await httpsGet(url);
    if (res.status !== 200) return null;
    const json = JSON.parse(res.body);
    return json?.data || null;
  } catch {
    return null;
  }
}

// ─── Step 3a: Equasis owner lookup (Playwright) ───────────────────────────────

let _equasisBrowser = null;
let _equasisContext = null;
let _equasisLoggedIn = false;

async function getEquasisBrowser() {
  if (_equasisBrowser) return _equasisBrowser;
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    require("child_process").execSync("npm install playwright && npx playwright install chromium", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    ({ chromium } = require("playwright"));
  }
  _equasisBrowser = await chromium.launch({ headless: true });
  _equasisContext = await _equasisBrowser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });
  return _equasisBrowser;
}

async function equasisEnsureLogin() {
  if (_equasisLoggedIn) return true;
  if (!EQUASIS_EMAIL || !EQUASIS_PASS ||
      EQUASIS_EMAIL.includes("_equasis_") || EQUASIS_EMAIL === "senin_equasis_emailin") {
    return false;
  }

  try {
    await getEquasisBrowser();
    const page = await _equasisContext.newPage();

    // Set cookie required by Equasis JS check
    await _equasisContext.addCookies([
      { name: "cookiesEnabled", value: "true", domain: "www.equasis.org", path: "/" },
    ]);

    await page.goto("https://www.equasis.org/EquasisWeb/authen/HomePage?fs=HomePage", {
      waitUntil: "networkidle",
      timeout: 20000,
    });

    await page.evaluate(() => {
      document.cookie = "cookiesEnabled=true; path=/";
    });

    // Fill the visible login form (multiple forms on page — find the visible one)
    const emailInputs = await page.locator("input[name='j_email']").all();
    let filled = false;
    for (const input of emailInputs) {
      if (await input.isVisible()) {
        await input.fill(EQUASIS_EMAIL);
        filled = true;
        break;
      }
    }
    if (!filled && emailInputs.length > 0) {
      await emailInputs[0].fill(EQUASIS_EMAIL);
    }

    const passInputs = await page.locator("input[name='j_password']").all();
    let passSet = false;
    for (const input of passInputs) {
      if (await input.isVisible()) {
        await input.fill(EQUASIS_PASS);
        passSet = true;
        break;
      }
    }
    if (!passSet && passInputs.length > 0) {
      await passInputs[0].fill(EQUASIS_PASS);
    }

    // Submit
    const submitBtns = await page.locator("input[type='submit'], button[type='submit']").all();
    let submitted = false;
    for (const btn of submitBtns) {
      if (await btn.isVisible()) {
        await btn.click();
        submitted = true;
        break;
      }
    }
    if (!submitted && submitBtns.length > 0) {
      await submitBtns[0].click();
    }

    await page.waitForTimeout(3000);

    // Check login success
    const navText = await page.evaluate(() => document.body.innerText);
    const loggedIn = navText.includes("Logout") || navText.includes("My Equasis");

    await page.close();

    if (loggedIn) {
      _equasisLoggedIn = true;
      console.log("   ✓ Equasis login OK");
      return true;
    } else {
      console.log("   ✗ Equasis login failed");
      return false;
    }
  } catch (err) {
    console.log("   ✗ Equasis login error:", err.message);
    return false;
  }
}

async function equasisLookup(imo) {
  const ok = await equasisEnsureLogin();
  if (!ok) return null;

  try {
    const page = await _equasisContext.newPage();
    const url  = `https://www.equasis.org/EquasisWeb/restricted/ShipInfo?fs=ShipSearch&P_IMO=${imo}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1000);

    // Session expired → re-login
    const pageUrl = page.url();
    if (pageUrl.includes("authen") || pageUrl.includes("HomePage")) {
      _equasisLoggedIn = false;
      await page.close();
      const retried = await equasisEnsureLogin();
      if (!retried) return null;
      const page2 = await _equasisContext.newPage();
      await page2.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      await page2.waitForTimeout(1000);
      const html2 = await page2.content();
      const text2 = await page2.evaluate(() => document.body.innerText);
      await page2.close();
      return parseEquasisOwner(html2, text2);
    }

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    await page.close();
    return parseEquasisOwner(html, text);
  } catch {
    return null;
  }
}

async function closeEquasisBrowser() {
  if (_equasisBrowser) {
    await _equasisBrowser.close();
    _equasisBrowser = null;
    _equasisContext = null;
    _equasisLoggedIn = false;
  }
}

function parseEquasisOwner(html, text = "") {
  if (!html || html.length < 500) return null;

  // Try plain text first (more reliable than HTML regex)
  if (text.length > 200) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    let company = null, manager = null, address = null, country = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^Registered\s+owner$/i.test(line) && lines[i + 1]) {
        company = lines[i + 1];
      }
      if (/^(Ship\s+)?[Mm]anager$/i.test(line) && lines[i + 1]) {
        manager = lines[i + 1];
      }
      if (/^Address$/i.test(line) && lines[i + 1]) {
        address = lines[i + 1];
      }
      if (/^Country$/i.test(line) && lines[i + 1]) {
        country = lines[i + 1];
      }
    }

    const resolved = company || manager;
    if (resolved) {
      return { company: resolved, manager, address, country, email: null, phone: null };
    }
  }

  // Fallback: HTML regex
  const ownerMatch   = html.match(/Registered\s+owner[^<]{0,30}<[^>]+>[^<]*<[^>]+>\s*([^<]{3,80})</i);
  const managerMatch = html.match(/(?:Ship\s+manager|Manager)[^<]{0,20}<[^>]+>[^<]*<[^>]+>\s*([^<]{3,80})</i);
  const addressMatch = html.match(/Address[^<]{0,10}<[^>]+>\s*([^<]{5,120})</i);
  const countryMatch = html.match(/Country[^<]{0,10}<[^>]+>\s*([^<]{2,40})</i);

  const company = (ownerMatch?.[1] || managerMatch?.[1] || "").trim();
  if (!company) return null;

  return {
    company,
    manager: managerMatch?.[1]?.trim() || null,
    address: addressMatch?.[1]?.trim() || null,
    country: countryMatch?.[1]?.trim() || null,
    email:   null,
    phone:   null,
  };
}

// ─── Step 4: Persist ─────────────────────────────────────────────────────────

function loadExisting() {
  if (!fs.existsSync(OUT_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")).signals || []; } catch { return []; }
}

function save(signals) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ signals, updatedAt: new Date().toISOString() }, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n🚢 ShipScout — S&P Signal Pipeline");
  console.log("====================================");
  console.log(`Datalastic : ${DATALASTIC_KEY ? "✓" : "✗ missing — vessel lookup skipped"}`);
  console.log(`Equasis    : ${EQUASIS_EMAIL && !EQUASIS_EMAIL.includes("_equasis_") ? "✓" : "✗ no credentials — owner lookup skipped"}`);
  console.log("");

  // Step 1: scrape
  const names = await scrapeGRSNames();
  if (!names.length) { console.log("❌ No names scraped. Exiting."); process.exit(1); }

  // Load existing results to avoid re-processing
  const existing = loadExisting();
  const existingNames = new Set(existing.map(s => s._srcName));

  const signals = [...existing];
  let newCount  = 0;

  console.log(`\n📋 Processing ${names.length} names (${existingNames.size} already cached)...\n`);

  for (const rawName of names) {
    if (existingNames.has(rawName)) {
      process.stdout.write(`  ⏭  ${rawName.slice(0, 40).padEnd(41)} cached\n`);
      continue;
    }

    process.stdout.write(`  ⏳ ${rawName.slice(0, 40).padEnd(41)} `);

    // Step 2: Datalastic find
    const found = DATALASTIC_KEY ? await datalasticFind(rawName) : null;
    if (!found?.imo) {
      console.log("→ no IMO match");
      await sleep(800);
      continue;
    }

    const imo  = found.imo;
    const info = await datalasticInfo(imo) || found;
    await sleep(1500); // rate limit

    const built = parseInt(info.year_built || found.year_built) || null;
    const dwt   = info.deadweight   || found.deadweight   || 0;
    const ldt   = info.lightship    || found.lightship    || Math.round(dwt * 0.17) || null;
    const type  = info.type_specific || found.type_specific || null;
    const flag  = info.country_name  || found.country_name  || null;
    const name  = info.name || found.name || rawName;

    process.stdout.write(`→ IMO ${imo} | ${built || "?"} | `);

    // Step 3a: Equasis owner
    const ownerRaw = await equasisLookup(imo);
    await sleep(1200);

    // Step 3b: contact enrichment (website, emails, phones, linkedin)
    let enriched = null;
    if (ownerRaw?.company) {
      enriched = await enrichCompanyContact(ownerRaw.company);
      await sleep(1000);
    }

    const owner = ownerRaw
      ? {
          ...ownerRaw,
          email:           enriched?.emails?.[0] || ownerRaw.email  || null,
          emails:          enriched?.emails       || [],
          phone:           enriched?.phones?.[0]  || ownerRaw.phone  || null,
          phones:          enriched?.phones       || [],
          website:         enriched?.website      || null,
          linkedinSearchUrl: enriched?.linkedinSearchUrl || null,
        }
      : { company: null, address: null, country: null, email: null, emails: [], phone: null, phones: [], website: null, linkedinSearchUrl: null };

    console.log(owner.company ? `owner: ${owner.company.slice(0, 25)}` : "no owner");

    const signal = {
      name,
      imo,
      type,
      built,
      dwt,
      ldt,
      flag,
      owner,
      saleType:  "voluntary",
      source:    "market signal",
      addedAt:   new Date().toISOString(),
      _srcName:  rawName,  // internal: original GRS heading
    };

    signals.push(signal);
    existingNames.add(rawName);
    newCount++;

    // Checkpoint: save after every 5 new entries
    if (newCount % 5 === 0) save(signals);
  }

  save(signals);

  const withIMO     = signals.filter(s => s.imo);
  const withOwner   = signals.filter(s => s.owner?.company);
  const withEmail   = signals.filter(s => s.owner?.email);
  const withWebsite = signals.filter(s => s.owner?.website);

  console.log(`\n✅ Done`);
  console.log(`   New signals    : ${newCount}`);
  console.log(`   Total saved    : ${signals.length} → ${OUT_FILE}`);
  console.log(`   With IMO       : ${withIMO.length}`);
  console.log(`   With owner     : ${withOwner.length}`);
  console.log(`   With email     : ${withEmail.length}`);
  console.log(`   With website   : ${withWebsite.length}`);

  if (withIMO.length) {
    console.log("\n📊 Resolved vessels:");
    for (const s of withIMO) {
      const ownerStr   = s.owner?.company ? s.owner.company.slice(0, 22) : "—";
      const emailStr   = s.owner?.email   ? s.owner.email.slice(0, 22)   : "—";
      const websiteStr = s.owner?.website ? s.owner.website.replace(/^https?:\/\//, "").slice(0, 20) : "—";
      console.log(`   ${s.name.slice(0,28).padEnd(29)} IMO ${s.imo} | owner: ${ownerStr.padEnd(23)} | email: ${emailStr.padEnd(23)} | web: ${websiteStr}`);
    }
  }

  await closeEquasisBrowser();
}

run().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
