import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authorized } from "@/lib/adminAuth";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300;

const HUNTER_API_KEY    = process.env.HUNTER_API_KEY ?? "";
const NEWS_BATCH        = 3000;  // top N vessels by scrap score to news-match
const ENRICH_BATCH      = 30;    // max contact refreshes per run
const ENRICH_STALE_DAYS = 30;

// ── RSS sources ───────────────────────────────────────────────────────────────

const RSS_FEEDS = [
  { url: "https://splash247.com/feed/",             source: "Splash247"   },
  { url: "https://gcaptain.com/feed/",              source: "gCaptain"    },
  { url: "https://maritime-executive.com/feed",     source: "MarExec"     },
  { url: "https://www.porttechnology.org/feed/",    source: "PortTech"    },
  { url: "https://www.hellenicshippingnews.com/feed/", source: "HellenicSN" },
];

interface Article { title: string; link: string; desc: string; source: string }

function stripTags(s: string): string {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#039;/g,"'").trim();
}

function extractFirst(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? stripTags(m[1].trim()) : null;
}

async function fetchFeed(feed: { url: string; source: string }): Promise<Article[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "ShipScout-Intelligence/1.0 (shipscout.io)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: Article[] = [];
    const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const block = m[1];
      const title = extractFirst(block, "title") ?? "";
      if (!title) continue;
      const link = extractFirst(block, "link") ?? extractFirst(block, "guid") ?? "";
      const desc = stripTags(extractFirst(block, "description") ?? "").slice(0, 400);
      items.push({ title: stripTags(title), link, desc, source: feed.source });
    }
    return items;
  } catch { return []; }
}

async function fetchAllNews(): Promise<Article[]> {
  const all: Article[] = [];
  const results = await Promise.allSettled(RSS_FEEDS.map(f => fetchFeed(f)));
  for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
  return all;
}

// ── Phase 1: News → vessel matching ──────────────────────────────────────────

async function runNewsScan(articles: Article[]): Promise<{ hits: number; details: string[] }> {
  const details: string[] = [];
  if (!articles.length) return { hits: 0, details: ["No articles fetched"] };

  const { rows: vessels } = await pool.query<{ imo: string; name: string }>(
    `SELECT imo::text AS imo, name FROM vessels
     WHERE scrap_score IS NOT NULL AND name IS NOT NULL AND LENGTH(name) >= 4
     ORDER BY scrap_score DESC NULLS LAST LIMIT $1`,
    [NEWS_BATCH]
  );

  let hits = 0;
  for (const vessel of vessels) {
    const nameLow = vessel.name.toLowerCase();
    const matched = articles.filter(a =>
      (a.title + " " + a.desc).toLowerCase().includes(nameLow)
    );
    for (const article of matched) {
      const { rows: existing } = await pool.query(
        `SELECT 1 FROM vessel_events WHERE imo=$1 AND url=$2 LIMIT 1`,
        [vessel.imo, article.link]
      );
      if (existing.length) continue;
      await pool.query(
        `INSERT INTO vessel_events (imo, event_type, source, title, url, summary)
         VALUES ($1, 'news_mention', $2, $3, $4, $5)`,
        [vessel.imo, article.source, article.title.slice(0,500), article.link.slice(0,1000), article.desc.slice(0,800)]
      );
      hits++;
      details.push(`${vessel.name} (${vessel.imo}) — "${article.title}" [${article.source}]`);
    }
  }
  details.unshift(`articles:${articles.length} vessels:${vessels.length} hits:${hits}`);
  return { hits, details };
}

// ── Phase 2: Stale contact refresh via Hunter.io ──────────────────────────────

interface HunterResult { emails: string[]; contacts: { name: string; email: string; title: string }[] }

async function hunterDomainSearch(domain: string): Promise<HunterResult> {
  if (!HUNTER_API_KEY) return { emails: [], contacts: [] };
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${HUNTER_API_KEY}&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { emails: [], contacts: [] };
    const data = await res.json();
    const emailList: string[] = [];
    const contacts: HunterResult["contacts"] = [];
    for (const e of (data.data?.emails ?? [])) {
      if (e.value) emailList.push(e.value);
      if (e.first_name || e.last_name) {
        contacts.push({
          name:  [e.first_name, e.last_name].filter(Boolean).join(" "),
          email: e.value ?? "",
          title: e.position ?? "",
        });
      }
    }
    return { emails: emailList, contacts };
  } catch { return { emails: [], contacts: [] }; }
}

function extractDomain(website: string): string | null {
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname
      .replace(/^www\./, "");
  } catch { return null; }
}

async function runContactRefresh(): Promise<{ updated: number; details: string[] }> {
  const details: string[] = [];
  const { rows: stale } = await pool.query<{
    imo: string; name: string; manager_name: string | null;
    owner_name: string | null; website: string;
  }>(`
    SELECT v.imo::text AS imo, v.name, o.manager_name, o.owner_name, o.website
    FROM vessels v
    JOIN owners o ON o.imo = v.imo
    WHERE o.website IS NOT NULL AND o.website != ''
      AND (o.web_fetched_at IS NULL OR o.web_fetched_at < NOW() - INTERVAL '${ENRICH_STALE_DAYS} days')
    ORDER BY v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [ENRICH_BATCH]);

  details.push(`stale:${stale.length}`);
  let updated = 0;

  for (const vessel of stale) {
    const domain = extractDomain(vessel.website);
    if (!domain) continue;

    const result = await hunterDomainSearch(domain);
    if (!result.emails.length && !result.contacts.length) continue;

    // Merge into owners table
    if (result.emails.length) {
      await pool.query(
        `UPDATE owners SET
           emails = (SELECT array_agg(DISTINCT e) FROM unnest(COALESCE(emails,'{}') || $1::text[]) AS e),
           web_fetched_at = NOW()
         WHERE imo = $2::bigint`,
        [result.emails, vessel.imo]
      );
    }
    if (result.contacts.length) {
      await pool.query(
        `UPDATE owners SET contacts = $1::jsonb, web_fetched_at = NOW() WHERE imo = $2::bigint`,
        [JSON.stringify(result.contacts), vessel.imo]
      );
    }

    await pool.query(
      `INSERT INTO vessel_events (imo, event_type, source, title, summary)
       VALUES ($1, 'contact_updated', 'intelligenceAgent', $2, $3)`,
      [vessel.imo, `Contacts refreshed: ${vessel.manager_name ?? vessel.owner_name}`,
       `emails:${result.emails.length} contacts:${result.contacts.length}`]
    );

    updated++;
    details.push(`${vessel.name} (${vessel.imo}) — ${domain} — ${result.emails.length} emails`);
  }

  return { updated, details };
}

// ── Phase 3: Scrap yard proximity alerts ─────────────────────────────────────

const SCRAP_ZONES = [
  { name: "Aliaga",     lat: 38.84, lon: 26.97, radius: 2.5 },
  { name: "Alang",      lat: 21.41, lon: 72.18, radius: 2.5 },
  { name: "Gadani",     lat: 25.12, lon: 66.73, radius: 2.5 },
  { name: "Chittagong", lat: 22.33, lon: 91.82, radius: 2.5 },
];

async function runProximityAlerts(): Promise<{ alerts: number; details: string[] }> {
  const details: string[] = [];
  let alerts = 0;

  for (const zone of SCRAP_ZONES) {
    const { rows } = await pool.query<{
      imo: string; name: string; scrap_score: number; speed: number | null; destination: string | null
    }>(`
      SELECT v.imo::text AS imo, v.name, v.scrap_score, v.speed, v.destination
      FROM vessels v
      WHERE v.lat IS NOT NULL AND v.lon IS NOT NULL
        AND v.scrap_score >= 50
        AND ABS(v.lat - $1) < $3 AND ABS(v.lon - $2) < $3
    `, [zone.lat, zone.lon, zone.radius]);

    for (const v of rows) {
      const { rows: recent } = await pool.query(
        `SELECT 1 FROM vessel_events
         WHERE imo=$1 AND event_type='status_change' AND summary ILIKE $2
           AND created_at > NOW() - INTERVAL '7 days' LIMIT 1`,
        [v.imo, `%${zone.name}%`]
      );
      if (recent.length) continue;

      const msg = `Near ${zone.name} scrap yard | score:${v.scrap_score} | speed:${v.speed ?? "?"} | dest:${v.destination ?? "?"}`;
      await pool.query(
        `INSERT INTO vessel_events (imo, event_type, source, title, summary)
         VALUES ($1, 'status_change', 'ais_position', $2, $3)`,
        [v.imo, `Vessel near ${zone.name} scrap yard`, msg]
      );
      alerts++;
      details.push(`🚨 ${v.name} (${v.imo}) — ${msg}`);
    }
  }

  return { alerts, details };
}

// ── Schema bootstrap ──────────────────────────────────────────────────────────

async function ensureVesselEventsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vessel_events (
      id          BIGSERIAL PRIMARY KEY,
      imo         BIGINT NOT NULL,
      event_type  TEXT NOT NULL,
      source      TEXT,
      title       TEXT,
      url         TEXT,
      summary     TEXT,
      raw_data    JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS vessel_events_imo_idx     ON vessel_events(imo)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vessel_events_created_idx ON vessel_events(created_at DESC)`);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorized(req, url)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skip = url.searchParams.get("skip") ?? "";

  await ensureVesselEventsTable();

  const articles = await fetchAllNews();

  const [newsResult, contactResult, proximityResult] = await Promise.all([
    skip.includes("news")      ? Promise.resolve({ hits: 0, details: ["skipped"] })    : runNewsScan(articles),
    skip.includes("contacts")  ? Promise.resolve({ updated: 0, details: ["skipped"] }) : runContactRefresh(),
    skip.includes("proximity") ? Promise.resolve({ alerts: 0, details: ["skipped"] })  : runProximityAlerts(),
  ]);

  return NextResponse.json({
    news_hits:      newsResult.hits,
    contacts_updated: contactResult.updated,
    proximity_alerts: proximityResult.alerts,
    details: {
      news:      newsResult.details,
      contacts:  contactResult.details,
      proximity: proximityResult.details,
    },
  });
}
