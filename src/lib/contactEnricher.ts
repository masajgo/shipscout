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
  "bulk","cargo","logistics","transportation","transport",
  "carriers","carrier","ocean","sea","port",
  "group","holding","holdings","international","intl","global","ltd","limited",
  "inc","llc","sa","as","ab","bv","gmbh","oy","company","co",
];

// Layer 1 — S&P / chartering department prefixes (highest priority)
export const DEPARTMENT_LOCALS = new Set([
  "sale-purchase","snp","s-p","chartering","newbuilding","new-building",
  "sale","purchase","commercial","charter","ops","operations",
]);

// Layer 2 — generic role prefixes
export const GENERIC_LOCALS = new Set([
  "info","contact","hello","office","mail","support","admin","noreply","no-reply",
  "enquiries","enquiry","service","accounts","marketing","finance","hr","crew","crewing",
]);

// ─── Domain candidates ────────────────────────────────────────────────────────

export function generateDomainCandidates(name: string): string[] {
  const raw  = name.toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  let core = slug;
  for (const w of STRIP_WORDS) {
    core = core.replace(new RegExp(`\\b${w}\\b`, "gi"), " ").trim();
  }
  core = core.replace(/\s+/g, " ").trim();

  const cn      = core.replace(/\s/g, "");
  const sn      = slug.replace(/\s/g, "");
  const ch      = core.replace(/\s/g, "-");
  const words   = slug.split(/\s+/).filter(w => w.length > 2).slice(0, 3);
  const acronym = words.map(w => w[0]).join("");
  const first   = words[0] || cn;

  return [...new Set([
    `${cn}ships.com`,    `${cn}shipping.com`,    `${cn}marine.com`,
    `${cn}maritime.com`, `${first}ships.com`,     `${first}shipping.com`,
    `${first}marine.com`,`${cn}group.com`,        `${ch}.com`,
    `${acronym}ships.com`,`${acronym}shipping.com`,`${sn}.com`,
    `${cn}.com`,         `${cn}mgmt.com`,         `${cn}.net`,
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

function extractRawEmails(html: string): string[] {
  const raw = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0].toLowerCase());
  return [...new Set(raw.filter(e => !PERSONAL.test(e)))];
}

export function categorizeEmails(
  emails: string[],
): { department: string[]; generic: string[]; other: string[] } {
  const department: string[] = [];
  const generic:    string[] = [];
  const other:      string[] = [];
  for (const e of emails) {
    const local = e.split("@")[0].toLowerCase();
    if (DEPARTMENT_LOCALS.has(local))   department.push(e);
    else if (GENERIC_LOCALS.has(local)) generic.push(e);
    else                                 other.push(e);
  }
  return { department, generic, other };
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

  const streetRe = /\b([A-ZÆØÅ][a-zæøåÆØÅüöä]{3,}(?:[a-zæøåA-ZÆØÅ\-]*\s+)?(?:vej|gade|allé|boulevard|street|avenue|road|lane|drive|way|plads|square|str\.?))\s+(\d{1,5}[A-Za-z]?(?:[, ]+(?:[A-Z]{2}-?)?\d{4,5}[A-Za-z\s,]{0,50})?)/gi;

  const candidates: { pos: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = streetRe.exec(text)) !== null) {
    const val   = `${m[1].trim()} ${m[2].trim()}`;
    const extra = text.slice(m.index + m[0].length, m.index + m[0].length + 60)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|Manager|Director|Chief|Copyright|All rights|\+\d).*/i, "")
      .trim();
    const clean = (val + " " + extra)
      .replace(/\s*(Tel|Phone|Email|Fax|Finance|Administration|\+\d).*/i, "")
      .trim()
      .slice(0, 100);
    if (clean.length > 8) candidates.push({ pos: m.index, text: clean });
  }

  const pcRe = /\b([A-Z]{2}-\d{4,5}\s+[A-Za-zæøåÆØÅ\s]{3,30})/g;
  // eslint-disable-next-line no-cond-assign
  while ((m = pcRe.exec(text)) !== null) {
    candidates.push({ pos: m.index, text: m[1].trim() });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.pos - b.pos);
  return candidates[0].text.trim();
}

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

// ─── Layer 4: Guess personal email from decision-maker name + detected format ─

export function guessEmailsFromName(
  managerName: string,
  emailFormat: string | null,
  domain: string,
): { email: string; name: string; guessed: true }[] {
  if (!managerName || !emailFormat || !domain) return [];
  const parts = managerName.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  if (parts.length < 2) return [];
  const first = parts[0];
  const last  = parts[parts.length - 1];
  const fi    = first[0];

  // emailFormat is like "first_initial.last@domain" — extract the pattern part
  const pattern = emailFormat.split("@")[0];
  let local: string | null = null;
  if (pattern === "first_initial.last")   local = `${fi}.${last}`;
  else if (pattern === "first.last")      local = `${first}.${last}`;
  else if (pattern === "first_initial-last") local = `${fi}-${last}`;
  else if (pattern === "firstlast")       local = `${first}${last}`;

  if (!local) return [];
  return [{ email: `${local}@${domain}`, name: managerName, guessed: true as const }];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export interface ContactResult {
  company:            string;
  website:            string | null;
  emails:             string[];
  emailsByType:       { department: string[]; generic: string[]; other: string[] };
  emailFormat:        string | null;
  guessedEmails:      { email: string; name: string; guessed: true }[];
  phones:             string[];
  address:            string | null;
  linkedinCompanyUrl: string;
  linkedinPeopleUrl:  string;
  contactPath:        string | null;
}

export async function enrichCompanyContact(
  companyName: string,
  managerName?: string,
): Promise<ContactResult> {
  const result: ContactResult = {
    company:  companyName,
    website:  null,
    emails:   [],
    emailsByType: { department: [], generic: [], other: [] },
    emailFormat:  null,
    guessedEmails:[],
    phones:   [],
    address:  null,
    linkedinCompanyUrl: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`,
    linkedinPeopleUrl:  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName + " chartering sale purchase")}`,
    contactPath: null,
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

  result.contactPath  = found.path;
  const allEmails     = extractRawEmails(found.html);
  result.emails       = allEmails;
  result.emailsByType = categorizeEmails(allEmails);
  result.phones       = extractPhones(found.html);
  result.address      = extractAddress(found.html);
  result.emailFormat  = guessEmailFormat(allEmails, result.website)
    ?? await detectEmailFormat(result.website);

  // Layer 4 — guess personal email for named decision-maker
  if (managerName && result.emailFormat && result.website) {
    result.guessedEmails = guessEmailsFromName(managerName, result.emailFormat, result.website);
  }

  return result;
}
