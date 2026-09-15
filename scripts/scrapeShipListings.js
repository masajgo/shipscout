#!/usr/bin/env node
/**
 * Scrapes vessel-for-sale listings from shipselector.com.
 * Run: node scripts/scrapeShipListings.js
 * Env: SCRAPE_PAGES=5 (default)
 */
require("dotenv").config({ path: ".env.local" });

const { chromium } = require("playwright");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CATEGORIES = [
  "tanker", "cargo-ship", "bulk-carrier", "container-ship", "offshore-vessel",
];

function parsePrice(str) {
  if (!str || /on request/i.test(str) || !str.trim()) return { price: null, por: true };
  const n = parseInt(str.replace(/[^0-9]/g, ""), 10);
  return { price: n || null, por: !n };
}

async function scrapeCategory(page, cat) {
  const results = [];
  const maxPages = parseInt(process.env.SCRAPE_PAGES || "5");

  for (let p = 1; p <= maxPages; p++) {
    const url = p === 1
      ? `https://shipselector.com/offers/sale/${cat}`
      : `https://shipselector.com/offers/sale/${cat}?page=${p}`;

    process.stdout.write(`  [${cat}] page ${p}... `);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const listings = await page.evaluate(() => {
      // Title links: deep URL pattern, skip "Details »" text
      const titleLinks = Array.from(document.querySelectorAll("a[href]"))
        .filter(a => {
          const h = a.getAttribute("href") || "";
          const t = a.innerText.trim();
          return h.match(/\/offers\/sale\/[^/]+\/[^/]+\/\d+-/)
            && t.length > 4
            && !/^details/i.test(t);
        });

      // Group info labels by vessel
      const groups = [];
      let current = null;
      document.querySelectorAll(".single-info-label").forEach(lbl => {
        const key = lbl.innerText.trim().toLowerCase();
        const val = lbl.closest("li")?.querySelector(".right-label")?.innerText.trim() || "";
        if (key === "offer type") { if (current) groups.push(current); current = {}; }
        if (current) current[key] = val;
      });
      if (current && Object.keys(current).length) groups.push(current);

      return titleLinks.map((a, i) => ({
        title: a.innerText.trim(),
        ...(groups[i] || {}),
      })).filter(l => l.title && l["type"]);
    });

    if (!listings.length) { console.log("empty — done."); break; }
    console.log(`${listings.length} vessels`);
    results.push(...listings);
    await page.waitForTimeout(1200);
  }

  return results;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  });

  let total = 0, saved = 0;

  for (const cat of CATEGORIES) {
    console.log(`\nCategory: ${cat}`);
    const listings = await scrapeCategory(page, cat);

    for (const l of listings) {
      const typeStr  = l["type"] || "";
      const yearM    = typeStr.match(/,\s*(\d{4})/);
      const year     = yearM ? parseInt(yearM[1]) : null;
      const vType    = typeStr.replace(/,\s*\d{4}.*/, "").trim() || cat.replace(/-/g, " ");

      const dimNums  = (l["details"] || "").match(/[\d.]+/g) || [];
      const length_m = dimNums[0] ? parseFloat(dimNums[0]) : null;
      const beam_m   = dimNums[1] ? parseFloat(dimNums[1]) : null;
      const draft_m  = dimNums[2] ? parseFloat(dimNums[2]) : null;

      const dwtM = (l["deadweight"] || "").match(/[\d,]+/);
      const dwt  = dwtM ? parseInt(dwtM[0].replace(/,/g, "")) : null;

      const { price, por } = parsePrice(l["asking price"] || "");

      try {
        await pool.query(
          `INSERT INTO ship_listings
             (title, vessel_type, year_built, dwt, length_m, beam_m, draft_m,
              classification, price_usd, price_on_request, scraped_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT (title, year_built, dwt) DO UPDATE SET
             price_usd        = EXCLUDED.price_usd,
             price_on_request = EXCLUDED.price_on_request,
             scraped_at       = NOW()`,
          [l.title, vType, year, dwt, length_m, beam_m, draft_m,
           l["classification"] || null, price, por]
        );
        saved++;
      } catch { /* skip duplicate */ }
      total++;
    }
  }

  await browser.close();
  await pool.end();
  console.log(`\nDone. Processed: ${total}, saved to DB: ${saved}`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
