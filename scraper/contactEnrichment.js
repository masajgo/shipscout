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
const dns  = require("dns").promises;

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

// Layer 1 — S&P / chartering department prefixes (highest priority)
const DEPARTMENT_LOCALS = new Set([
  "sale-purchase","snp","s-p","chartering","newbuilding","new-building",
  "sale","sales","purchase","commercial","charter","ops","operations",
  "ch","vetting","post-fixture","postfixture","dry","tanker","bulk","lpg","lng",
]);

// Layer 2 — generic role prefixes
const GENERIC_LOCALS = new Set([
  "info","contact","hello","office","mail","support","admin","noreply","no-reply",
  "enquiries","enquiry","service","accounts","marketing","finance","hr","crew","crewing",
]);

function categorizeEmails(emails) {
  const department = [], generic = [], other = [];
  for (const e of emails) {
    const local    = e.split("@")[0].toLowerCase();
    const segment0 = local.split(/[.\-_]/)[0]; // "ch.tanker" → "ch", "lpg-operations" → "lpg"
    if (DEPARTMENT_LOCALS.has(local) || DEPARTMENT_LOCALS.has(segment0))
      department.push(e);
    else if (GENERIC_LOCALS.has(local) || GENERIC_LOCALS.has(segment0))
      generic.push(e);
    else
      other.push(e);
  }
  return { department, generic, other };
}

function guessEmailsFromName(managerName, emailFormat, domain) {
  if (!managerName || !emailFormat || !domain) return [];
  const parts = managerName.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  if (parts.length < 2) return [];
  const first = parts[0];
  const last  = parts[parts.length - 1];
  const fi    = first[0];
  const pattern = emailFormat.split("@")[0];
  let local = null;
  if (pattern === "first_initial.last")      local = `${fi}.${last}`;
  else if (pattern === "first.last")         local = `${first}.${last}`;
  else if (pattern === "first_initial-last") local = `${fi}-${last}`;
  else if (pattern === "firstlast")          local = `${first}${last}`;
  if (!local) return [];
  return [{ email: `${local}@${domain}`, name: managerName, guessed: true }];
}

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

// ─── Web search for domain ────────────────────────────────────────────────────

// Social / aggregator domains to skip in search results (extends AGGREGATOR_DOMAINS)
const SKIP_SEARCH_HOSTS = /linkedin|facebook|bloomberg|crunchbase|dnb\.com|zoominfo|rocketreach|leadiq|equasis|marinetraffic|vesseltracker|fleetmon|shipfinder|yellowpages|yelp|trustpilot|glassdoor|indeed|twitter|instagram|wikipedia|wikidata|opencorporates|bizapedia|corporationwiki|companieshouse|sec\.gov|patents|scholar\.google|books\.google|maps\.google|play\.google|apps\.apple|youtube|vimeo|reddit|quora|medium|substack|news\.ycombinator|europages|kompass\.com|businessdirectory|bizinformation|thetimes|reuters\.com|ft\.com|lloydslist|vesselfinder|balticshipping|maritime-connector|shipspotting|tradewindsnews|seatrade/i;

async function searchWebForDomain(companyName) {
  const query = `"${companyName}" official website`;
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=en-us`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return [];
    const html = await res.text();

    const domains = [];

    // DDG HTML displays result URLs in <a class="result__url">www.example.com/…</a>
    const re = /<a[^>]+class="result__url"[^>]*>\s*([^<\s]+)\s*<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw    = m[1].trim().toLowerCase().replace(/^www\./, "");
      const domain = raw.split(/[/?#]/)[0];
      if (domain && domain.includes(".") && !SKIP_SEARCH_HOSTS.test(domain)) {
        domains.push(domain);
      }
    }

    // Fallback: extract from uddg redirect params (DDG sometimes uses these)
    if (domains.length === 0) {
      const uddgRe = /uddg=([^"&]+)/g;
      while ((m = uddgRe.exec(html)) !== null) {
        try {
          const decoded = decodeURIComponent(m[1]);
          const u       = new URL(decoded);
          const domain  = u.hostname.replace(/^www\./, "");
          if (domain && !SKIP_SEARCH_HOSTS.test(domain)) domains.push(domain);
        } catch {}
      }
    }

    return [...new Set(domains)].slice(0, 6);
  } catch (e) {
    console.log(`[contactEnrichment] Web search error: ${e.message}`);
    return [];
  }
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
  const raw             = companyName.toLowerCase();
  const needsValidation = MARITIME_KEYWORDS.some(k => raw.includes(k));

  // 1. Web search layer — try DuckDuckGo first
  const searchDomains = await searchWebForDomain(companyName);
  if (searchDomains.length) {
    console.log(`[contactEnrichment]   Web search returned: ${searchDomains.join(", ")}`);
    for (const domain of searchDomains) {
      const url = await probeDomain(domain);
      if (!url) continue;
      if (needsValidation && !(await validateMaritime(url))) {
        console.log(`[contactEnrichment]   Web search: ${domain} failed maritime check`);
        continue;
      }
      console.log(`[contactEnrichment]   Domain via web search: ${domain}`);
      return url;
    }
    console.log(`[contactEnrichment]   Web search candidates exhausted, falling back to heuristic`);
  }

  // 2. Fallback — heuristic candidate list
  const candidates = generateDomainCandidates(companyName);
  for (const domain of candidates) {
    const url = await probeDomain(domain);
    if (!url) continue;
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
    // strip obvious placeholders and template domains
    .filter(e => !/^(example|test|email|user|name|youremail|domain)@/i.test(e))
    .filter(e => !/@(example\.(com|org|net)|test\.com|placeholder\.|domain\.com)/i.test(e))
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

// ─── Email validation ─────────────────────────────────────────────────────────
//
// Migration (run once):
//   ALTER TABLE owners ADD COLUMN IF NOT EXISTS email_validations jsonb DEFAULT '{}';
//   ALTER TABLE owners ADD COLUMN IF NOT EXISTS best_email text;
//
// email_validations schema: { "addr@domain": { status, isRole, source, checkedAt, protected }, … }
// status values: verified | catch-all | invalid | unchecked | syntax_fail | no_mx
//
// LAZY VALIDATION RULES (credit conservation):
//   1. dept/generic emails → local only (no ZB call), trusted from scrape
//   2. guessed emails → ZB only at outreach time (user clicks mailto)
//   3. protected MX (Mimecast/Proofpoint/etc.) → skip ZB entirely, return unchecked
//   4. already validated (cached status) → skip ZB, return cached
//   5. monthly budget 100 → warn at 95, hard stop at 100

const RFC_EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

const PROTECTED_MX_RE = /mimecast\.com|pphosted\.com|proofpoint\.com|barracudanetworks\.com|cudamail\.com|mail\.protection\.outlook\.com|eo\.outlook\.com|ironport\.com|iphmx\.com|sma\.cisco\.com|messagelabs\.com|symanteccloud\.com|mailcontrol\.com|spamh\.com|antispameurope\.com|hornetsecurity\.com|retarus\.com|ppe-hosted\.com|hydra\.sophos\.com|reflexion\.net|mailhop\.org/i;

// ── ZeroBounce monthly credit counter ────────────────────────────────────────

const ZB_USAGE_FILE = path.join(__dirname, "data", "zb_usage.json");
const ZB_LIMIT      = 100;
const ZB_WARN_AT    = 95;

function _zbMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function _loadZbUsage() {
  try {
    if (fs.existsSync(ZB_USAGE_FILE)) return JSON.parse(fs.readFileSync(ZB_USAGE_FILE, "utf8"));
  } catch {}
  return {};
}

function _saveZbUsage(data) {
  fs.mkdirSync(path.dirname(ZB_USAGE_FILE), { recursive: true });
  fs.writeFileSync(ZB_USAGE_FILE, JSON.stringify(data, null, 2));
}

function zbBudget() {
  const usage = _loadZbUsage();
  const count = usage[_zbMonth()]?.count || 0;
  return { count, remaining: ZB_LIMIT - count, ok: count < ZB_LIMIT };
}

function _zbIncrement(email) {
  const usage = _loadZbUsage();
  const month = _zbMonth();
  if (!usage[month]) usage[month] = { count: 0, calls: [] };
  usage[month].count++;
  usage[month].calls.push({ email, at: new Date().toISOString() });
  _saveZbUsage(usage);
  const count = usage[month].count;
  if (count >= ZB_WARN_AT && count < ZB_LIMIT) {
    console.warn(`[contactEnrichment] ⚠ ZeroBounce aylık limit dolmak üzere (${count}/${ZB_LIMIT})`);
  }
  return count;
}

// ── MX cache & helpers ────────────────────────────────────────────────────────

const _mxCache = new Map();

async function getMX(domain) {
  if (_mxCache.has(domain)) return _mxCache.get(domain);
  try {
    const records = await dns.resolveMx(domain);
    records.sort((a, b) => a.priority - b.priority);
    const mx = records[0]?.exchange || null;
    _mxCache.set(domain, mx);
    return mx;
  } catch {
    _mxCache.set(domain, null);
    return null;
  }
}

function isProtectedMX(mxHost) {
  return mxHost ? PROTECTED_MX_RE.test(mxHost) : false;
}

// ── ZeroBounce raw call ───────────────────────────────────────────────────────

async function _zbValidate(email, apiKey) {
  try {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}&ip_address=`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return "unknown";
    const j = await res.json();
    return j.status || "unknown";
  } catch {
    return "unknown";
  }
}

// ── Core validation ───────────────────────────────────────────────────────────

// Full single-email validation: syntax → MX → (optionally) ZeroBounce
// ZeroBounce is SKIPPED when: no key | protected MX | budget exhausted
// Returns: { status, isRole, protected, source }
async function validateEmail(email, zbApiKey = null) {
  if (!RFC_EMAIL_RE.test(email)) {
    return { status: "syntax_fail", isRole: false, protected: false, source: "local" };
  }

  const domain     = email.split("@")[1].toLowerCase();
  const mx         = await getMX(domain);
  if (!mx) {
    return { status: "no_mx", isRole: false, protected: false, source: "local" };
  }

  const local      = email.split("@")[0].toLowerCase();
  const isRole     = ROLE_LOCALS.has(local) || GENERIC_LOCALS.has(local);
  const isShielded = isProtectedMX(mx);

  // No key → local only
  if (!zbApiKey) {
    return { status: "unchecked", isRole, protected: isShielded, source: "local" };
  }

  // Rule 3: Protected MX → skip ZeroBounce, no credit spent
  if (isShielded) {
    console.log(`[contactEnrichment] Skip ZB (protected MX): ${email}`);
    return { status: "unchecked", isRole, protected: true, source: "local" };
  }

  // Rule 5: Budget check
  const budget = zbBudget();
  if (!budget.ok) {
    console.log(`[contactEnrichment] ZeroBounce limit doldu (${budget.count}/${ZB_LIMIT}), unchecked`);
    return { status: "unchecked", isRole, protected: false, source: "local" };
  }

  await sleep(2500);
  const zbRaw = await _zbValidate(email, zbApiKey);
  _zbIncrement(email);

  const status =
    zbRaw === "valid"                                               ? "verified"   :
    zbRaw === "catch-all"                                           ? "catch-all"  :
    ["invalid","spamtrap","abuse","do_not_mail"].includes(zbRaw)    ? "invalid"    :
                                                                      "unchecked";

  return { status, isRole, protected: false, source: "zerobounce" };
}

// ── Lazy outreach validation ──────────────────────────────────────────────────
// Called ONLY when user clicks outreach for a guessed email.
// Returns cached result if already validated, otherwise runs ZeroBounce.
// Rule 4: existing non-unchecked status → return cache, no new ZB call.
async function validateOnOutreach(email, zbApiKey, existingValidations = {}) {
  const cached = existingValidations?.[email];

  // Cache hit: already has a definitive status (not unchecked/local)
  if (cached?.status && cached.status !== "unchecked" && cached.source !== "local") {
    return { ...cached, fromCache: true };
  }

  // Run full validation (protected MX + budget checks inside validateEmail)
  const result = await validateEmail(email, zbApiKey);
  return { ...result, checkedAt: new Date().toISOString() };
}

// Validate a list of emails, return Map<email, { status, isRole, source, checkedAt }>
async function validateEmails(emails, zbApiKey = null) {
  const map = new Map();
  for (const email of emails) {
    const v = await validateEmail(email, zbApiKey);
    map.set(email, { ...v, checkedAt: new Date().toISOString() });
  }
  return map;
}

// Pick one best email from validation map + category buckets.
// Priority order: verified-dept → verified-other → verified-generic →
//                 catch-all-dept → catch-all-other →
//                 unchecked-dept → unchecked-other → unchecked-generic
// Never returns: invalid | syntax_fail | no_mx
function pickBestEmail(validationsMap, emailsByType) {
  const TIERS  = [emailsByType.department, emailsByType.other, emailsByType.generic];
  const PASSES = ["verified", "catch-all", "unchecked"];

  for (const pass of PASSES) {
    for (const bucket of TIERS) {
      for (const e of bucket) {
        const v = validationsMap?.get?.(e);
        if (v?.status === pass) return e;
      }
    }
  }
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

// opts: { zbApiKey?: string }
async function enrichCompanyContact(companyName, managerName, opts = {}) {
  const zbApiKey = opts.zbApiKey || null;
  console.log(`[contactEnrichment] Searching: "${companyName}"`);

  const linkedinCompanyUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`;
  const linkedinPeopleUrl  = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName + " chartering sale purchase")}`;

  const result = {
    company:            companyName,
    website:            null,
    emails:             [],
    emailsByType:       { department: [], generic: [], other: [] },
    phones:             [],
    address:            null,
    emailFormat:        null,
    guessedEmails:      [],
    emailValidations:   {},   // { email: { status, isRole, source, checkedAt } }
    bestEmail:          null,
    linkedinCompanyUrl,
    linkedinPeopleUrl,
    linkedinSearchUrl:  linkedinCompanyUrl,
    source:             "web",
    contactPath:        null,
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

  result.emails       = extractEmails(found.html);
  result.emailsByType = categorizeEmails(result.emails);
  result.phones       = extractPhones(found.html);
  result.address      = extractAddress(found.html);
  result.emailFormat  = guessEmailFormat(result.emails, result.website)
    || await detectEmailFormat(result.website);

  if (managerName && result.emailFormat && result.website) {
    result.guessedEmails = guessEmailsFromName(managerName, result.emailFormat, result.website);
  }

  // ── Local validation only (syntax + MX) — no ZeroBounce credits spent ───────
  // Rule 1: dept/generic trusted from scrape, no ZB needed.
  // Rule 2: guessed emails validated lazily at outreach time via /api/emails/validate.
  const allToValidate = [
    ...result.emails,
    ...result.guessedEmails.map(g => g.email),
  ];

  if (allToValidate.length) {
    console.log(`[contactEnrichment]   Local validation (syntax+MX) for ${allToValidate.length} email(s)…`);
    const validationsMap = await validateEmails(allToValidate, null); // null = no ZeroBounce

    // Drop emails that are clearly broken (syntax / no MX)
    const HARD_FAIL = new Set(["syntax_fail", "no_mx"]);
    result.guessedEmails = result.guessedEmails
      .map(g => ({ ...g, emailStatus: validationsMap.get(g.email)?.status || "unchecked" }))
      .filter(g => !HARD_FAIL.has(g.emailStatus));

    for (const bucket of ["department", "generic", "other"]) {
      result.emailsByType[bucket] = result.emailsByType[bucket].filter(
        e => !HARD_FAIL.has(validationsMap.get(e)?.status)
      );
    }
    result.emails = result.emails.filter(e => !HARD_FAIL.has(validationsMap.get(e)?.status));

    result.emailValidations = Object.fromEntries(validationsMap);
    result.bestEmail = pickBestEmail(validationsMap, result.emailsByType);
  }

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

// DB-first enrichment: checks owners table (30-day TTL), scrapes on miss, persists result.
// Falls back to file cache if pool/imo not provided.
// opts: { zbApiKey?: string }
async function enrichWithDb(companyName, imo, pool, managerName, opts = {}) {
  const TTL_30D = 30 * 24 * 60 * 60 * 1000;

  // 1. DB cache check
  if (pool && imo) {
    try {
      const { rows } = await pool.query(`
        SELECT website, emails, phones, address, email_format,
               department_emails, generic_emails, guessed_emails,
               email_validations, best_email,
               linkedin_company_url, linkedin_people_url, web_fetched_at
        FROM owners WHERE imo = $1::bigint
      `, [imo]);
      const row = rows[0];
      if (row?.web_fetched_at) {
        const ageMs = Date.now() - new Date(row.web_fetched_at).getTime();
        if (ageMs < TTL_30D) {
          console.log(`[contactEnrichment] DB cache hit: IMO ${imo}`);
          const emails = row.emails || [];
          return {
            company:            companyName,
            website:            row.website || null,
            emails,
            emailsByType: {
              department: row.department_emails || [],
              generic:    row.generic_emails    || [],
              other:      emails.filter(e => {
                const local = e.split("@")[0];
                return !DEPARTMENT_LOCALS.has(local) && !GENERIC_LOCALS.has(local);
              }),
            },
            emailFormat:        row.email_format        || null,
            guessedEmails:      row.guessed_emails       || [],
            emailValidations:   row.email_validations    || {},
            bestEmail:          row.best_email           || null,
            phones:             row.phones || [],
            address:            null,
            linkedinCompanyUrl: row.linkedin_company_url || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
            linkedinPeopleUrl:  row.linkedin_people_url  || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName + " chartering sale purchase")}`,
            linkedinSearchUrl:  row.linkedin_company_url || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
            contactPath:        null,
            source:             "db",
          };
        }
      }
    } catch (e) {
      console.warn(`[contactEnrichment] DB cache check error: ${e.message}`);
    }
  }

  // 2. Scrape + validate
  const result = await enrichCompanyContact(companyName, managerName, opts);

  // 3. Persist to DB
  if (pool && imo) {
    try {
      await pool.query(`
        UPDATE owners SET
          website              = COALESCE($2, website),
          emails               = COALESCE($3::text[], emails),
          phones               = COALESCE($4::text[], phones),
          address              = COALESCE($5, address),
          email_format         = COALESCE($6, email_format),
          department_emails    = $7::text[],
          generic_emails       = $8::text[],
          guessed_emails       = $9::jsonb,
          linkedin_company_url = $10,
          linkedin_people_url  = $11,
          email_validations    = COALESCE($12::jsonb, email_validations),
          best_email           = COALESCE($13, best_email),
          contact_source       = 'web',
          web_fetched_at       = now()
        WHERE imo = $1::bigint
      `, [
        imo,
        result.website || null,
        result.emails?.length   ? result.emails   : null,
        result.phones?.length   ? result.phones   : null,
        result.address          || null,
        result.emailFormat      || null,
        result.emailsByType?.department || [],
        result.emailsByType?.generic    || [],
        JSON.stringify(result.guessedEmails || []),
        result.linkedinCompanyUrl,
        result.linkedinPeopleUrl,
        Object.keys(result.emailValidations || {}).length
          ? JSON.stringify(result.emailValidations)
          : null,
        result.bestEmail || null,
      ]);
      console.log(`[contactEnrichment] DB updated: IMO ${imo}`);
    } catch (e) {
      console.warn(`[contactEnrichment] DB persist error: ${e.message}`);
    }
  } else {
    // File cache fallback
    const cache = loadCache();
    const key   = companyName.toLowerCase().trim();
    cache[key]  = { ...result, cachedAt: new Date().toISOString() };
    saveCache(cache);
  }

  return result;
}

// Legacy file-cache wrapper (kept for backward compat with standalone scripts)
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

module.exports = {
  enrichCompanyContact,
  enrichWithCache,
  validateEmail,
  validateEmails,
  validateOnOutreach,
  pickBestEmail,
  zbBudget,
  enrichWithDb,
  categorizeEmails,
  guessEmailsFromName,
  generateDomainCandidates,
};

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const company = process.argv.slice(2).join(" ") || "SunStone Ship Management";
  enrichCompanyContact(company)
    .then(r => { console.log("\n=== Result ===\n" + JSON.stringify(r, null, 2)); })
    .catch(e => { console.error(e.message); process.exit(1); });
}
