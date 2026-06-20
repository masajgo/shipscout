/**
 * contactEnrichment.js
 * Given a company name, finds contact info via:
 *   1. Domain guessing (no search API needed)
 *   2. Brave Search API (if BRAVE_SEARCH_KEY env var set — 2000 free/month)
 *   3. Scraping /contact and /about pages of the found website
 *
 * Exports:
 *   enrichCompanyContact(companyName) → { company, website, emails, phones, address, linkedinSearchUrl }
 */

"use strict";

const https = require("https");
const http  = require("http");

// ─── Config ───────────────────────────────────────────────────────────────────

const ENV_PATH = require("path").join(__dirname, "../.env.local");
if (require("fs").existsSync(ENV_PATH)) {
  for (const line of require("fs").readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const BRAVE_KEY = process.env.BRAVE_SEARCH_KEY || null;

// ─── Personal email domains (exclude) ────────────────────────────────────────

const PERSONAL_DOMAINS = new Set([
  "gmail.com","hotmail.com","yahoo.com","outlook.com","aol.com",
  "live.com","icloud.com","me.com","protonmail.com","mail.com",
  "yandex.com","yandex.ru","gmx.com","gmx.net","zoho.com","msn.com",
  "hotmail.co.uk","yahoo.co.uk","yahoo.fr","yahoo.de","web.de","inbox.com",
]);

function isCorporateEmail(email) {
  const domain = (email.split("@")[1] || "").toLowerCase();
  return domain.length > 0 && !PERSONAL_DOMAINS.has(domain);
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function extractEmails(text) {
  const raw = text.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
  return [...new Set(raw.filter(e =>
    isCorporateEmail(e) &&
    !e.includes("example") && !e.includes("noreply") && !e.includes("no-reply") &&
    !e.includes("unsubscribe") && !e.includes("sentry") && !e.includes("privacy") &&
    !e.includes("webmaster") && !e.endsWith(".png") && !e.endsWith(".jpg") &&
    e.length < 80
  ))];
}

function extractPhones(text) {
  const raw = text.match(
    /(?:\+\d{1,3}[\s.\-()]?)?\(?\d{2,4}\)?[\s.\-]?\d{3,4}[\s.\-]?\d{3,5}/g
  ) || [];
  return [...new Set(
    raw.map(p => p.trim()).filter(p => p.replace(/\D/g, "").length >= 7)
  )].slice(0, 3);
}

function extractAddress(text) {
  const m = text.match(/(?:address|headquarter|hq|located at|our office)[:\s,]+([^\n<]{15,120})/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

// ─── HTTP fetch with redirect following ──────────────────────────────────────

function fetchUrl(url, extraHeaders = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error("Too many redirects"));
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }

    const lib  = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     (parsed.pathname || "/") + (parsed.search || ""),
      method:   "GET",
      headers: {
        "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept":          "text/html,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
      timeout: 12000,
    };

    const req = lib.request(opts, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        res.resume();
        return fetchUrl(next, extraHeaders, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = "";
      let done  = false;
      const finish = () => { if (!done) { done = true; resolve({ status: res.statusCode, body: data }); } };
      res.setEncoding("utf8");
      res.on("data", c => { data += c; if (data.length > 400_000) { res.destroy(); finish(); } });
      res.on("end",  finish);
      res.on("error", finish);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

// Test if a URL resolves (returns 200 or 301/302 chain leading to 200)
async function probeUrl(url) {
  try {
    const res = await fetchUrl(url);
    return res.status >= 200 && res.status < 400 ? res : null;
  } catch {
    return null;
  }
}

// ─── Domain guessing ─────────────────────────────────────────────────────────

// Words that are generic suffixes/prefixes in company names
const STOP_WORDS = new Set([
  "management", "group", "holding", "holdings", "international", "intl", "global",
  "company", "corporation", "corp", "limited", "ltd", "inc", "sa",
  "bv", "nv", "as", "aps", "gmbh", "co", "llc", "plc", "spa",
  "pte", "and", "the", "of",
]);

function guessCompanyDomains(companyName) {
  // Strip all punctuation, keep letters and digits
  const raw = companyName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const words = raw.split(/\s+/).filter(w => w.length > 0);

  // Identify "core" words (non-stop-words)
  const core = words.filter(w => !STOP_WORDS.has(w));

  // All words joined, core joined, first word, first two words
  const allJoined  = words.join("");
  const coreJoined = core.join("");
  const first      = words[0] || "";
  const firstTwo   = words.slice(0, 2).join("");

  const candidates = new Set();
  for (const stem of [coreJoined, allJoined, first, firstTwo].filter(s => s.length > 1)) {
    candidates.add(`https://www.${stem}.com`);
    candidates.add(`https://${stem}.com`);
    candidates.add(`https://www.${stem}.net`);
  }
  // Also try hyphenated first-two
  if (core.length >= 2) {
    const hyph = core.slice(0, 2).join("-");
    candidates.add(`https://www.${hyph}.com`);
  }

  return [...candidates];
}

async function findWebsiteByDomainGuessing(companyName) {
  const candidates = guessCompanyDomains(companyName);

  for (const candidate of candidates) {
    try {
      const res = await probeUrl(candidate);
      if (res) {
        return new URL(candidate).origin;
      }
      await sleep(150);
    } catch (e) {
      // probe error — continue to next candidate
    }
  }
  return null;
}

// ─── Brave Search API (optional) ─────────────────────────────────────────────

async function braveSearch(query) {
  if (!BRAVE_KEY) return [];
  try {
    const res = await fetchUrl(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      { "X-Subscription-Token": BRAVE_KEY, "Accept": "application/json" }
    );
    if (res.status !== 200) return [];
    const json = JSON.parse(res.body);
    return (json?.web?.results || []).map(r => ({
      url:  r.url,
      text: r.description || "",
    }));
  } catch {
    return [];
  }
}

// ─── Scrape website contact pages ────────────────────────────────────────────

const URL_EXCLUDES = [
  "linkedin.com", "facebook.com", "twitter.com", "instagram.com", "wikipedia.org",
  "equasis.org", "marinetraffic.com", "dnb.com", "zoominfo.com", "bloomberg.com",
];

async function scrapeWebsiteContact(websiteOrigin) {
  const out  = { emails: [], phones: [], address: null };
  const base = websiteOrigin.replace(/\/$/, "");

  const paths = ["", "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/en/contact"];

  for (const p of paths) {
    try {
      const res = await fetchUrl(base + p);
      if (res.status !== 200) { await sleep(300); continue; }

      const text   = stripHtml(res.body);
      const emails = extractEmails(text);
      const phones = extractPhones(text);
      const addr   = !out.address ? extractAddress(text) : null;

      for (const e of emails) if (!out.emails.includes(e)) out.emails.push(e);
      for (const p2 of phones) if (!out.phones.includes(p2)) out.phones.push(p2);
      if (addr && !out.address) out.address = addr;

      // Stop once we've found emails
      if (out.emails.length > 0 && p !== "") break;
      await sleep(350);
    } catch {
      await sleep(200);
    }
  }

  out.emails = out.emails.slice(0, 5);
  out.phones = out.phones.slice(0, 3);
  return out;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function enrichCompanyContact(companyName) {
  if (!companyName) return null;

  const out = {
    company:          companyName,
    website:          null,
    emails:           [],
    phones:           [],
    address:          null,
    linkedinSearchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
  };

  // 1. Domain guessing — fast, no API needed
  out.website = await findWebsiteByDomainGuessing(companyName);

  // 2. If no website found and Brave key available, use search
  if (!out.website && BRAVE_KEY) {
    await sleep(400);
    const results = await braveSearch(`"${companyName}" ship management official website`);
    for (const { url, text } of results) {
      if (URL_EXCLUDES.some(ex => url.includes(ex))) continue;
      // Grab any emails from the search snippet
      for (const e of extractEmails(text)) {
        if (!out.emails.includes(e)) out.emails.push(e);
      }
      // Use first non-excluded URL as website
      if (!out.website) {
        try { out.website = new URL(url).origin; } catch {}
      }
    }
    await sleep(400);
  }

  // 3. Scrape website /contact and /about pages
  if (out.website) {
    await sleep(300);
    const webData = await scrapeWebsiteContact(out.website);
    for (const e of webData.emails) if (!out.emails.includes(e)) out.emails.push(e);
    for (const p of webData.phones) if (!out.phones.includes(p)) out.phones.push(p);
    if (!out.address) out.address = webData.address;
  }

  // 4. Brave fallback search for email if still nothing
  if (out.emails.length === 0 && BRAVE_KEY) {
    await sleep(600);
    const fallback = await braveSearch(`"${companyName}" shipping email contact maritime`);
    const text = fallback.map(r => r.text).join(" ");
    for (const e of extractEmails(text)) {
      if (!out.emails.includes(e)) out.emails.push(e);
    }
  }

  out.emails = [...new Set(out.emails)].slice(0, 5);
  out.phones = [...new Set(out.phones)].slice(0, 3);

  return out;
}

module.exports = { enrichCompanyContact };
