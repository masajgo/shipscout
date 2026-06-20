"use strict";

/**
 * contactEnrichment.js  —  Company contact finder
 *
 * Usage:
 *   const { enrichCompanyContact } = require('./scraper/contactEnrichment');
 *   const result = await enrichCompanyContact('SunStone Ship Management');
 *
 * Strategy:
 *   1. Generate candidate domains from company name (heuristics)
 *   2. Probe each with HEAD requests until one resolves
 *   3. Fetch /contact (and /about) from the live domain
 *   4. Extract emails, phones, address via regex
 *   5. Produce LinkedIn search URL
 */

const path = require("path");
const fs   = require("fs");

// ─── Blacklists ───────────────────────────────────────────────────────────────

const PERSONAL_EMAIL_DOMAINS = /gmail|hotmail|yahoo|outlook|icloud|proton|aol|live\.com/i;

const AGGREGATOR_DOMAINS = /linkedin|facebook|bloomberg|crunchbase|dnb\.com|zoominfo|rocketreach|leadiq|equasis|marinetraffic|vesseltracker|fleetmon|shipfinder|yellowpages|yelp|trustpilot|glassdoor|indeed|twitter|instagram/i;

// Maritime / generic suffixes to strip when deriving domain slug
const STRIP_WORDS = [
  "ship management", "shipping company", "shipping co", "shipping",
  "ship", "ships", "marine services", "marine", "maritime",
  "navigation", "offshore", "vessel", "fleet", "tankers", "tanker",
  "bulk", "cargo", "logistics", "transport", "group", "holding",
  "holdings", "international", "intl", "global", "ltd", "limited",
  "inc", "llc", "sa", "as", "ab", "bv", "gmbh", "oy",
  "company", "co",
];

// ─── Domain candidate generator ───────────────────────────────────────────────

// Maritime keywords found in the original name (used to boost specific candidates)
const MARITIME_KEYWORDS = ["ship", "ships", "shipping", "marine", "maritime", "navigation", "offshore", "vessel", "fleet", "tanker", "bulk", "cargo", "sea", "ocean", "port"];

function generateDomainCandidates(companyName) {
  const raw  = companyName.toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  let core = slug;
  for (const w of STRIP_WORDS) {
    core = core.replace(new RegExp(`\\b${w}\\b`, "gi"), " ").trim();
  }
  core = core.replace(/\s+/g, " ").trim();

  const coreNoSpace = core.replace(/\s/g, "");
  const slugNoSpace = slug.replace(/\s/g, "");
  const coreHyphen  = core.replace(/\s/g, "-");
  const words       = slug.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  const acronym     = words.map(w => w[0]).join("");
  const firstWord   = words[0] || coreNoSpace;

  // Detect if original name had a maritime keyword — use it as suffix hint
  const hasMaritime  = MARITIME_KEYWORDS.some(k => raw.includes(k));
  const maritimeSuffix = hasMaritime ? "ships" :
    raw.includes("ship") ? "ships" :
    raw.includes("shipp") ? "shipping" :
    raw.includes("marine") ? "marine" : "ships";

  // Ordered: most-specific (with maritime suffix) first, generic bare domain last
  const ordered = [
    `${coreNoSpace}${maritimeSuffix}.com`,
    `${coreNoSpace}shipping.com`,
    `${coreNoSpace}ships.com`,
    `${coreNoSpace}marine.com`,
    `${coreNoSpace}maritime.com`,
    `${firstWord}${maritimeSuffix}.com`,
    `${firstWord}ships.com`,
    `${firstWord}shipping.com`,
    `${firstWord}marine.com`,
    `${coreNoSpace}group.com`,
    `${coreHyphen}.com`,
    `${acronym}ships.com`,
    `${acronym}shipping.com`,
    `${acronym}marine.com`,
    `${slugNoSpace}.com`,
    `${coreNoSpace}.com`,      // generic bare domain — last resort
    `${coreNoSpace}mgmt.com`,
    `${coreNoSpace}.net`,
    `${coreNoSpace}.org`,
  ];

  return [...new Set(ordered)].filter(d => d.length > 5 && !d.startsWith("."));
}

// ─── Domain probe ─────────────────────────────────────────────────────────────

async function probeDomain(domain) {
  for (const url of [`https://www.${domain}`, `https://${domain}`]) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (res.ok || res.status === 405) return res.url.replace(/\/+$/, "");
    } catch {}
  }
  return null;
}

async function findWebsite(companyName) {
  const candidates = generateDomainCandidates(companyName);
  const raw = companyName.toLowerCase();
  const needsValidation = MARITIME_KEYWORDS.some(k => raw.includes(k));

  for (const domain of candidates) {
    const url = await probeDomain(domain);
    if (!url) continue;
    // If company name has maritime keywords, validate the domain is actually maritime
    if (needsValidation && !(await validateMaritime(url))) {
      console.log(`[contactEnrichment]   Skipping ${domain} (not maritime)`);
      continue;
    }
    return url;
  }
  return null;
}

// ─── Contact page fetcher ─────────────────────────────────────────────────────

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Check if a homepage looks like a maritime/shipping company
async function validateMaritime(baseUrl) {
  const html = await fetchPage(baseUrl);
  if (!html) return false;
  const text = html.toLowerCase();
  const hits = MARITIME_KEYWORDS.filter(k => text.includes(k)).length;
  return hits >= 2;
}

async function fetchContactHtml(baseUrl) {
  const paths = ["/contact", "/contact-us", "/contacts", "/about", "/about-us", "/get-in-touch", "/reach-us", "/"];
  for (const p of paths) {
    const html = await fetchPage(baseUrl + p);
    if (html && (html.includes("@") || html.includes("tel:"))) return { html, path: p };
  }
  return null;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

function extractEmails(html) {
  const raw = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0].toLowerCase());
  return [...new Set(raw.filter(e => !PERSONAL_EMAIL_DOMAINS.test(e)))];
}

function extractPhones(html) {
  const raw = [...html.matchAll(/\+\d[\d\s\-().]{6,20}\d/g)].map(m => m[0].trim());
  return [...new Set(raw)].slice(0, 6);
}

function extractAddress(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  const addrMatch = stripped.match(/address[:\s]+([A-Z][^.]{10,120})/i);
  if (addrMatch) return addrMatch[1].trim();

  const pcMatch = stripped.match(/[A-Z][a-zA-Z\s,]{5,50}\d{4,5}[A-Z\s,]{0,20}/);
  if (pcMatch) return pcMatch[0].trim();

  return null;
}

function guessEmailFormat(emails, domain) {
  if (!domain || emails.length === 0) return null;
  const own = emails.filter(e => e.includes(domain.split(".")[0]));
  if (own.length === 0) return null;
  const local = own[0].split("@")[0];
  if (/^[a-z]\.[a-z]+$/.test(local))  return `first_initial.last@${domain}`;
  if (/^[a-z]+\.[a-z]+$/.test(local)) return `first.last@${domain}`;
  if (/^[a-z]{2,5}$/.test(local))     return `role@${domain}`;
  if (local.includes("-"))             return `first-last@${domain}`;
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function enrichCompanyContact(companyName) {
  console.log(`[contactEnrichment] Searching: "${companyName}"`);

  const result = {
    company:          companyName,
    website:          null,
    emails:           [],
    phones:           [],
    address:          null,
    emailFormat:      null,
    linkedinSearchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
    source:           "web",
    contactPath:      null,
  };

  const baseUrl = await findWebsite(companyName);
  if (!baseUrl) {
    console.log(`[contactEnrichment]   No website found`);
    return result;
  }

  result.website = baseUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  console.log(`[contactEnrichment]   Website: ${baseUrl}`);

  const found = await fetchContactHtml(baseUrl);
  if (!found) {
    console.log(`[contactEnrichment]   No contact page found`);
    return result;
  }

  result.contactPath = found.path;
  console.log(`[contactEnrichment]   Contact page: ${baseUrl}${found.path}`);

  result.emails  = extractEmails(found.html);
  result.phones  = extractPhones(found.html);
  result.address = extractAddress(found.html);
  result.emailFormat = guessEmailFormat(result.emails, result.website);

  console.log(`[contactEnrichment]   emails: ${result.emails.slice(0, 3).join(", ") || "none"}`);
  console.log(`[contactEnrichment]   phones: ${result.phones.slice(0, 2).join(", ") || "none"}`);

  return result;
}

// ─── Cache wrapper ────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(__dirname, "data", "contact_cache.json");

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
}

function saveCache(cache) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

async function enrichWithCache(companyName) {
  const cache = loadCache();
  const key   = companyName.toLowerCase().trim();
  if (cache[key]) {
    console.log(`[contactEnrichment] Cache hit: ${key}`);
    return cache[key];
  }
  const result = await enrichCompanyContact(companyName);
  cache[key] = { ...result, cachedAt: new Date().toISOString() };
  saveCache(cache);
  return result;
}

module.exports = { enrichCompanyContact, enrichWithCache, generateDomainCandidates };

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const company = process.argv.slice(2).join(" ") || "SunStone Ship Management";
  enrichCompanyContact(company)
    .then(r => { console.log("\n=== Result ===\n" + JSON.stringify(r, null, 2)); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
