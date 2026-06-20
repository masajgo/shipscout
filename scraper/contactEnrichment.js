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
// IMPORTANT: maritime-specific compound words must come FIRST so they are
// stripped before the shorter bare words ("ship", "shipping") match.
const STRIP_WORDS = [
  "ship management", "shipping company", "shipping co",
  "shipmanagement", "shipping", "ship", "ships",
  "marine services", "marine", "maritime",
  "navigation", "offshore", "vessel", "fleet", "tankers", "tanker",
  "bulk", "cargo", "logistics", "transportation", "transport",
  "carriers", "carrier", "ocean", "sea", "port",
  "group", "holding", "holdings", "international", "intl", "global",
  "ltd", "limited", "inc", "llc", "sa", "as", "ab", "bv", "gmbh", "oy",
  "company", "co",
];

// Common role-based email locals — used to filter when detecting personal
// email format (we want a NAMED person, not info@/contact@/…)
const ROLE_LOCALS = new Set([
  "info","contact","hello","support","sales","admin","office","mail","noreply",
  "service","enquiries","enquiry","marketing","finance","hr","crew","crewing",
  "commercial","operations","compliance","charter","technical","accounts",
  "reception","press","media","careers","jobs","recruitment","welcome",
]);

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
  // "Bernhard Schulte Shipmanagement" → leadingAcronym = "bs"
  // (only the proper-noun part, excluding maritime descriptors and corporate suffixes)
  const skipRe = /^(ship|ships|shipping|shipmanagement|marine|maritime|navigation|offshore|vessel|fleet|tanker|tankers|bulk|cargo|sea|ocean|port|group|holding|holdings|international|intl|global|ltd|limited|inc|llc|sa|as|ab|bv|gmbh|oy|company|co|management|services?|trading)$/i;
  const leadingWords = slug.split(/\s+/).filter(w => w.length > 1 && !skipRe.test(w));
  const leadingAcronym = leadingWords.map(w => w[0].toLowerCase()).join("");
  const firstWord   = words[0] || coreNoSpace;

  // Detect if original name had a maritime keyword — use it as suffix hint
  const hasMaritime  = MARITIME_KEYWORDS.some(k => raw.includes(k));
  const maritimeSuffix = hasMaritime ? "ships" :
    raw.includes("ship") ? "ships" :
    raw.includes("shipp") ? "shipping" :
    raw.includes("marine") ? "marine" : "ships";

  // Ordered: most-specific first. Bare core domain is tried early (before initials
  // guesses) so "oldendorff.com" beats "ocmarine.com".
  const initials = leadingAcronym && leadingAcronym.length >= 2 ? leadingAcronym : null;
  const ordered = [
    `${coreNoSpace}${maritimeSuffix}.com`,
    `${coreNoSpace}shipping.com`,
    `${coreNoSpace}ships.com`,
    `${coreNoSpace}marine.com`,
    `${coreNoSpace}maritime.com`,
    `${coreNoSpace}-shipmanagement.com`, // hyphenated — catches "columbia-shipmanagement.com"
    `${coreNoSpace}.com`,              // bare core — catches "oldendorff.com", "cargill.com"
    `${coreHyphen}.com`,
    `${coreNoSpace}group.com`,
    `${coreNoSpace}group.org`,
    `${firstWord}${maritimeSuffix}.com`,
    `${firstWord}ships.com`,
    `${firstWord}shipping.com`,
    `${firstWord}marine.com`,
    `${firstWord}.com`,
    // Initials-style maritime domains (e.g. "Bernhard Schulte" → "bs-shipmanagement.com")
    initials ? `${initials}-shipmanagement.com` : null,
    initials ? `${initials}shipmanagement.com` : null,
    initials ? `${initials}-shipping.com` : null,
    initials ? `${initials}ships.com` : null,
    initials ? `${initials}shipping.com` : null,
    initials ? `${initials}marine.com` : null,
    initials ? `${initials}.com` : null,
    `${acronym}ships.com`,
    `${acronym}shipping.com`,
    `${acronym}marine.com`,
    `${slugNoSpace}.com`,
    `${coreNoSpace}mgmt.com`,
    `${coreNoSpace}.net`,
    `${coreNoSpace}.org`,
  ].filter(Boolean);

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
  // Require ≥4 matches to avoid e-commerce sites ("free shipping", "cargo pants",
  // "sea blue" colors) triggering as maritime companies.
  const hits = MARITIME_KEYWORDS.filter(k => text.includes(k)).length;
  return hits >= 4;
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

// Image-file extensions that the email regex accidentally matches (e.g. "flag@2x.png")
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|woff2?|ttf|eot|otf|css|js|map)$/i;

function extractEmails(html) {
  const raw = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0].toLowerCase())
    // strip pseudo-emails that are really image filenames (sprite@2x.png, etc.)
    .filter(e => !IMAGE_EXT_RE.test(e))
    // strip obvious placeholders
    .filter(e => !/^(example|test|email|user|name|youremail|domain)@/i.test(e))
    // require a non-numeric local part of at least 2 chars
    .filter(e => /^[a-z][a-z0-9._%+\-]{1,}@/.test(e));
  return [...new Set(raw.filter(e => !PERSONAL_EMAIL_DOMAINS.test(e)))];
}

function extractPhones(html) {
  const raw = [...html.matchAll(/\+\d[\d\s\-().]{6,20}\d/g)].map(m => m[0].trim());
  return [...new Set(raw)].slice(0, 6);
}

// Address extraction: street name + number, fallback to postal-code anchor.
// Prefer the FIRST address found (HQ is usually listed first in contact pages).
function extractAddress(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Look for street-name + number patterns (e.g. "Boltonvej 7", "Main Street 123")
  // Street name must be at least 4 characters before the suffix keyword
  const streetRe = /\b([A-ZÆØÅ][a-zæøåÆØÅüöä]{3,}(?:[a-zæøåA-ZÆØÅ\-]*\s+)?(?:vej|gade|allé|boulevard|street|avenue|road|lane|drive|way|plads|square|str\.?))\s+(\d{1,5}[A-Za-z]?(?:[, ]+(?:[A-Z]{2}-?)?\d{4,5}[A-Za-z\s,]{0,50})?)/gi;

  const candidates = [];
  let m;
  while ((m = streetRe.exec(text)) !== null) {
    const val = `${m[1].trim()} ${m[2].trim()}`;
    const extra = text.slice(m.index + m[0].length, m.index + m[0].length + 60)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|Manager|Director|Chief|Copyright|All rights|\+\d).*/i, "")
      .trim();
    const clean = (val + " " + extra)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|\+\d).*/i, "")
      .trim()
      .slice(0, 100);
    if (clean.length > 8) candidates.push({ pos: m.index, text: clean });
  }

  // Fallback: postal-code anchor (e.g. "DK-2300 Copenhagen S")
  const pcRe = /\b([A-Z]{2}-\d{4,5}\s+[A-Za-zæøåÆØÅ\s]{3,30})/g;
  while ((m = pcRe.exec(text)) !== null) {
    candidates.push({ pos: m.index, text: m[1].trim() });
  }

  if (!candidates.length) return null;
  // Sort by position — prefer the FIRST address (HQ), not the last (footer / branch)
  candidates.sort((a, b) => a.pos - b.pos);
  return candidates[0].text.trim();
}

// Static guess from emails already on the contact page — skips role locals.
function guessEmailFormat(emails, domain) {
  if (!domain || emails.length === 0) return null;
  const own = emails.filter(e => e.includes(domain.split(".")[0]));
  for (const e of own) {
    const local = e.split("@")[0];
    if (ROLE_LOCALS.has(local)) continue;
    if (/^[a-z]\.[a-z]{3,}$/.test(local))     return `first_initial.last@${domain}`;
    if (/^[a-z]{3,}\.[a-z]{3,}$/.test(local)) return `first.last@${domain}`;
    if (/^[a-z]-[a-z]{3,}$/.test(local))      return `first_initial-last@${domain}`;
    if (local.includes("-"))                  return `first-last@${domain}`;
  }
  return null;
}

// If we couldn't find a named-individual email on /contact, probe /team /about etc.
async function detectEmailFormat(domain) {
  for (const p of ["/team", "/about", "/our-team", "/people", "/management", "/staff"]) {
    const html = await fetchPage(`https://www.${domain}${p}`);
    if (!html) continue;
    const emails = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
      .map(m => m[0].toLowerCase())
      .filter(e => e.includes(domain.split(".")[0]) && !PERSONAL_EMAIL_DOMAINS.test(e));
    for (const e of emails) {
      const local = e.split("@")[0];
      if (ROLE_LOCALS.has(local)) continue;
      if (/^[a-z]\.[a-z]{3,}$/.test(local))     return `first_initial.last@${domain}`;
      if (/^[a-z]{3,}\.[a-z]{3,}$/.test(local)) return `first.last@${domain}`;
      if (/^[a-z]-[a-z]{3,}$/.test(local))      return `first_initial-last@${domain}`;
      if (/^[a-z]{5,10}$/.test(local))          return `firstlast@${domain}`;
    }
  }
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
  // Try static guess first; if no named pattern found, probe /team /about etc.
  result.emailFormat = guessEmailFormat(result.emails, result.website)
    || await detectEmailFormat(result.website);

  console.log(`[contactEnrichment]   emails: ${result.emails.slice(0, 3).join(", ") || "none"}`);
  console.log(`[contactEnrichment]   phones: ${result.phones.slice(0, 2).join(", ") || "none"}`);

  return result;
}

// ─── Cache wrapper ────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(__dirname, "data", "contact_cache.json");

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { return {}; }
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
