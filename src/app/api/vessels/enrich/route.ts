import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

async function hunterSearch(domain: string, apiKey: string) {
  const res = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${apiKey}`,
    { signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.data?.emails ?? [])
    .filter((e: { confidence: number; value: string }) => e.confidence >= 50 && e.value)
    .map((e: { value: string; first_name?: string; last_name?: string; position?: string; linkedin?: string; confidence: number; type: string }) => ({
      email:     e.value.toLowerCase(),
      name:      [e.first_name, e.last_name].filter(Boolean).join(" ") || null,
      title:     e.position   || null,
      linkedin:  e.linkedin   || null,
      confidence: e.confidence,
      type:      e.type,
      source:    "hunter",
    }));
}

async function findWebsite(companyName: string): Promise<string | null> {
  try {
    const q   = encodeURIComponent(`"${companyName}" shipping site contact`);
    const res = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal:  AbortSignal.timeout(8_000),
    });
    const html = await res.text();
    const match = html.match(/href="(https?:\/\/(?!duckduckgo|facebook|linkedin|bloomberg)[^"]+)"/);
    if (!match) return null;
    const url = new URL(match[1]);
    return url.hostname.replace(/^www\./, "");
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const { imo } = await req.json().catch(() => ({})) as { imo?: string };
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  const { rows } = await pool.query(`
    SELECT v.imo::text, v.name, o.owner_name, o.manager_name,
           o.website, o.web_fetched_at
    FROM vessels v
    LEFT JOIN owners o ON o.imo = v.imo
    WHERE v.imo = $1::bigint LIMIT 1
  `, [imo]);

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = rows[0];

  // Skip if enriched within 7 days
  if (row.web_fetched_at) {
    const age = Date.now() - new Date(row.web_fetched_at).getTime();
    if (age < 7 * 24 * 3600 * 1000)
      return NextResponse.json({ status: "cached" });
  }

  const companyName = row.owner_name || row.manager_name || row.name;
  const hunterKey   = process.env.HUNTER_API_KEY;
  if (!hunterKey) return NextResponse.json({ error: "Hunter key missing" }, { status: 500 });

  // Find domain
  let domain = row.website?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ?? null;
  if (!domain && companyName) domain = await findWebsite(companyName);
  if (!domain) return NextResponse.json({ status: "no_domain", company: companyName });

  // Hunter people search
  const contacts = await hunterSearch(domain, hunterKey);
  const emails   = contacts.map((c: { email: string }) => c.email);

  // Persist to owners table
  await pool.query(`
    ALTER TABLE owners ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb
  `).catch(() => {});

  await pool.query(`
    UPDATE owners SET
      website        = COALESCE($2, website),
      emails         = CASE WHEN $3::text[] IS NOT NULL THEN $3::text[] ELSE emails END,
      contacts       = $4::jsonb,
      best_email     = COALESCE($5, best_email),
      web_fetched_at = now()
    WHERE imo = $1::bigint
  `, [
    imo,
    domain,
    emails.length ? emails : null,
    JSON.stringify(contacts),
    contacts.find((c: { type: string }) => c.type === "personal")?.email ?? contacts[0]?.email ?? null,
  ]);

  return NextResponse.json({
    status:   "enriched",
    company:  companyName,
    domain,
    contacts: contacts.length,
    emails:   emails.slice(0, 5),
  });
}
