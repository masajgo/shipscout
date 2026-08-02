"use strict";

/**
 * linkedinLookup.js — Top-50 ship manager/owner LinkedIn company profile URLs
 *
 * Static map: normalized company name → LinkedIn company profile URL.
 * Used to avoid generic search URLs for well-known managers.
 * No LinkedIn API calls are made — these are hardcoded profile links.
 *
 * Lookup is case-insensitive and partial-match-tolerant (longest match wins).
 */

// [company display name, linkedin-slug or full URL]
const ENTRIES = [
  // ── Container / Liner ───────────────────────────────────────────────────────
  ["Maersk",                       "maersk"],
  ["Maersk A/S",                   "maersk"],
  ["A.P. Møller – Mærsk",          "maersk"],
  ["Moller Singapore AP",          "maersk"],
  ["MSC Mediterranean Shipping",   "msc-mediterranean-shipping-company"],
  ["Mediterranean Shipping",       "msc-mediterranean-shipping-company"],
  ["CMA CGM",                      "cma-cgm"],
  ["Hapag-Lloyd",                  "hapag-lloyd"],
  ["Hapag Lloyd",                  "hapag-lloyd"],
  ["COSCO Shipping",               "cosco-shipping"],
  ["China Ocean Shipping",         "cosco-shipping"],
  ["OOCL",                         "oocl"],
  ["Orient Overseas",              "oocl"],
  ["Evergreen Marine",             "evergreen-marine"],
  ["Yang Ming",                    "yang-ming-marine-transport"],
  ["HMM",                          "hmm-co"],
  ["Hyundai Merchant Marine",      "hmm-co"],
  ["ONE Ocean Network Express",    "one-ocean-network-express"],
  ["Ocean Network Express",        "one-ocean-network-express"],
  ["Zim",                          "zim-integrated-shipping-services"],
  ["PIL Pacific International",    "pacific-international-lines"],
  ["Pacific International Lines",  "pacific-international-lines"],
  ["Wan Hai",                      "wan-hai-lines"],
  // ── Tanker ──────────────────────────────────────────────────────────────────
  ["Frontline",                    "frontline-ltd"],
  ["Euronav",                      "euronav"],
  ["Torm",                         "torm"],
  ["Ardmore Shipping",             "ardmore-shipping"],
  ["Scorpio Tankers",              "scorpio-tankers"],
  ["Dorian LPG",                   "dorian-lpg"],
  ["BW Group",                     "bw-group"],
  ["BW LPG",                       "bw-lpg"],
  ["Nordic Tankers",               "nordic-tankers"],
  ["Nordic American Tankers",      "nordic-american-tankers"],
  ["Navigator Gas",                "navigator-gas"],
  ["Maran Tankers",                "maran-tankers-management"],
  ["Dynacom Tankers",              "dynacom-tankers-management"],
  ["Capital Ship Management",      "capital-ship-management"],
  ["Tsakos Energy Navigation",     "tsakos-energy-navigation"],
  ["TEN Ltd",                      "tsakos-energy-navigation"],
  ["Thenamaris",                   "thenamaris"],
  ["Enesel",                       "enesel"],
  // ── Bulker ──────────────────────────────────────────────────────────────────
  ["Star Bulk Carriers",           "star-bulk-carriers"],
  ["Star Bulk",                    "star-bulk-carriers"],
  ["Oldendorff",                   "oldendorff-carriers"],
  ["Oldendorff Carriers",         "oldendorff-carriers"],
  ["Pacific Basin",                "pacific-basin-shipping"],
  ["Pacific Basin Shipping",       "pacific-basin-shipping"],
  ["Western Bulk",                 "western-bulk"],
  ["Klaveness",                    "klaveness"],
  ["Diana Shipping",               "diana-shipping-inc"],
  // ── Ship Management / Technical ─────────────────────────────────────────────
  ["Anglo-Eastern",                "angloeastern"],
  ["Anglo Eastern",                "angloeastern"],
  ["Wallem",                       "wallem-group"],
  ["Wallem Group",                 "wallem-group"],
  ["Thome Ship Management",        "thome-ship-management"],
  ["Thome Group",                  "thome-ship-management"],
  ["V.Ships",                      "v-ships"],
  ["V Ships",                      "v-ships"],
  ["BSM Bernhard Schulte",         "bernhard-schulte-shipmanagement"],
  ["Bernhard Schulte",             "bernhard-schulte-shipmanagement"],
  ["Columbia Shipmanagement",      "columbia-shipmanagement"],
  ["Columbia Ship Management",     "columbia-shipmanagement"],
  ["Norbulk",                      "norbulk-shipping"],
  ["Doehle",                       "doehle-group"],
  ["Reederei NSB",                 "reederei-nsb"],
  ["Sinokor",                      "sinokor-merchant-marine"],
  ["Sinokor Merchant Marine",      "sinokor-merchant-marine"],
  ["Grindrod",                     "grindrod"],
  ["Grieg Maritime",               "grieg-maritime"],
  ["Naftomar",                     "naftomar-shipping-and-trading"],
  ["Stena",                        "stena-group"],
  ["Zodiac Maritime",              "zodiac-maritime"],
  ["Premuda",                      "premuda"],
  ["Denholm",                      "j-&-j-denholm"],
  ["J&J Denholm",                  "j-&-j-denholm"],
  // ── Turkish (Aliağa relevant) ────────────────────────────────────────────────
  ["Türkiye Denizcilik",           "turkiye-denizcilik-isletmeleri"],
  ["Arkas",                        "arkas-holding"],
  ["UN Ro-Ro",                     "un-ro-ro"],
  ["Kiran Group",                  "kiran-group-of-companies"],
  // ── Indian subcontinent (Alang relevant) ────────────────────────────────────
  ["SCI Shipping Corporation of India", "shipping-corporation-of-india"],
  ["Shipping Corporation of India",     "shipping-corporation-of-india"],
  ["Essar Shipping",               "essar-shipping"],
  ["Great Eastern",                "the-great-eastern-shipping-company"],
  ["Great Eastern Shipping",       "the-great-eastern-shipping-company"],
];

const LI_BASE = "https://www.linkedin.com/company/";

// Normalize: lowercase, collapse whitespace, strip punctuation for fuzzy matching
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Build lookup map: normalized name → profile URL
const LOOKUP = new Map(
  ENTRIES.map(([name, slug]) => [
    normalize(name),
    slug.startsWith("http") ? slug : `${LI_BASE}${slug}/`,
  ])
);

/**
 * Look up a known LinkedIn company profile URL for a ship manager/owner name.
 * Returns null if the company is not in the static table.
 *
 * Strategy:
 *   1. Exact match after normalization
 *   2. Substring: table entry appears in query (e.g. "Maersk" in "Maersk A/S")
 *   3. Substring: query appears in table entry (longest match wins)
 */
function lookupLinkedIn(companyName) {
  if (!companyName) return null;
  const query = normalize(companyName);

  // Exact match
  if (LOOKUP.has(query)) return LOOKUP.get(query);

  // Entry key appears in query (e.g. query="ap moller maersk a s" contains "maersk")
  let best = null, bestLen = 0;
  for (const [key, url] of LOOKUP) {
    if (query.includes(key) && key.length > bestLen) { best = url; bestLen = key.length; }
  }
  if (best) return best;

  // Query appears in entry key (e.g. query="maersk" in key="maersk a s")
  bestLen = 0; best = null;
  for (const [key, url] of LOOKUP) {
    if (key.includes(query) && query.length > bestLen) { best = url; bestLen = query.length; }
  }
  return best;
}

module.exports = { lookupLinkedIn };
