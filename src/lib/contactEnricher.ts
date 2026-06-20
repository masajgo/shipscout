// Server-side only — Node.js runtime required

const PERSONAL = /gmail|hotmail|yahoo|outlook|icloud|proton|aol|live\.com/i;

const MARITIME_KW = [
  "ship","ships","shipping","marine","maritime","navigation",
  "offshore","vessel","fleet","tanker","bulk","cargo","sea","ocean","port",
];

const STRIP_WORDS = [
  "ship management","shipping company","shipping co","shipping",
  "ship","ships","marine services","marine","maritime",
  "navigation","offshore","vessel","fleet","tankers","tanker",
  "bulk","cargo","logistics","transport","group","holding",
  "holdings","international","intl","global","ltd","limited",
  "inc","llc","sa","as","ab","bv","gmbh","oy","company","co",
];

// ─── Domain candidates ────────────────────────────────────────────────────────

export function generateDomainCandidates(name: string): string[] {
  const raw  = name.toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  let core = slug;
  for (const w of STRIP_WORDS) {
    core = core.replace(new RegExp(`\\b${w}\\b`, "gi"), " ").trim();
  }
  core = core.replace(/\s+/g, " ").trim();

  const cn       = core.replace(/\s/g, "");
  const sn       = slug.replace(/\s/g, "");
  const ch       = core.replace(/\s/g, "-");
  const words    = slug.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  const acronym  = words.map(w => w[0]).join("");
  const first    = words[0] || cn;
  const hasMar   = MARITIME_KW.some(k => raw.includes(k));
  const msuffix  = hasMar ? "ships" : "ships";

  return [...new Set([
    `${cn}${msuffix}.com`, `${cn}shipping.com`, `${cn}ships.com`,
    `${cn}marine.com`,     `${cn}maritime.com`, `${first}${msuffix}.com`,
    `${first}ships.com`,   `${first}shipping.com`, `${first}marine.com`,
    `${cn}group.com`,      `${ch}.com`,          `${acronym}ships.com`,
    `${acronym}shipping.com`, `${sn}.com`,        `${cn}.com`,
    `${cn}mgmt.com`,       `${cn}.net`,
  ])].filter(d => d.length > 5 && !d.startsWith("."));
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

async function get(url: string, method = "GET"): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
    });
    if (!res.ok && res.status !== 405) return null;
    return method === "HEAD" ? res.url : await res.text();
  } catch { return null; }
}

async function probeDomain(domain: string): Promise<string | null> {
  for (const url of [`https://www.${domain}`, `https://${domain}`]) {
    const result = await get(url, "HEAD");
    if (result) return result.replace(/\/+$/, "");
  }
  return null;
}

async function validateMaritime(baseUrl: string): Promise<boolean> {
  const html = await get(baseUrl);
  if (!html) return false;
  const text = html.toLowerCase();
  return MARITIME_KW.filter(k => text.includes(k)).length >= 2;
}

async function fetchContactPage(baseUrl: string): Promise<{ html: string; path: string } | null> {
  const paths = ["/contact", "/contact-us", "/contacts", "/about", "/about-us", "/"];
  for (const p of paths) {
    const html = await get(baseUrl + p);
    if (html && (html.includes("@") || html.includes("tel:"))) return { html, path: p };
  }
  return null;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

function extractEmails(html: string): string[] {
  const raw = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0].toLowerCase());
  return [...new Set(raw.filter(e => !PERSONAL.test(e)))];
}

function extractPhones(html: string): string[] {
  const raw = [...html.matchAll(/\+\d[\d\s\-().]{6,20}\d/g)].map(m => m[0].trim());
  return [...new Set(raw)].slice(0, 6);
}

function extractAddress(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Look for street-name + number patterns (e.g. "Boltonvej 7", "Main Street 123")
  // Street name must be at least 4 characters before the suffix keyword
  const streetRe = /\b([A-ZÆØÅ][a-zæøåÆØÅüöä]{3,}(?:[a-zæøåA-ZÆØÅ\-]*\s+)?(?:vej|gade|allé|boulevard|street|avenue|road|lane|drive|way|plads|square|str\.?))\s+(\d{1,5}[A-Za-z]?(?:[, ]+(?:[A-Z]{2}-?)?\d{4,5}[A-Za-z\s,]{0,50})?)/gi;

  const candidates: { pos: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = streetRe.exec(text)) !== null) {
    const val = `${m[1].trim()} ${m[2].trim()}`;
    // Grab a bit more context after the match for city name
    const extra = text.slice(m.index + m[0].length, m.index + m[0].length + 60)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|Manager|Director|Chief|Copyright|All rights|\+\d).*/i, "")
      .trim();
    // Also clean noise from the captured group itself
    const clean = (val + " " + extra)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|\+\d).*/i, "")
      .trim()
      .slice(0, 100);
    if (clean.length > 8) candidates.push({ pos: m.index, text: clean });
  }

  // Fallback: postal-code anchor (e.g. "DK-2300 Copenhagen S")
  const pcRe = /\b([A-Z]{2}-\d{4,5}\s+[A-Za-zæøåÆØÅ\s]{3,30})/g;
  // eslint-disable-next-line no-cond-assign
  while ((m = pcRe.exec(text)) !== null) {
    candidates.push({ pos: m.index, text: m[1].trim() });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.pos - b.pos);
  return candidates[0].text.trim();
}

// Common role-based email prefixes (not personal name patterns)
const ROLE_LOCALS = new Set([
  "info","contact","hello","support","sales","admin","office","mail","noreply",
  "service","enquiries","enquiry","marketing","finance","hr","crew","crewing",
  "commercial","operations","compliance","charter","technical","accounts",
]);

async function detectEmailFormat(domain: string): Promise<string | null> {
  for (const path of ["/team", "/about", "/our-team", "/people", "/management", "/staff"]) {
    const html = await get(`https://www.${domain}${path}`);
    if (!html) continue;
    const emails = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
      .map(m => m[0].toLowerCase())
      .filter(e => e.includes(domain.split(".")[0]) && !PERSONAL.test(e));
    for (const e of emails) {
      const local = e.split("@")[0];
      if (ROLE_LOCALS.has(local)) continue;
      if (/^[a-z]\.[a-z]{3,}$/.test(local))     return `first_initial.last@${domain}`;
      if (/^[a-z]{3,}\.[a-z]{3,}$/.test(local)) return `first.last@${domain}`;
      if (/^[a-z]-[a-z]{3,}$/.test(local))      return `first_initial-last@${domain}`;
      if (/^[a-z]{5,10}$/.test(local))           return `firstlast@${domain}`;
    }
  }
  return null;
}

function guessEmailFormat(emails: string[], domain: string): string | null {
  const own = emails.filter(e => e.includes(domain.split(".")[0]));
  for (const e of own) {
    const local = e.split("@")[0];
    if (ROLE_LOCALS.has(local)) continue;
    if (/^[a-z]\.[a-z]{3,}$/.test(local))     return `first_initial.last@${domain}`;
    if (/^[a-z]{3,}\.[a-z]{3,}$/.test(local)) return `first.last@${domain}`;
    if (local.includes("-"))                    return `first-last@${domain}`;
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface ContactResult {
  company:          string;
  website:          string | null;
  emails:           string[];
  phones:           string[];
  address:          string | null;
  emailFormat:      string | null;
  linkedinSearchUrl: string;
  contactPath:      string | null;
}

export async function enrichCompanyContact(companyName: string): Promise<ContactResult> {
  const result: ContactResult = {
    company:          companyName,
    website:          null,
    emails:           [],
    phones:           [],
    address:          null,
    emailFormat:      null,
    linkedinSearchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
    contactPath:      null,
  };

  const candidates = generateDomainCandidates(companyName);
  const needsVal   = MARITIME_KW.some(k => companyName.toLowerCase().includes(k));
  let baseUrl: string | null = null;

  for (const domain of candidates) {
    const url = await probeDomain(domain);
    if (!url) continue;
    if (needsVal && !(await validateMaritime(url))) continue;
    baseUrl = url;
    break;
  }

  if (!baseUrl) return result;

  result.website = baseUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

  const found = await fetchContactPage(baseUrl);
  if (!found) return result;

  result.contactPath = found.path;
  result.emails      = extractEmails(found.html);
  result.phones      = extractPhones(found.html);
  result.address     = extractAddress(found.html);
  // Try static guess first; if role-only, probe /team /about for named emails
  result.emailFormat = guessEmailFormat(result.emails, result.website)
    ?? await detectEmailFormat(result.website);

  return result;
}
