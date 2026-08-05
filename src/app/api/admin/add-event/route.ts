import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

const VALID_EVENT_TYPES = ["arrest","bank_seizure","auction","judicial_auction","bankruptcy","detention","sanction","scrap_sale","layup"];
const VALID_STATUSES    = ["active","resolved","sold","scrapped"];

async function refineSummary(ev: Record<string, any>): Promise<string> {
  const prompt = [
    `Write a 2–3 sentence factual summary for a maritime intelligence report.`,
    `Event type: ${ev.event_type?.replace(/_/g, " ")}`,
    ev.vessel_name ? `Vessel: ${ev.vessel_name}` : "",
    ev.imo         ? `IMO: ${ev.imo}` : "",
    ev.location    ? `Location: ${ev.location}` : "",
    ev.event_date  ? `Date: ${ev.event_date}` : "",
    ev.source_name ? `Source: ${ev.source_name}` : "",
    `Raw info: ${ev.summary}`,
    ``,
    `Rules: own words only, professional tone, no markdown, no speculation. One paragraph only. Return only the paragraph.`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: 256, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text ?? ev.summary).trim();
}

async function findMatchedVesselId(imo: string | null, vesselName: string | null): Promise<number | null> {
  if (!imo && !vesselName) return null;
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text   IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );
  return rows.length > 0 ? rows[0].mmsi : null;
}

async function checkDuplicate(imo: string | null, eventType: string, eventDate: string | null): Promise<number | null> {
  if (!imo) return null;
  const { rows } = await pool.query(
    `SELECT id FROM radar_events
     WHERE imo = $1 AND event_type = $2
       AND (
         ($3::date IS NOT NULL AND event_date BETWEEN ($3::date - interval '7 days') AND ($3::date + interval '7 days'))
         OR ($3::date IS NULL AND created_at > now() - interval '7 days')
       )
     LIMIT 1`,
    [imo, eventType, eventDate || null]
  );
  return rows.length > 0 ? rows[0].id : null;
}

// GET: update status for an event
export async function GET(req: Request) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = url.searchParams.get("action");

  // Update status: ?action=update-status&id=123&status=resolved
  if (action === "update-status") {
    const id     = url.searchParams.get("id");
    const status = url.searchParams.get("status");
    if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
    if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    const { rowCount } = await pool.query(`UPDATE radar_events SET status=$1 WHERE id=$2`, [status, id]);
    if (!rowCount) return NextResponse.json({ error: `No event with id=${id}` }, { status: 404 });
    return NextResponse.json({ updated: true, id: parseInt(id), status });
  }

  return NextResponse.json({ error: "Unknown action. Use: update-status" }, { status: 400 });
}

// POST: add a new event
// Body: { secret, imo, vessel_name, event_type, event_date, location, source_name, summary, status, refine_ai }
export async function POST(req: Request) {
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    imo, vessel_name, event_type, event_date, location,
    source_name, summary, status = "active", refine_ai = true,
  } = body;

  // Validate required fields
  if (!event_type) return NextResponse.json({ error: "event_type required" }, { status: 400 });
  if (!VALID_EVENT_TYPES.includes(event_type)) return NextResponse.json({ error: `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}` }, { status: 400 });
  if (!summary)    return NextResponse.json({ error: "summary required" }, { status: 400 });
  if (!vessel_name && !imo) return NextResponse.json({ error: "vessel_name or imo required" }, { status: 400 });
  if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return NextResponse.json({ error: "event_date must be YYYY-MM-DD" }, { status: 400 });
  if (!VALID_STATUSES.includes(status)) return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });

  // Deduplicate
  const dupId = await checkDuplicate(imo || null, event_type, event_date || null);
  if (dupId) {
    return NextResponse.json({ skipped: true, reason: "duplicate", existing_id: dupId }, { status: 409 });
  }

  // Vessel match
  const matched_vessel_id = await findMatchedVesselId(imo || null, vessel_name || null);

  // Optional Haiku refinement
  let finalSummary = summary;
  if (refine_ai) {
    try {
      finalSummary = await refineSummary({ imo, vessel_name, event_type, event_date, location, source_name, summary });
    } catch (e: any) {
      console.warn("[add-event] Haiku failed:", e.message);
    }
  }

  const raw_headline = [
    event_type.replace(/_/g, " "),
    vessel_name ? `— ${vessel_name}` : "",
    imo         ? `(IMO ${imo})`     : "",
    location    ? `— ${location}`    : "",
    event_date  ? `— ${event_date}`  : "",
  ].filter(Boolean).join(" ");

  const { rows } = await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [imo || null, vessel_name || null, event_type, event_date || null, location || null,
     source_name || null, finalSummary, matched_vessel_id, raw_headline, status]
  );

  const newId = rows[0].id;

  // Compute week start for convenience
  let week_start: string | null = null;
  if (event_date) {
    const d    = new Date(event_date + "T00:00:00Z");
    const day  = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon  = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diff);
    week_start = mon.toISOString().slice(0, 10);
  }

  return NextResponse.json({
    inserted: true,
    id: newId,
    matched_vessel_id,
    summary_refined: finalSummary !== summary,
    week_start,
  });
}
