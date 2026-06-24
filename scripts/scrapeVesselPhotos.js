"use strict";
/**
 * scrapeVesselPhotos.js
 *
 * Fetches the first vessel photo from ShipSpotting.com for each IMO,
 * uploads it to Vercel Blob, and stores the URL in vessels.photo_url.
 *
 * Usage:
 *   node scripts/scrapeVesselPhotos.js --limit=50   # first 50 by scrap_score
 *   node scripts/scrapeVesselPhotos.js --fresh       # re-scrape already-done vessels
 *   node scripts/scrapeVesselPhotos.js --imo=9038828 # single vessel
 */

const path      = require("path");
const { Pool }  = require("pg");
const { chromium } = require("playwright");
const { put }   = require("@vercel/blob");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const DB_URL     = process.env.DATABASE_URL;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!DB_URL)     { console.error("DATABASE_URL not set"); process.exit(1); }
if (!BLOB_TOKEN) { console.warn("BLOB_READ_WRITE_TOKEN not set — photos will be skipped"); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 3,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const args      = process.argv.slice(2);
const FRESH     = args.includes("--fresh");
const limitArg  = args.find(a => a.startsWith("--limit="));
const LIMIT     = limitArg ? parseInt(limitArg.split("=")[1]) : 9999;
const imoArg    = args.find(a => a.startsWith("--imo="));
const SINGLE_IMO = imoArg ? imoArg.split("=")[1] : null;

const DELAY_MS  = 4000;
const BASE_URL  = "https://www.shipspotting.com/photos";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

// ─── DB: get candidates ──────────────────────────────────────────────────────

async function getCandidates() {
  if (SINGLE_IMO) {
    const { rows } = await pool.query(
      `SELECT imo::text, name FROM vessels WHERE imo = $1::bigint LIMIT 1`,
      [SINGLE_IMO]
    );
    return rows;
  }

  const condition = FRESH
    ? `imo IS NOT NULL AND imo BETWEEN 1000000 AND 9999999`
    : `imo IS NOT NULL AND imo BETWEEN 1000000 AND 9999999 AND photo_url IS NULL`;

  const { rows } = await pool.query(`
    SELECT imo::text, name
    FROM   vessels
    WHERE  ${condition}
    ORDER  BY scrap_score DESC NULLS LAST
    LIMIT  $1
  `, [LIMIT]);
  return rows;
}

// ─── Upload photo URL to Vercel Blob ─────────────────────────────────────────

async function downloadAndUpload(page, srcUrl, imo) {
  if (!BLOB_TOKEN) return srcUrl;
  try {
    // Use Playwright's browser context to fetch (preserves session/cookies)
    const response = await page.context().request.get(srcUrl, {
      headers: { Referer: "https://www.shipspotting.com/", Accept: "image/jpeg,image/*" },
      timeout: 12000,
    });
    if (!response.ok()) return null;
    const buf = Buffer.from(await response.body());
    if (buf.length < 8000) return null; // skip tiny/error images
    const { url } = await put(`vessel-photos/${imo}.jpg`, buf, {
      access:          "public",
      contentType:     "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite:  true,
      token:           BLOB_TOKEN,
    });
    return url;
  } catch (err) {
    log(`  Blob upload failed (${imo}): ${err.message}`);
    return null;
  }
}

// ─── Scrape ShipSpotting for one IMO ─────────────────────────────────────────

async function scrapePhoto(page, imo) {
  await page.goto(`${BASE_URL}?imo=${imo}`, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Wait for photos to render (React app)
  await Promise.race([
    page.waitForSelector('img[src*="/photos/middle/"]', { timeout: 6000 }).catch(() => {}),
    sleep(5000),
  ]);

  const photoUrl = await page.evaluate(() => {
    // ShipSpotting serves vessel photos from /photos/middle/{id}.jpg at 800px wide
    const imgs = [...document.querySelectorAll('img[src*="/photos/middle/"]')];
    return imgs[0]?.src || null;
  });

  return photoUrl;
}

// ─── DB: save photo_url ───────────────────────────────────────────────────────

async function savePhotoUrl(imo, url) {
  await pool.query(
    `UPDATE vessels SET photo_url = $1 WHERE imo = $2::bigint`,
    [url, imo]
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const candidates = await getCandidates();
  log(`Candidates: ${candidates.length} | Fresh: ${FRESH} | Blob: ${!!BLOB_TOKEN}`);
  if (!candidates.length) { log("Nothing to scrape."); return; }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  let found = 0, skipped = 0, errors = 0;

  try {
    for (let i = 0; i < candidates.length; i++) {
      const { imo, name } = candidates[i];
      const label = `[${i + 1}/${candidates.length}] IMO ${imo} ${(name || "").slice(0, 35).padEnd(35)}`;
      process.stdout.write(label + " ");

      if (i > 0) await sleep(DELAY_MS);

      try {
        const rawUrl = await scrapePhoto(page, imo);
        if (!rawUrl) {
          skipped++;
          process.stdout.write("— no photo\n");
          continue;
        }

        const blobUrl = await downloadAndUpload(page, rawUrl, imo);
        if (!blobUrl) {
          skipped++;
          process.stdout.write("— download failed\n");
          continue;
        }

        await savePhotoUrl(imo, blobUrl);
        found++;
        process.stdout.write(`✓ ${blobUrl.slice(0, 70)}\n`);
      } catch (err) {
        errors++;
        process.stdout.write(`✗ ${err.message.slice(0, 60)}\n`);
        // Re-create page on navigation error
        if (err.message.includes("Target page") || err.message.includes("browser has been closed")) {
          try { await page.close(); } catch {}
          const newPage = await context.newPage();
          Object.assign(page, newPage);
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log(`\nDone: ${found} photos saved, ${skipped} no-photo, ${errors} errors`);

  // Show DB stats
  const { rows } = await pool.query(`SELECT COUNT(*) FROM vessels WHERE photo_url IS NOT NULL`);
  log(`Total vessels with photo_url: ${rows[0].count}`);
}

main()
  .catch(err => { log(`FATAL: ${err.message}`); process.exit(1); })
  .finally(() => pool.end());
