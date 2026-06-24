"use strict";
/**
 * scrapeGRSDetails.js
 *
 * Her GRS ilanının detay sayfasını scrape eder:
 *   - Full specs text (length, beam, draft, engine, pax, cars, flag, GT…)
 *   - Description paragraphs
 *   - Inline base64 JPEG fotoğrafları → Vercel Blob'a upload → URL'leri saklar
 *   - sp_listings tablosuna UPSERT eder
 *
 * Kullanım:
 *   node scripts/scrapeGRSDetails.js             # tüm 136 ilan (ilk çalışma)
 *   node scripts/scrapeGRSDetails.js --limit=5   # test
 *   node scripts/scrapeGRSDetails.js --fresh      # cache'i atla, hepsini yeniden scrape et
 */

const path     = require("path");
const fs       = require("fs");
const { Pool } = require("pg");
const { chromium } = require("playwright");
const { put }  = require("@vercel/blob");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const DB_URL    = process.env.DATABASE_URL;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!DB_URL)     { console.error("DATABASE_URL not set"); process.exit(1); }
if (!BLOB_TOKEN) { console.warn("BLOB_READ_WRITE_TOKEN not set — images will be skipped"); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const args    = process.argv.slice(2);
const FRESH   = args.includes("--fresh");
const limitArg = args.find(a => a.startsWith("--limit=")) || args[args.indexOf("--limit") + 1];
const LIMIT   = parseInt(limitArg) || 9999;

const DELAY_MS  = 3500;
const GRS_FILE  = path.join(__dirname, "../data/grs_vessels.json");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

// ─── Already-scraped grs_ids ─────────────────────────────────────────────────

async function getScrapedIds() {
  if (FRESH) return new Set();
  const { rows } = await pool.query("SELECT grs_id FROM sp_listings WHERE images IS NOT NULL");
  return new Set(rows.map(r => r.grs_id));
}

// ─── Spec parser — body text → structured fields ──────────────────────────────

function parseBodyText(text) {
  const get = (label) => {
    const re = new RegExp(label + "\\s*[:\\n]\\s*([^\\n]{1,60})", "i");
    return text.match(re)?.[1]?.trim() || null;
  };
  const num = (label) => {
    const v = get(label);
    return v ? parseFloat(v.replace(/[^\d.]/g, "")) || null : null;
  };
  const int = (label) => {
    const v = get(label);
    return v ? parseInt(v.replace(/[^\d]/g, "")) || null : null;
  };

  // Price — "2.900.000,00 EUR" or "$3.1M"
  const priceMatch = text.match(/PRICE\s*[:\n]\s*([\d.,]+)\s*(EUR|USD|GBP)?/i);
  const priceEUR   = priceMatch
    ? parseFloat(priceMatch[1].replace(/\./g, "").replace(",", ".")) || null
    : null;

  // Built — "02.01.2000" or just "2000"
  const builtMatch = text.match(/BUILT\s*[:\n]\s*(?:\d{2}\.\d{2}\.)?(\d{4})/i);
  const built = builtMatch ? parseInt(builtMatch[1]) : null;

  // Cars — "ABT. 83 CARS" or "CARS: 83"
  const carsMatch = text.match(/(?:ABT\.?\s*)?(\d+)\s*CARS/i) || text.match(/CARS\s*[:\n]\s*(\d+)/i);
  const cars = carsMatch ? parseInt(carsMatch[1]) : null;

  // Pax — "300 PASSENGERS" or "PAX: 300"
  const paxMatch = text.match(/(\d+)\s*(?:PAX|PASSENGERS?|BERTHS|DAY PASSENGERS)/i);
  const pax = paxMatch ? parseInt(paxMatch[1]) : null;

  // Flag
  const flagMatch = text.match(/FLAG\s*[:\n]\s*([A-Za-z][A-Za-z\s]+?)(?:\n|$)/i);
  const flag = flagMatch ? flagMatch[1].trim() : null;

  // Gross Tonnage
  const gtMatch = text.match(/GROSS TONNAGE(?:\s*OF)?\s*(\d[\d,]+)/i) ||
                  text.match(/GROSS TONNAGE\s*[:\n]\s*([\d,]+)/i);
  const grossTonnage = gtMatch ? parseInt(gtMatch[1].replace(/,/g, "")) : null;

  // Engine
  const engineMatch = text.match(/ENGINE POWER\s*[:\n]\s*([\d,]+)\s*KW/i) ||
                      text.match(/([\d,]+)\s*KW/i);
  const engineKw = engineMatch ? parseInt(engineMatch[1].replace(/,/g, "")) : null;

  // Shipyard
  const shipyardMatch = text.match(/SHIPYARD\s*[:\n]\s*([^\n]{2,60})/i);
  const shipyard = shipyardMatch ? shipyardMatch[1].trim() : null;

  // Description paragraphs (lines >40 chars not in headers)
  const descLines = text.split("\n")
    .map(l => l.trim())
    .filter(l =>
      l.length > 40 &&
      !/^(PRICE|LENGTH|BEAM|DRAFT|DWT|BUILT|ENGINE|SPEED|CLASS|DECKS|CARS|FLAG|GROSS|PAX|BERTH|SHIPYARD|CONTACT|NAME|EMAIL|PHONE|GRS|ADD TO|REQUEST|MAIN SPEC|DETAILS|LANGUAGE|CHARTER|PURCHASE|COOKIE|PRIVACY|IMPRINT)/i.test(l)
    )
    .slice(0, 8);

  return {
    priceEUR,
    built,
    lengthM:    num("LENGTH"),
    beamM:      num("BEAM"),
    draftM:     num("DRAFT"),
    dwt:        int("DWT"),
    speed:      num("SPEED"),
    decks:      int("DECKS"),
    engineKw,
    cars,
    pax,
    flag,
    grossTonnage,
    shipyard,
    description: descLines.join("\n"),
    specsText:   text.slice(
      text.indexOf("MAIN SPECIFICATIONS"),
      text.indexOf("CONTACT US") > 0 ? text.indexOf("CONTACT US") : text.length
    ).trim(),
  };
}

// ─── Upload base64 image to Vercel Blob ───────────────────────────────────────

async function uploadBase64(b64DataUri, grsId, idx) {
  if (!BLOB_TOKEN) return null;
  try {
    const data    = b64DataUri.split(",")[1];
    const buf     = Buffer.from(data, "base64");
    if (buf.length < 5000) return null; // skip tiny/blurred placeholders (<5KB)
    const { url } = await put(`grs-photos/${grsId}-${idx}.jpg`, buf, {
      access:          "public",
      contentType:     "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite:  true,
      token:           BLOB_TOKEN,
    });
    return url;
  } catch (err) {
    log(`  Blob upload failed (${grsId}-${idx}): ${err.message}`);
    return null;
  }
}

// ─── Scrape one detail page ───────────────────────────────────────────────────

async function scrapePage(page, vessel) {
  const { grsId, detailUrl, name, type, group } = vessel;

  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 35000 });

  // Accept cookie consent if present
  try {
    await page.click('button:has-text("Accept"), .cmplz-accept, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 2500 });
    await page.waitForTimeout(800);
  } catch {}

  await page.waitForTimeout(2000);

  // Scroll to trigger lazy load
  for (let y = 0; y <= 3000; y += 600) {
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1500);

  // Extract body text
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Extract base64 images (vessel photos — filter by size ≥ 300px wide)
  const b64Images = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter(i => i.src.startsWith("data:image/jpeg") && i.naturalWidth >= 300 && i.naturalHeight >= 200)
      .map(i => i.src)
  );

  // Deduplicate by first 200 chars of base64 (same image = same prefix)
  const seen    = new Set();
  const unique  = b64Images.filter(s => {
    const key = s.slice(0, 200);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Upload to Vercel Blob
  const imageUrls = [];
  for (let i = 0; i < Math.min(unique.length, 6); i++) {
    const url = await uploadBase64(unique[i], grsId, i);
    if (url) imageUrls.push(url);
  }

  const specs = parseBodyText(bodyText);

  return {
    grsId,
    name:        name || specs.shipyard || grsId,
    built:       specs.built,
    type,
    groupName:   group,
    priceEUR:    specs.priceEUR,
    lengthM:     specs.lengthM,
    beamM:       specs.beamM,
    draftM:      specs.draftM,
    dwt:         specs.dwt,
    engineKw:    specs.engineKw,
    speed:       specs.speed,
    pax:         specs.pax,
    cars:        specs.cars,
    decks:       specs.decks,
    classCode:   vessel.classCode || null,
    flag:        specs.flag,
    grossTonnage:specs.grossTonnage,
    shipyard:    specs.shipyard,
    description: specs.description,
    specsText:   specs.specsText,
    images:      imageUrls,
    detailUrl,
  };
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertListing(d) {
  await pool.query(`
    INSERT INTO sp_listings
      (grs_id, name, built, type, group_name, price_eur, length_m, beam_m, draft_m,
       dwt, engine_kw, speed, pax, cars, decks, class_code, flag, gross_tonnage,
       shipyard, description, specs_text, images, detail_url, scraped_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
    ON CONFLICT (grs_id) DO UPDATE SET
      built         = COALESCE(EXCLUDED.built,          sp_listings.built),
      price_eur     = COALESCE(EXCLUDED.price_eur,      sp_listings.price_eur),
      length_m      = COALESCE(EXCLUDED.length_m,       sp_listings.length_m),
      beam_m        = COALESCE(EXCLUDED.beam_m,         sp_listings.beam_m),
      draft_m       = COALESCE(EXCLUDED.draft_m,        sp_listings.draft_m),
      dwt           = COALESCE(EXCLUDED.dwt,            sp_listings.dwt),
      engine_kw     = COALESCE(EXCLUDED.engine_kw,      sp_listings.engine_kw),
      speed         = COALESCE(EXCLUDED.speed,          sp_listings.speed),
      pax           = COALESCE(EXCLUDED.pax,            sp_listings.pax),
      cars          = COALESCE(EXCLUDED.cars,           sp_listings.cars),
      decks         = COALESCE(EXCLUDED.decks,          sp_listings.decks),
      flag          = COALESCE(EXCLUDED.flag,           sp_listings.flag),
      gross_tonnage = COALESCE(EXCLUDED.gross_tonnage,  sp_listings.gross_tonnage),
      shipyard      = COALESCE(EXCLUDED.shipyard,       sp_listings.shipyard),
      description   = COALESCE(NULLIF(EXCLUDED.description,''), sp_listings.description),
      specs_text    = COALESCE(NULLIF(EXCLUDED.specs_text,''),  sp_listings.specs_text),
      images        = CASE WHEN array_length(EXCLUDED.images, 1) > 0 THEN EXCLUDED.images ELSE sp_listings.images END,
      scraped_at    = NOW()
  `, [
    d.grsId, d.name, d.built, d.type, d.groupName,
    d.priceEUR, d.lengthM, d.beamM, d.draftM,
    d.dwt, d.engineKw, d.speed, d.pax, d.cars, d.decks,
    d.classCode, d.flag, d.grossTonnage,
    d.shipyard, d.description, d.specsText,
    d.images.length ? d.images : null,
    d.detailUrl,
  ]);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { vessels } = JSON.parse(fs.readFileSync(GRS_FILE, "utf8"));
  const scraped     = await getScrapedIds();
  const pending     = vessels
    .filter(v => v.detailUrl && !scraped.has(v.grsId))
    .slice(0, LIMIT);

  log(`Total: ${vessels.length} | Already scraped: ${scraped.size} | Pending: ${pending.length}`);
  if (!pending.length) { log("Nothing to scrape."); return; }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let done = 0, errors = 0, totalImages = 0;

  try {
    for (let i = 0; i < pending.length; i++) {
      const v = pending[i];
      process.stdout.write(`[${i + 1}/${pending.length}] GRS-${v.grsId} ${v.name.slice(0, 40).padEnd(40)} `);

      try {
        if (i > 0) await sleep(DELAY_MS);
        const data = await scrapePage(page, v);
        await upsertListing(data);
        done++;
        totalImages += data.images.length;
        process.stdout.write(`✓ built:${data.built || "-"} img:${data.images.length} "${(data.description || "").slice(0,40)}"\n`);
      } catch (err) {
        errors++;
        process.stdout.write(`✗ ${err.message.slice(0,60)}\n`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log(`\nDone: ${done} scraped, ${errors} errors, ${totalImages} images uploaded`);
}

main()
  .catch(err => { log(`FATAL: ${err.message}`); process.exit(1); })
  .finally(() => pool.end());
