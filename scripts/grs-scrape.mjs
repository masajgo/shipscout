/**
 * GRS Group vessel scraper
 * Scrapes ferry/cruise/offshore vessel listings from grs.group
 * Parses specs directly from page — no Datalastic needed
 * Saves to data/grs_vessels.json + Vercel Blob
 */
import { chromium } from "playwright";
import { put } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_KEY   = "grs_vessels.json";

const SOURCES = [
  {
    url: "https://grs.group/grs-ferry-cruise/purchase/ferry-cruise-vessels-for-sale/",
    group: "Ferry & Cruise",
  },
  {
    url: "https://grs.group/grs-offshore-renewables/purchase/offshore-vessels-for-sale/offshore-vessels-for-sale-results/",
    group: "Offshore / Renewables",
  },
];

function parseEUR(str = "") {
  const m = str.replace(/\./g, "").replace(/,/g, ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseYear(str = "") {
  const m = str.match(/\d{4}/);
  return m ? parseInt(m[0]) : null;
}

function parseDWT(str = "") {
  const m = str.replace(/[.,]/g, "").match(/(\d+)/);
  return m ? parseInt(m[0]) : 0;
}

function scoreFromAge(age) {
  if (age >= 32) return Math.min(99, 90 + Math.min(9, age - 32));
  if (age >= 28) return 82 + (age - 28);
  if (age >= 24) return 72 + (age - 24) * 2;
  if (age >= 20) return 60 + (age - 20) * 3;
  return Math.max(30, 40 + age);
}

function normalizeType(raw = "", group = "") {
  const r = raw.toLowerCase();
  if (r.includes("cruise"))           return "Cruise Ship";
  if (r.includes("roro") || r.includes("ro-ro")) return "Passenger / RoRo";
  if (r.includes("passenger"))        return "Passenger Ship";
  if (r.includes("ferry"))            return "Ferry";
  if (r.includes("accommodation") || r.includes("accomodation")) return "Accommodation Vessel";
  if (r.includes("landing craft"))    return "Landing Craft";
  if (r.includes("cablel"))           return "Cable Layer";
  if (r.includes("sov") || r.includes("service operation")) return "Service Operation Vessel";
  if (r.includes("ctv") || r.includes("crew transfer")) return "Crew Transfer Vessel";
  if (r.includes("jack") || r.includes("jackup")) return "Jack-up";
  if (r.includes("wind") || r.includes("turbine")) return "Wind Support Vessel";
  if (r.includes("platform") || r.includes("offshore")) return "Offshore Platform";
  if (group === "Offshore / Renewables") return "Offshore Support Vessel";
  return raw.replace(/\s+for sale.*/i, "").trim() || "Passenger Ship";
}

async function scrapeListingPage(browser, url, group) {
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  });

  console.log(`  Loading ${url}`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Try clicking "Load All Results" if present
  try {
    const loadBtn = page.locator("a, button").filter({ hasText: /load all results/i }).first();
    if (await loadBtn.isVisible({ timeout: 3000 })) {
      console.log("  Clicking 'Load All Results'...");
      await loadBtn.click();
      await page.waitForTimeout(10000); // GRS dynamically loads ~50+ vessels
    }
  } catch {}

  // Get body text and detail links
  const bodyText = await page.evaluate(() => document.body.innerText);

  // Get all detail page links with their associated headings
  const detailLinks = await page.evaluate(() => {
    const links = [];
    for (const a of document.querySelectorAll("a[href*='vessels-for-sale-detail'], a[href*='vessel-detail'], a[href*='vessel-for-sale/']")) {
      links.push(a.href);
    }
    // Also get view details links near H3 headings
    for (const h3 of document.querySelectorAll("h3")) {
      if (/#\d+/.test(h3.textContent || "")) {
        // Walk siblings and parents for links
        let el = h3;
        for (let i = 0; i < 5; i++) {
          el = el.nextElementSibling || el.parentElement?.nextElementSibling || el;
          const link = el?.querySelector?.("a[href]") || (el?.tagName === "A" ? el : null);
          if (link?.href?.includes("grs.group") && link.href.length > 40) {
            links.push(link.href);
            break;
          }
        }
      }
    }
    return [...new Set(links)];
  });

  await page.close();

  // Parse body text into vessel blocks
  // GRS listings have a predictable text format:
  // "76M PASSENGER / RORO SHIP FOR SALE / #1048823\nPRICE: 2.900.000 EUR\nLENGTH: 75.8M\n..."
  const vessels = parseBodyText(bodyText, group, detailLinks);
  return { vessels };
}

function parseBodyText(text, group, detailLinks) {
  const vessels = [];

  // Split on GRS ID pattern which starts each vessel block
  // Each block starts with the vessel heading line containing #NNNNNNN
  const grsPattern = /#(\d{7})/g;
  let match;
  const positions = [];

  while ((match = grsPattern.exec(text)) !== null) {
    // Find start of line with this GRS ID
    const lineStart = text.lastIndexOf("\n", match.index) + 1;
    positions.push({ grsId: match[1], start: lineStart, idPos: match.index });
  }

  // For each GRS ID, extract the block (from its line to the next GRS ID)
  for (let i = 0; i < positions.length; i++) {
    const { grsId, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : start + 800;
    const block = text.slice(start, end);

    // Skip duplicate GRS IDs (they appear twice: once in heading, once in "GRS ID: #...")
    if (vessels.find(v => v.grsId === grsId)) continue;

    const firstLine = block.split("\n")[0].trim();
    // Vessel heading: "76M PASSENGER / RORO SHIP FOR SALE / #1048823"
    const typePart = firstLine
      .replace(/#\d+/g, "")
      .replace(/for sale/gi, "")
      .replace(/\//g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const priceMatch  = block.match(/PRICE\s*[:\s]\s*([\d.,]+)\s*(EUR|USD|GBP)?/i);
    const lengthMatch = block.match(/LENGTH\s*[:\s]\s*([\d.]+)\s*M/i);
    const builtMatch  = block.match(/BUILT\s*[:\s]\s*(?:\d{2}\.\d{2}\.)?(\d{4})/i);
    const dwtMatch    = block.match(/DWT\s*[:\s]\s*([\d.,]+)\s*T?/i);
    const speedMatch  = block.match(/SPEED\s*[:\s]\s*([\d.]+)\s*KTS/i);
    const beamMatch   = block.match(/BEAM\s*[:\s]\s*([\d.]+)\s*M/i);
    const paxMatch    = block.match(/(?:DAY PASSENGERS|PASSENGERS?|PAX|BERTHS)\s*[:\s]\s*([\d,]+)/i);
    const classMatch  = block.match(/CLASS\s*[:\s]\s*([A-Z]{2,6})/i);
    const shipyardMatch = block.match(/SHIPYARD\s*[:\s]\s*([^\n]+)/i);

    // Find matching detail link by GRS ID
    const detailUrl = detailLinks.find(l => l.includes(grsId)) || "";

    vessels.push({
      grsId,
      typePart,
      priceRaw:  priceMatch ? priceMatch[1] : "",
      currency:  priceMatch ? (priceMatch[2] || "EUR") : "EUR",
      length:    lengthMatch ? parseFloat(lengthMatch[1]) : null,
      built:     builtMatch ? parseInt(builtMatch[1]) : null,
      dwtRaw:    dwtMatch ? dwtMatch[1] : "",
      speed:     speedMatch ? parseFloat(speedMatch[1]) : null,
      beam:      beamMatch ? parseFloat(beamMatch[1]) : null,
      pax:       paxMatch ? parseInt(paxMatch[1].replace(",","")) : null,
      classCode: classMatch ? classMatch[1] : "",
      shipyard:  shipyardMatch ? shipyardMatch[1].trim() : "",
      detailUrl,
      group,
    });
  }

  return vessels;
}

async function main() {
  console.log("\n🚢 ShipScout GRS Scraper");
  console.log("========================");
  console.log(`Blob: ${BLOB_TOKEN ? "✓" : "✗ Missing"}\n`);

  const browser = await chromium.launch({ headless: true });
  const year = new Date().getFullYear();
  const allVessels = [];

  for (const source of SOURCES) {
    console.log(`\n📋 Scraping ${source.group}...`);
    const { vessels } = await scrapeListingPage(browser, source.url, source.group);
    console.log(`  Found ${vessels.length} vessels`);
    allVessels.push(...vessels);
  }

  await browser.close();

  if (allVessels.length === 0) {
    console.log("❌ No vessels found.");
    process.exit(1);
  }

  // Enrich with computed fields
  const enriched = allVessels.map((v, i) => {
    const built  = v.built || (year - 25);
    const age    = year - built;
    const dwt    = parseDWT(v.dwtRaw);
    const ldt    = Math.round(dwt * 0.17) || Math.round((v.length || 50) * 20);
    const type   = normalizeType(v.typePart, v.group);
    const score  = Math.min(99, scoreFromAge(age));
    const priceEUR = parseEUR(v.priceRaw);
    const priceUSD = priceEUR ? priceEUR * 1.08 : null;

    const tags = [
      { label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" },
      { label: "Voluntary Sale", type: "new" },
    ];
    if (v.pax) tags.push({ label: `${v.pax} pax`, type: "idle" });
    if (score >= 85) tags.push({ label: "High priority", type: "urgent" });
    if (v.group === "Offshore / Renewables") tags.push({ label: "Offshore", type: "bank" });

    return {
      id:        10000000 + i,
      imo:       `GRS-${v.grsId}`,
      name:      v.typePart.replace(/\s+/g, " ").trim() || `Vessel ${v.grsId}`,
      flag:      "Unknown",
      type,
      group:     v.group,
      built,
      dwt,
      ldt,
      length:    v.length,
      speed:     v.speed,
      pax:       v.pax,
      classCode: v.classCode,
      location:  "—",
      price:     priceUSD
        ? `$${(priceUSD / 1_000_000).toFixed(1)}M`
        : priceEUR
          ? `€${(priceEUR / 1_000_000).toFixed(1)}M`
          : "POA",
      priceEUR,
      priceType: "Asking",
      saleType:  "voluntary",
      tags,
      urgent:    score >= 88,
      score,
      source:    "GRS",
      grsId:     v.grsId,
      detailUrl: v.detailUrl,
      addedAt:   new Date().toISOString(),
    };
  });

  console.log(`\n✅ Enriched ${enriched.length} GRS vessels`);

  // Save to local file
  const outPath = path.join(__dirname, "../data/grs_vessels.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ vessels: enriched, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`💾 Saved to data/grs_vessels.json`);

  // Save to Vercel Blob
  if (BLOB_TOKEN) {
    try {
      await put(BLOB_KEY, JSON.stringify({ vessels: enriched, updatedAt: new Date().toISOString() }), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        token: BLOB_TOKEN,
      });
      console.log("☁️  Saved to Vercel Blob");
    } catch (err) {
      console.log("⚠️  Blob save failed:", err.message);
    }
  }

  // Summary
  console.log("\n📊 Summary:");
  for (const v of enriched.slice(0, 15)) {
    console.log(`  GRS-${v.grsId.padEnd(8)} ${v.name.slice(0,35).padEnd(36)} ${v.built} | ${v.price}`);
  }
  if (enriched.length > 15) console.log(`  ... and ${enriched.length - 15} more`);
}

main().catch(console.error);
