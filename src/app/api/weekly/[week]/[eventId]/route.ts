import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

export interface ArticleEvent {
  id:                number;
  imo:               string | null;
  vessel_name:       string | null;
  event_type:        string;
  event_date:        string | null;
  location:          string | null;
  source_name:       string;
  summary:           string;
  article_headline:  string | null;
  article_body:      string | null;
  matched_vessel_id: number | null;
  vessel_mmsi:       string | null;
  vessel_flag:       string | null;
  vessel_type:       string | null;
  vessel_dwt:        number | null;
  vessel_built:      number | null;
  photo_url:         string | null;
  photo_thumb:       string | null;
  photo_attribution: string | null;
  photo_license_url: string | null;
  owner_name:        string | null;
  manager_name:      string | null;
  has_contact:       boolean;
}

export interface ArticleResponse {
  week_start:   string;
  week_end:     string;
  week_label:   string;
  event:        ArticleEvent;
  related:      ArticleEvent[];
  haiku_generated: boolean;
}

// ── Haiku article generation ─────────────────────────────────────────────────

async function generateArticle(ev: ArticleEvent): Promise<{ headline: string; body: string }> {
  const specs = [
    ev.vessel_type,
    ev.vessel_dwt        ? `${Number(ev.vessel_dwt).toLocaleString()} DWT` : null,
    ev.vessel_built      ? `built ${ev.vessel_built}`                       : null,
    ev.vessel_flag       ?? null,
  ].filter(Boolean).join(", ");

  const eventLabel = ev.event_type.replace(/_/g, " ");

  const prompt = [
    `Write a maritime intelligence magazine article about this event.`,
    ``,
    `Event: ${eventLabel}`,
    `Vessel: ${ev.vessel_name || "Unknown"}${ev.imo ? ` (IMO ${ev.imo})` : ""}`,
    specs ? `Specs: ${specs}` : null,
    ev.location   ? `Location: ${ev.location}`  : null,
    ev.event_date ? `Date: ${ev.event_date}`     : null,
    `Source: ${ev.source_name}`,
    `Background: ${ev.summary}`,
    ``,
    `Write:`,
    `1. HEADLINE: 10-12 words max. Style: "MV [Name] [action verb] in [location]" or equivalent. Trade-press tone.`,
    `2. BODY: Three paragraphs separated by blank lines.`,
    `   Para 1: What happened, when, where — include key vessel specs naturally.`,
    `   Para 2: Commercial context — what this type of event means for the vessel's trading position.`,
    `   Para 3: Why this is an opportunity signal for S&P brokers, buyers, or distressed-asset funds.`,
    ``,
    `Rules:`,
    `- Own words only. Never copy source text.`,
    `- Professional, factual, calm tone — Lloyd's List or TradeWinds standard.`,
    `- No speculation beyond confirmed data. No markdown, no headings.`,
    `- Return ONLY valid JSON: {"headline":"...","body":"para1\\n\\npara2\\n\\npara3"}`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      HAIKU_MODEL,
      max_tokens: 600,
      messages:   [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}`);

  const data    = await res.json();
  const rawText = (data.content?.[0]?.text ?? "{}").trim()
    .replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

  const parsed = JSON.parse(rawText);
  return {
    headline: String(parsed.headline ?? "").trim(),
    body:     String(parsed.body     ?? "").trim(),
  };
}

async function saveArticle(eventId: number, headline: string, body: string) {
  await pool.query(
    `UPDATE radar_events SET article_headline=$1, article_body=$2 WHERE id=$3`,
    [headline, body, eventId]
  );
}

// ── DB query ─────────────────────────────────────────────────────────────────

const EVENT_FIELDS = `
  re.id, re.imo, re.vessel_name, re.event_type,
  re.event_date::text, re.location, re.source_name,
  re.summary, re.article_headline, re.article_body,
  re.matched_vessel_id,
  v.mmsi::text        AS vessel_mmsi,
  v.flag              AS vessel_flag,
  v.type              AS vessel_type,
  v.deadweight        AS vessel_dwt,
  v.built_year        AS vessel_built,
  vp.photo_url, vp.photo_thumb,
  vp.attribution      AS photo_attribution,
  vp.license_url      AS photo_license_url,
  o.owner_name, o.manager_name,
  (o.emails IS NOT NULL AND array_length(o.emails,1) > 0) AS has_contact
`;

const EVENT_JOINS = `
  LEFT JOIN vessels v ON v.mmsi = re.matched_vessel_id
  LEFT JOIN LATERAL (
    SELECT photo_url, photo_thumb, attribution, license_url
    FROM vessel_photos
    WHERE imo::text = re.imo AND photo_url IS NOT NULL AND photo_url <> 'none'
    ORDER BY is_primary DESC NULLS LAST, id ASC
    LIMIT 1
  ) vp ON true
  LEFT JOIN owners o ON o.imo = v.imo
`;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ week: string; eventId: string }> }
) {
  const { week, eventId } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }
  const id = parseInt(eventId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  }

  try {
    // 1. Fetch the digest (published check)
    const digestRes = await pool.query(
      `SELECT week_start::text, week_end::text, week_label
       FROM weekly_digests WHERE week_start = $1::date AND published = true`,
      [week]
    );
    if (digestRes.rows.length === 0) {
      return NextResponse.json({ error: "Digest not found" }, { status: 404 });
    }
    const digest = digestRes.rows[0];

    // 2. Fetch the target event
    const evRes = await pool.query<ArticleEvent>(
      `SELECT ${EVENT_FIELDS} FROM radar_events re ${EVENT_JOINS} WHERE re.id = $1`,
      [id]
    );
    if (evRes.rows.length === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    let event          = evRes.rows[0];
    let haikuGenerated = false;

    // 3. Generate article if not yet cached
    if (!event.article_headline) {
      try {
        const { headline, body } = await generateArticle(event);
        await saveArticle(id, headline, body);
        event = { ...event, article_headline: headline, article_body: body };
        haikuGenerated = true;
      } catch (err) {
        console.error("[article] Haiku generation failed:", err);
        // Continue without article text — page shows summary as fallback
      }
    }

    // 4. Related events from same week (exclude current)
    const relRes = await pool.query<ArticleEvent>(
      `SELECT ${EVENT_FIELDS}
       FROM radar_events re ${EVENT_JOINS}
       WHERE re.id != $1
         AND COALESCE(re.event_date, re.created_at::date) BETWEEN $2::date AND $3::date
       ORDER BY re.event_date ASC NULLS LAST, re.created_at ASC
       LIMIT 4`,
      [id, digest.week_start, digest.week_end]
    );

    return NextResponse.json(
      {
        week_start:      digest.week_start,
        week_end:        digest.week_end,
        week_label:      digest.week_label,
        event,
        related:         relRes.rows,
        haiku_generated: haikuGenerated,
      } satisfies ArticleResponse,
      { headers: { "Cache-Control": haikuGenerated ? "no-store" : "public, s-maxage=3600" } }
    );
  } catch (e) {
    console.error("[article] failed", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
