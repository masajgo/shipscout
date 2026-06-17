import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FEEDS = [
  { name: "Splash247",             url: "https://splash247.com/feed/",                                    category: "maritime" },
  { name: "Hellenic Shipping News", url: "https://www.hellenicshippingnews.com/feed/",                    category: "maritime" },
  { name: "Maritime Executive",    url: "https://maritime-executive.com/rss/articles",                    category: "maritime" },
  { name: "Seatrade Maritime",     url: "https://www.seatrade-maritime.com/rss.xml",                      category: "maritime" },
  { name: "TradeWinds",            url: "https://www.tradewindsnews.com/rss",                             category: "maritime" },
  { name: "Cruise Industry News",  url: "https://www.cruiseindustrynews.com/cruise-news/feed",            category: "cruise"   },
  { name: "Cruise Law News",       url: "https://www.cruiselawnews.com/feed/",                            category: "cruise"   },
  { name: "Crew Center",           url: "https://www.crew-center.com/feed",                               category: "cruise"   },
];

const DISTRESS_KEYWORDS = [
  "arrest", "arrested", "seized", "court order", "maritime lien",
  "bankrupt", "bankruptcy", "insolvency", "insolvent", "liquidat", "foreclos",
  "laid up", "layup", "lay-up", "cold stack", "mothball",
  "p&i withdrawn", "insurance cancelled", "class suspended", "class withdrawn",
  "scrapped", "demolition", "beached", "sold for scrap", "recycl",
  "unpaid", "debt default", "creditor", "financial difficulty",
  "cruise line fail", "cruise operator bankrupt", "cruise ship sold",
  "detained", "detention", "PSC", "port state control", "deficien",
  "sanction", "ofac", "sdn list", "blacklist",
  "sold", "sale", "auction", "judicial", "foreclosure",
  "idle", "anchorage", "laid-up", "warm layup", "cold layup",
  "AIS dark", "dark vessel", "missing", "grounded", "aground",
  "crew wages", "unpaid crew", "abandonment", "abandoned",
  "total loss", "casualty", "collision", "fire on board",
  "scrap price", "ldt", "demolition sale", "cash buyer",
  "chittagong", "alang", "aliaga", "gadani",
];

function parseRSS(xml: string) {
  const items: { title: string; description: string; link: string; pubDate: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? (m[1] || m[2] || "").trim() : "";
    };
    const title = get("title").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
    const description = get("description").replace(/<[^>]+>/g, " ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
    const link = get("link");
    const pubDate = get("pubDate");
    if (title) items.push({ title, description: description.substring(0, 300), link, pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
  }
  return items;
}

function detectSignals(title: string, desc: string) {
  const text = `${title} ${desc}`.toLowerCase();
  return DISTRESS_KEYWORDS.filter(kw => text.includes(kw));
}

function extractVessel(title: string, desc: string) {
  const text = `${title} ${desc}`;
  const imoMatch = text.match(/\bIMO\s*[:#]?\s*(\d{7})\b/i);
  const prefixes = ["MV\\s+","MS\\s+","MT\\s+","SS\\s+","vessel\\s+","tanker\\s+","bulk carrier\\s+","cruise ship\\s+"];
  let vesselName: string | null = null;
  for (const p of prefixes) {
    const m = text.match(new RegExp(`(?:${p})([A-Z][A-Z\\s]{2,28})`, "i"));
    if (m) { vesselName = m[1].trim().toUpperCase(); break; }
  }
  if (!vesselName) {
    const q = text.match(/["']([A-Z][A-Z\s]{3,24})["']/);
    if (q) vesselName = q[1].trim();
  }
  return { imo: imoMatch ? imoMatch[1] : null, vesselName };
}

function getSeverity(signals: string[], vesselName: string | null): "high" | "medium" | "low" {
  const highSignals = ["arrest","bankrupt","foreclos","p&i withdrawn","class suspended","seized"];
  const isHigh = signals.some(s => highSignals.some(h => s.includes(h)));
  if (isHigh && vesselName) return "high";
  if (signals.length >= 2) return "medium";
  return "low";
}

function getDistressType(signals: string[]): string {
  if (signals.some(s => ["arrest","seized","court","lien"].some(k => s.includes(k)))) return "arrest";
  if (signals.some(s => ["bankrupt","insolvency","foreclos","liquidat","creditor","unpaid","debt"].some(k => s.includes(k)))) return "financial";
  if (signals.some(s => ["laid up","layup","lay-up","idle","cold stack","mothball"].some(k => s.includes(k)))) return "layup";
  if (signals.some(s => ["p&i","insurance","class suspended","class withdrawn"].some(k => s.includes(k)))) return "insurance";
  if (signals.some(s => ["scrap","demolition","beached","recycl"].some(k => s.includes(k)))) return "scrap";
  return "financial";
}

async function fetchFeed(feed: typeof FEEDS[0]) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "ShipScout/1.0 (+https://shipscout.io; maritime intelligence)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSS(xml);
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const results = [];
    for (const item of items) {
      if (new Date(item.pubDate).getTime() < cutoff) continue;
      const signals = detectSignals(item.title, item.description);
      const { imo, vesselName } = extractVessel(item.title, item.description);
      if (signals.length === 0 && !vesselName) continue;
      const severity = getSeverity(signals, vesselName);
      results.push({
        id: `${feed.name}-${Buffer.from(item.link || item.title).toString("base64").substring(0, 20)}`,
        title: item.title,
        summary: item.description,
        vessel: vesselName,
        imo,
        source: feed.name,
        category: feed.category,
        distressType: getDistressType(signals),
        severity,
        confidence: vesselName && imo ? 90 : vesselName ? 72 : 50,
        signals,
        link: item.link,
        pubDate: item.pubDate,
        watching: false,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export async function GET() {
  type NewsItem = Awaited<ReturnType<typeof fetchFeed>>[number];

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all: NewsItem[] = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

  const seen = new Set<string>();
  const unique = all.filter(item => {
    const key = item.imo || item.link;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  unique.sort((a, b) => (order[a.severity] ?? 2) - (order[b.severity] ?? 2) || b.confidence - a.confidence);

  return NextResponse.json({
    items: unique,
    meta: {
      total: unique.length,
      high: unique.filter(i => i.severity === "high").length,
      medium: unique.filter(i => i.severity === "medium").length,
      feedsActive: FEEDS.length,
      updatedAt: new Date().toISOString(),
    }
  });
}
