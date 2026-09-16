import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authorized } from "@/lib/adminAuth";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 300;

const HAIKU_MODEL       = "claude-haiku-4-5-20251001";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const RSS_FEEDS = [
  { name: "Hellenic Shipping News", url: "https://www.hellenicshippingnews.com/feed/" },
  { name: "Splash247",              url: "https://splash247.com/feed/" },
  { name: "gCaptain",               url: "https://gcaptain.com/feed/" },
  { name: "Google News — admiralty arrest",
    url: "https://news.google.com/rss/search?q=%22admiralty+arrest%22+ship+OR+vessel&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News — ship arrested court",
    url: "https://news.google.com/rss/search?q=%22ship+arrested%22+court+OR+creditor+OR+mortgage+OR+bank&hl=en-US&gl=US&ceid=US:en" },
  { name: "Google News — judicial ship sale",
    url: "https://news.google.com/rss/search?q=%22judicial+sale%22+ship+OR+vessel+OR+%22judicial+auction%22+vessel&hl=en-US&gl=US&ceid=US:en" },
];

const ARREST_KEYWORDS = [
  "arrest", "seized", "seizure", "detained", "judicial auction",
  "court order", "bank seizure", "creditor", "admiralty", "impounded",
  "el koyma", "haciz",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function httpGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ShipScout-ArrestMonitor/1.0; +https://shipscout.io)",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g,"&").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
}

function isRelevant(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return ARREST_KEYWORDS.some(kw => haystack.includes(kw));
}

function parseRSS(xml: string) {
  const items: { title: string; link: string; description: string; pubDate: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
      const mm = r.exec(block);
      return mm ? mm[1].trim() : "";
    };
    items.push({ title: get("title"), link: get("link"), description: get("description"), pubDate: get("pubDate") });
  }
  return items;
}

function parsePubDate(dateStr: string): string | null {
  if (!dateStr) return null;
  try { const d = new Date(dateStr); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
  catch { return null; }
}

async function extractWithHaiku(article: { title: string; url: string; pubDate: string; content: string }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `You are a maritime intelligence data extractor. Read the following news article and extract vessel arrest/seizure information.

Article title: ${article.title}
Article URL: ${article.url}
Published: ${article.pubDate || "unknown"}
Content:
${article.content.slice(0, 3000)}

Extract and return ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "relevant": true/false,
  "vessel_name": "string or null",
  "imo": "string or null",
  "event_type": "arrest|bank_seizure|judicial_auction|detention",
  "event_date": "YYYY-MM-DD or null",
  "location": "string or null",
  "summary": "string",
  "creditor": "string or null"
}

Set relevant: TRUE only when ALL of these apply:
  1. A specific, named commercial vessel is arrested/seized
  2. The arrest is by a COURT, bank, creditor, mortgagee, or port authority for FINANCIAL/LEGAL reasons
  3. There is enough detail to identify the vessel

Set relevant: FALSE for military seizures, piracy, drug/weapons seizures, general commentary, no specific vessel.`,
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json() as { content?: { text: string }[] };
  const text = (data.content?.[0]?.text ?? "").trim()
    .replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(text);
}

async function isDuplicate(imo: string | null, vesselName: string | null, eventType: string, eventDate: string | null): Promise<boolean> {
  if (imo) {
    const { rows } = await pool.query(
      `SELECT id FROM radar_events WHERE imo = $1 AND event_type = $2 AND (status IS NULL OR status != 'resolved') LIMIT 1`,
      [imo, eventType]
    );
    if (rows.length) return true;
  }
  if (vesselName) {
    const { rows } = await pool.query(
      `SELECT id FROM radar_events
       WHERE UPPER(vessel_name) = UPPER($1) AND event_type = $2
         AND ($3::date IS NULL OR event_date BETWEEN ($3::date - interval '30 days') AND ($3::date + interval '30 days'))
       LIMIT 1`,
      [vesselName, eventType, eventDate || null]
    );
    if (rows.length) return true;
  }
  return false;
}

async function matchVessel(imo: string | null, vesselName: string | null): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );
  return rows.length ? rows[0].mmsi : null;
}

async function processFeed(feed: { name: string; url: string }): Promise<{ inserted: number; skipped: number; errors: number }> {
  let inserted = 0, skipped = 0, errors = 0;
  let xml: string;
  try { xml = await httpGet(feed.url); }
  catch (e) { return { inserted: 0, skipped: 0, errors: 1 }; }

  const items = parseRSS(xml);
  for (const item of items) {
    const description = stripTags(item.description);
    if (!isRelevant(item.title, description)) { skipped++; continue; }
    try {
      const extracted = await extractWithHaiku({
        title: item.title, url: item.link,
        pubDate: item.pubDate, content: `${item.title}\n\n${description}`,
      });
      if (!extracted?.relevant) { skipped++; continue; }
      const eventDate = extracted.event_date || parsePubDate(item.pubDate);
      if (await isDuplicate(extracted.imo, extracted.vessel_name, extracted.event_type, eventDate)) {
        skipped++;
        continue;
      }
      const matchedVesselId = await matchVessel(extracted.imo, extracted.vessel_name);
      await pool.query(
        `INSERT INTO radar_events (imo, vessel_name, event_type, event_date, location, source_name, summary, matched_vessel_id, raw_headline, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')`,
        [extracted.imo||null, extracted.vessel_name||null, extracted.event_type, eventDate||null,
         extracted.location||null, feed.name, extracted.summary, matchedVesselId||null, item.title||null]
      );
      inserted++;
    } catch { errors++; }
  }
  return { inserted, skipped, errors };
}

// ── Agent status helpers ───────────────────────────────────────────────────────

async function agentStart(name: string) {
  try {
    await pool.query(
      `INSERT INTO agent_status (agent_name, last_started_at, last_status, run_count, updated_at)
       VALUES ($1, NOW(), 'running', 1, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         last_started_at = NOW(), last_status = 'running',
         run_count = agent_status.run_count + 1, updated_at = NOW()`,
      [name]
    );
  } catch { /* non-fatal */ }
}

async function agentFinish(name: string, status: string, rows?: number, error?: string) {
  try {
    await pool.query(
      `UPDATE agent_status SET last_finished_at=NOW(), last_status=$2, last_rows=$3, last_error=$4, updated_at=NOW()
       WHERE agent_name=$1`,
      [name, status, rows ?? null, error ? error.slice(0, 1000) : null]
    );
  } catch { /* non-fatal */ }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authorized(req, url)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await agentStart("arrestscan");
  let totalInserted = 0, totalErrors = 0;

  try {
    for (const feed of RSS_FEEDS) {
      const { inserted, errors } = await processFeed(feed);
      totalInserted += inserted;
      totalErrors   += errors;
    }
    await agentFinish("arrestscan", "success", totalInserted);
    return NextResponse.json({ ok: true, inserted: totalInserted, errors: totalErrors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await agentFinish("arrestscan", "error", undefined, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
