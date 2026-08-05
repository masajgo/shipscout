import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 300;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";
const BATCH_SIZE        = 10;
const DEDUP_DAYS        = 7;
const LAYUP_DAYS        = 30;
const LAYUP_MAX         = 100;

const RSS_SOURCES = [
  { name: "gCaptain",           url: "https://gcaptain.com/feed/" },
  { name: "Splash247",          url: "https://splash247.com/feed/" },
  { name: "Maritime Executive", url: "https://maritime-executive.com/feed" },
  // porttechnology.org: robots.txt open (no AI-bot restrictions), feed HTTP 200
  { name: "Port Technology",    url: "https://www.porttechnology.org/feed/" },
  // Marine Insight / Seatrade / Hellenic explicitly block ClaudeBot → excluded
  // TradeWinds / Lloyd's List → paywalled or no public feed
  // Tokyo MOU: APCIS captcha-gated → no automated access; covered by THETIS (EU side)
];

const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

// ── Utility ──────────────────────────────────────────────────────────────────

function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .trim();
}

function extractFirst(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m  = block.match(re);
  return m ? stripTags(m[1].trim()) : null;
}

function extractXmlValues(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function extractIMOs(text: string): string[] {
  const m = text.match(/\b([789]\d{6})\b/g);
  return m ? [...new Set(m)] : [];
}

// ── RSS ───────────────────────────────────────────────────────────────────────

interface RSSItem { title: string; description: string; pubDate: string | null; source: string }

async function fetchRSSFeed(source: { name: string; url: string }): Promise<RSSItem[]> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "ShipScout-RadarBot/1.0" },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  const items: RSSItem[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = stripTags(extractFirst(block, "title") ?? "");
    if (!title) continue;
    items.push({
      title,
      description: stripTags(extractFirst(block, "description") ?? ""),
      pubDate:     extractFirst(block, "pubDate"),
      source:      source.name,
    });
  }
  return items;
}

async function fetchAllRSS(): Promise<RSSItem[]> {
  const all: RSSItem[] = [];
  for (const src of RSS_SOURCES) {
    try {
      const items = await fetchRSSFeed(src);
      all.push(...items);
    } catch (e: any) {
      // best-effort
    }
  }
  return all;
}

// ── Haiku classification ──────────────────────────────────────────────────────

interface ClassifiedEvent {
  imo: string | null; vessel_name: string | null; company_name: string | null;
  event_type: string | null; event_date: string | null; location: string | null;
  source_name: string; summary: string; raw_headline: string;
}

async function classifyBatch(items: RSSItem[]): Promise<ClassifiedEvent[]> {
  const inputLines = items.map((it, i) =>
    `[${i}] HEADLINE: ${it.title}\nSUMMARY: ${it.description.slice(0, 300)}`
  ).join("\n\n");

  const body = {
    model: HAIKU_MODEL, max_tokens: 2048,
    system: [
      "You are a maritime intelligence classifier for a distressed-vessel intelligence platform.",
      "For each news headline+summary, determine if it describes an actionable maritime event involving a SPECIFIC vessel, fleet, or shipowner.",
      "",
      "Event types and their trigger phrases:",
      "  arrest        — vessel physically seized by port/coast guard/law enforcement",
      "                  triggers: 'ship arrested', 'vessel seized by authorities', 'coast guard detained', 'port authority seized', 'cargo vessel seized'",
      "  bank_seizure  — vessel repossessed or arrested by lender/mortgagee",
      "                  triggers: 'mortgagee arrest', 'lender repossession', 'bank arrest', 'arrested by mortgagee', 'fleet seized by lender', 'ship repossessed'",
      "  judicial_auction — court-ordered public sale of vessel",
      "                  triggers: 'vessel auctioned by court', 'admiralty sale', 'judicial sale', 'court-ordered auction', 'admiralty court', 'forced sale'",
      "  bankruptcy    — shipowner/operator enters insolvency, administration, or receivership; extract company_name even if no vessel named",
      "                  triggers: 'owner files for insolvency', 'shipping company bankrupt', 'enters administration', 'receivership', 'Chapter 11', 'winding up', 'creditor protection', 'fleet sold in bankruptcy'",
      "  sanction      — vessel or owner placed on government sanctions list",
      "                  triggers: 'sanctioned', 'blacklisted', 'OFAC', 'EU sanctions', 'SDN list'",
      "  scrap_sale    — vessel sold for demolition/scrapping",
      "                  triggers: 'sold for scrap', 'sent to breakers', 'demolition sale', 'recycled', 'beached for scrapping'",
      "  detention     — PSC inspection detention for safety/compliance deficiencies",
      "                  triggers: 'detained by PSC', 'port state control detention', 'substandard vessel detained'",
      "",
      "Rules:",
      "  - For bankruptcy: if no vessel name present, set vessel_name=null and extract company_name — the platform will link it to the company's fleet.",
      "  - If multiple vessels are named in one article, output one entry per vessel (same index, different vessel_name).",
      "  - event_date must be YYYY-MM-DD format only; if uncertain or only 'Monday'/'yesterday', set null.",
      "  - imo must be a 7-digit number starting with 7, 8, or 9; otherwise null.",
      "  - Set relevant=false for general market news, accidents, weather, port congestion, commodity prices, or analysis pieces without a specific actionable event.",
      "",
      "Return a JSON array with exactly one object per input item (same order, using original index).",
      "Each object: { index, relevant, event_type, vessel_name, company_name, imo, location, event_date, summary }",
      "Return ONLY the JSON array. No prose, no markdown fences.",
    ].join("\n"),
    messages: [{ role: "user", content: `Classify these ${items.length} items:\n\n${inputLines}` }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const raw = (data.content?.[0]?.text ?? "[]").trim()
    .replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  let parsed: any[];
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const relevant: ClassifiedEvent[] = [];
  for (const r of parsed) {
    if (!r.relevant) continue;
    const src = items[r.index];
    if (!src) continue;
    relevant.push({
      imo:          r.imo          || null,
      vessel_name:  r.vessel_name  || null,
      company_name: r.company_name || null,
      event_type:   r.event_type   || null,
      event_date:   r.event_date   || null,
      location:     r.location     || null,
      source_name:  src.source,
      summary:      r.summary      || "",
      raw_headline: src.title,
    });
  }
  return relevant;
}

async function classifyAll(items: RSSItem[]): Promise<ClassifiedEvent[]> {
  const all: ClassifiedEvent[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const res = await classifyBatch(batch);
      all.push(...res);
    } catch {}
  }
  return all;
}

// ── OFAC SDN ──────────────────────────────────────────────────────────────────

async function fetchOFAC(): Promise<{ events: ClassifiedEvent[]; publishDate: string | null }> {
  let xml: string;
  try {
    const res = await fetch(OFAC_SDN_URL, {
      headers: { "User-Agent": "ShipScout-RadarBot/1.0" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return { events: [], publishDate: null };
    xml = await res.text();
  } catch { return { events: [], publishDate: null }; }

  // Extract publication date (MM/DD/YYYY → YYYY-MM-DD)
  const pubM = xml.match(/<Publish_Date>(\d{2})\/(\d{2})\/(\d{4})<\/Publish_Date>/i);
  const publishDate = pubM ? `${pubM[3]}-${pubM[1]}-${pubM[2]}` : null;

  const events: ClassifiedEvent[] = [];
  const entryRe = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml)) !== null) {
    const entry = m[1];
    const sdnType = extractFirst(entry, "sdnType");
    if (!sdnType || sdnType.toLowerCase() !== "vessel") continue;
    const vesselName = extractFirst(entry, "lastName");
    if (!vesselName) continue;
    const uid = extractFirst(entry, "uid") ?? "";

    let imo: string | null = null;
    const idListM = entry.match(/<idList>([\s\S]*?)<\/idList>/i);
    if (idListM) {
      const idRe = /<id>([\s\S]*?)<\/id>/gi;
      let idM: RegExpExecArray | null;
      while ((idM = idRe.exec(idListM[1])) !== null) {
        const idType   = extractFirst(idM[1], "idType") ?? "";
        const idNumber = extractFirst(idM[1], "idNumber") ?? "";
        if (idType.toUpperCase().includes("IMO") || idType.toUpperCase().includes("VESSEL REGISTRATION")) {
          const digits = idNumber.replace(/\D/g, "");
          if (/^[789]\d{6}$/.test(digits)) { imo = digits; break; }
        }
      }
    }
    if (!imo) continue;

    const programs = extractXmlValues(entry, "program").join(", ") || "UNKNOWN";
    events.push({
      imo, vessel_name: stripTags(vesselName), company_name: null,
      event_type: "sanction", event_date: null, location: null,
      source_name: "OFAC SDN",
      summary: `Vessel sanctioned under OFAC program(s): ${programs}.`,
      raw_headline: `OFAC SDN uid:${uid} — ${vesselName} (IMO ${imo}) — ${programs}`,
    });
  }
  return { events, publishDate };
}

// ── Paris MOU / THETIS current detentions ────────────────────────────────────

const THETIS_URL = "https://portal.emsa.europa.eu/o/portlet-public/rest/detention/getCurrentDetentions.json";
const THETIS_REFERER = "https://portal.emsa.europa.eu/widget/web/thetis/current-detentions/-/publicSiteDetention_WAR_portletpublic";

function parseThetisDate(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function fetchThetisDetentions(): Promise<ClassifiedEvent[]> {
  try {
    const res = await fetch(THETIS_URL, {
      headers: {
        "User-Agent": "ShipScout-RadarBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)",
        "Referer": THETIS_REFERER,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const detentions: any[] = data.results ?? [];
    return detentions.map(d => {
      const imo      = d.imoNumber || null;
      const name     = d.shipName  || null;
      const port     = d.detentionPort?.name || null;
      const country  = d.detentionReportingAuthority?.description || null;
      const flag     = d.flag?.description || null;
      const shipType = d.shipType?.description || null;
      const location = [port, country].filter(Boolean).join(", ") || null;
      const eventDate = parseThetisDate(d.detentionDate);
      return {
        imo, vessel_name: name, company_name: null,
        event_type: "detention",
        event_date: eventDate,
        location,
        source_name: "Paris MOU (THETIS)",
        summary: [
          `${name || "Vessel"} (IMO ${imo || "?"}) detained by Port State Control`,
          location ? `at ${location}` : null,
          flag ? `Flag: ${flag}.` : null,
          shipType ? `Type: ${shipType}.` : null,
        ].filter(Boolean).join(" ") + ".",
        raw_headline: `Paris MOU detention — ${name} (IMO ${imo}) — ${location || "?"} — ${d.detentionDate || "?"}`,
      };
    });
  } catch { return []; }
}

// ── Judicial auctions (UK Admiralty Marshal) ──────────────────────────────────

async function fetchAuctions(): Promise<ClassifiedEvent[]> {
  try {
    const res = await fetch(
      "https://www.admiraltymarshal.com/ships-under-arrest/current-ships-under-arrest",
      { headers: { "User-Agent": "ShipScout-RadarBot/1.0" }, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const imos = extractIMOs(html);
    return imos.map(imo => ({
      imo, vessel_name: null, company_name: null,
      event_type: "judicial_auction", event_date: null, location: "United Kingdom",
      source_name: "UK Admiralty Marshal",
      summary: `Vessel (IMO ${imo}) currently under arrest with the UK Admiralty Marshal.`,
      raw_headline: `UK Admiralty Marshal — arrest/sale notice: IMO ${imo}`,
    }));
  } catch { return []; }
}

// ── Layup detection ───────────────────────────────────────────────────────────

async function fetchLayups(): Promise<ClassifiedEvent[]> {
  try {
    const { rows } = await pool.query(`
      SELECT mmsi::text AS mmsi, imo::text AS imo, name, type, destination, home_port,
             last_pos_update::date::text AS last_seen
      FROM vessels
      WHERE speed < 0.5 AND speed IS NOT NULL
        AND last_pos_update < now() - interval '${LAYUP_DAYS} days'
        AND last_pos_update > now() - interval '2 years'
        AND imo IS NOT NULL AND imo > 0
      ORDER BY last_pos_update ASC
      LIMIT ${LAYUP_MAX}
    `);
    return rows.map(v => ({
      imo: v.imo, vessel_name: v.name, company_name: null,
      event_type: "layup",
      event_date: v.last_seen ?? null,
      location: (v.destination?.trim()) || v.home_port || null,
      source_name: "AIS Monitor",
      summary: `${v.name || "Vessel"} (IMO ${v.imo}) shows no AIS movement since ${v.last_seen || "over 30 days ago"}, indicating a potential layup or extended idle period.`,
      raw_headline: `AIS: ${v.name} inactive since ${v.last_seen}`,
    }));
  } catch { return []; }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function isDuplicate(
  imo: string | null, vessel_name: string | null,
  event_type: string, event_date?: string | null
): Promise<boolean> {
  const isPermanent = event_type === "sanction";
  // Detentions: dedup by imo + event_date (±DEDUP_DAYS) to prevent daily re-import
  const isDetention = event_type === "detention" && imo && event_date;
  if (isDetention) {
    const { rows } = await pool.query(
      `SELECT 1 FROM radar_events
       WHERE imo=$1 AND event_type='detention'
         AND event_date BETWEEN ($2::date - interval '${DEDUP_DAYS} days')
                            AND ($2::date + interval '${DEDUP_DAYS} days')
       LIMIT 1`,
      [imo, event_date]
    );
    return rows.length > 0;
  }
  if (imo) {
    const q = isPermanent
      ? `SELECT 1 FROM radar_events WHERE imo=$1 AND event_type=$2 LIMIT 1`
      : `SELECT 1 FROM radar_events WHERE imo=$1 AND event_type=$2 AND created_at > now() - interval '${DEDUP_DAYS} days' LIMIT 1`;
    const { rows } = await pool.query(q, [imo, event_type]);
    return rows.length > 0;
  }
  if (vessel_name) {
    const q = isPermanent
      ? `SELECT 1 FROM radar_events WHERE UPPER(vessel_name)=UPPER($1) AND event_type=$2 LIMIT 1`
      : `SELECT 1 FROM radar_events WHERE UPPER(vessel_name)=UPPER($1) AND event_type=$2 AND created_at > now() - interval '${DEDUP_DAYS} days' LIMIT 1`;
    const { rows } = await pool.query(q, [vessel_name, event_type]);
    return rows.length > 0;
  }
  return false;
}

async function findMatchedVesselId(imo: string | null, vessel_name: string | null): Promise<string | null> {
  if (!imo && !vessel_name) return null;
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo=$1::bigint)
        OR ($2::text IS NOT NULL AND UPPER(name)=UPPER($2::text))
     LIMIT 1`,
    [imo ?? null, vessel_name ?? null]
  );
  return rows.length > 0 ? rows[0].mmsi : null;
}

function sanitizeDate(d: string | null): string | null {
  if (!d) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

async function insertEvent(ev: ClassifiedEvent & { matched_vessel_id: string | null }) {
  await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ev.imo, ev.vessel_name, ev.event_type, sanitizeDate(ev.event_date), ev.location,
     ev.source_name, ev.summary, ev.matched_vessel_id, ev.raw_headline]
  );
}

async function findFleetForCompany(companyName: string): Promise<any[]> {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT v.mmsi::text AS mmsi, v.imo::text AS imo, v.name, v.type, v.flag
       FROM owners o JOIN vessels v ON v.imo = o.imo::bigint
       WHERE o.owner_name ILIKE $1 OR o.manager_name ILIKE $1 LIMIT 30`,
      [`%${companyName}%`]
    );
    return rows;
  } catch { return []; }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skip = url.searchParams.get("skip") ?? "";
  const skipOfac      = skip.includes("ofac");
  const skipLayup     = skip.includes("layup");
  const skipAuction   = skip.includes("auction");
  const skipThetis    = skip.includes("thetis");

  let inserted = 0;
  let skipped  = 0;
  const details: string[] = [];
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};

  async function processEvent(ev: ClassifiedEvent, label: string, knownMmsi?: string | null) {
    if (!ev.event_type) { skipped++; return; }
    try {
      const dup = await isDuplicate(ev.imo, ev.vessel_name, ev.event_type, ev.event_date);
      if (dup) { skipped++; return; }
      const matched_vessel_id = knownMmsi ?? await findMatchedVesselId(ev.imo, ev.vessel_name);
      await insertEvent({ ...ev, matched_vessel_id: matched_vessel_id ?? null });
      inserted++;
      details.push(`[${label}] ${ev.vessel_name || ev.imo} (${ev.event_type})`);
      if (ev.event_type) byType[ev.event_type] = (byType[ev.event_type] ?? 0) + 1;
      bySource[label] = (bySource[label] ?? 0) + 1;
    } catch (e: any) {
      skipped++;
      details.push(`[ERROR:${label}] ${e.message}`);
    }
  }

  // 1. RSS
  const rssItems = await fetchAllRSS();
  const classified = await classifyAll(rssItems);

  const bankruptcyEvents: ClassifiedEvent[] = [];
  for (const ev of classified) {
    if (ev.event_type === "bankruptcy" && ev.company_name) bankruptcyEvents.push(ev);
    await processEvent(ev, "RSS");
  }

  // 1b. Bankruptcy fleet-linking
  for (const bk of bankruptcyEvents) {
    const fleet = await findFleetForCompany(bk.company_name!);
    for (const v of fleet) {
      await processEvent({
        imo: v.imo, vessel_name: v.name, company_name: null,
        event_type: "bankruptcy", event_date: bk.event_date, location: bk.location,
        source_name: bk.source_name,
        summary: `${v.name} is operated by ${bk.company_name}, which has entered insolvency proceedings.`,
        raw_headline: bk.raw_headline,
      }, "BANKRUPTCY-FLEET", v.mmsi);
    }
  }

  // 2. OFAC
  if (!skipOfac) {
    const ofacMode = url.searchParams.get("ofac_mode") ?? "delta";
    const { events: ofacEvents, publishDate } = await fetchOFAC();
    for (const ev of ofacEvents) {
      const eventWithDate = ofacMode === "baseline"
        ? { ...ev, event_date: null }           // baseline: no date, excluded from digests
        : { ...ev, event_date: publishDate };   // delta: use list publish date
      await processEvent(eventWithDate, "OFAC");
    }
    details.push(`OFAC: ${ofacEvents.length} vessel entries, mode=${ofacMode}, publishDate=${publishDate}`);
  }

  // 3. Judicial auctions
  if (!skipAuction) {
    const auctions = await fetchAuctions();
    for (const ev of auctions) await processEvent(ev, "AUCTION");
  }

  // 4. Paris MOU / THETIS detentions (daily diff — only new detentions inserted)
  if (!skipThetis) {
    const thetisEvs = await fetchThetisDetentions();
    for (const ev of thetisEvs) await processEvent(ev, "THETIS");
    details.push(`THETIS: ${thetisEvs.length} current detentions fetched`);
  }

  // 5. Layup
  if (!skipLayup) {
    const layups = await fetchLayups();
    for (const ev of layups) await processEvent(ev, "LAYUP");
  }

  return NextResponse.json({
    rss_items: rssItems.length,
    inserted, skipped,
    by_type: byType,
    by_source: bySource,
    details,
  });
}
