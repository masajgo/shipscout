import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 300;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day  = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon  = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

function isoWeek(d: Date): number {
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thu.setUTCDate(thu.getUTCDate() + 4 - (thu.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  return Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildWeekLabel(ws: Date, we: Date): string {
  const wn   = isoWeek(ws);
  const sDay = ws.getUTCDate(), sMon = MONTHS[ws.getUTCMonth()];
  const eDay = we.getUTCDate(), eMon = MONTHS[we.getUTCMonth()];
  const year = we.getUTCFullYear();
  const range = sMon === eMon
    ? `${sMon} ${sDay}–${eDay}, ${year}`
    : `${sMon} ${sDay} – ${eMon} ${eDay}, ${year}`;
  return `Week ${wn} · ${range}`;
}

function toStr(d: Date): string { return d.toISOString().slice(0, 10); }

// ── Category mapping ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: "auction",        label: "Judicial Auctions & Bank Seizures", types: ["auction", "bank_seizure"] },
  { key: "arrest_seizure", label: "Arrests",                           types: ["arrest"] },
  { key: "bankruptcy",     label: "Bankruptcies",                      types: ["bankruptcy"] },
  { key: "sanction",       label: "Sanctions",                         types: ["sanction"] },
  { key: "detention",      label: "PSC Detentions",                    types: ["detention"] },
  { key: "scrap_sale",     label: "Scrap Candidates",                  types: ["scrap_sale"] },
];

function groupByCategory(events: any[]): Record<string, { label: string; events: any[] }> {
  const g: Record<string, { label: string; events: any[] }> = {};
  for (const cat of CATEGORIES) {
    const evs = events.filter(e => cat.types.includes(e.event_type));
    if (evs.length > 0) g[cat.key] = { label: cat.label, events: evs };
  }
  return g;
}

const EVENT_PRIORITY: Record<string, number> = { auction: 1, bank_seizure: 2, arrest: 3, bankruptcy: 4, sanction: 5, detention: 6, scrap_sale: 7 };

// Returns IMOs (as text) that have a real photo in vessel_photos
async function fetchPhotoImos(events: any[]): Promise<Set<string>> {
  const imos = [...new Set(events.map((e: any) => e.imo).filter(Boolean))];
  if (!imos.length) return new Set();
  const { rows } = await pool.query(
    `SELECT imo::text FROM vessel_photos
     WHERE imo::text = ANY($1) AND photo_url IS NOT NULL AND photo_url <> 'none'`,
    [imos]
  );
  return new Set(rows.map((r: any) => r.imo));
}

function selectLead(events: any[], photoImos: Set<string> = new Set()): any | null {
  if (!events.length) return null;
  return [...events].sort((a, b) => {
    const pa = EVENT_PRIORITY[a.event_type] ?? 99;
    const pb = EVENT_PRIORITY[b.event_type] ?? 99;
    if (pa !== pb) return pa - pb;
    // Within same priority tier: prefer events with photos (better cover)
    const aPhoto = photoImos.has(a.imo ?? "");
    const bPhoto = photoImos.has(b.imo ?? "");
    if (aPhoto !== bPhoto) return aPhoto ? -1 : 1;
    return (Number(b.deadweight) || 0) - (Number(a.deadweight) || 0);
  })[0];
}

// ── Haiku ─────────────────────────────────────────────────────────────────────

async function callHaiku(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text ?? "").trim();
}

async function generateIntro(weekLabel: string, groups: Record<string, any>): Promise<string> {
  const lines = CATEGORIES
    .filter(c => groups[c.key])
    .map(c => {
      const g = groups[c.key];
      const names = g.events.filter((e: any) => e.vessel_name).map((e: any) => e.vessel_name).slice(0, 3).join(", ");
      return `${c.label}: ${g.events.length} event(s)${names ? ` (${names})` : ""}`;
    });

  return callHaiku([
    `Write a 2–3 sentence editorial introduction for a maritime intelligence weekly digest titled "${weekLabel}".`,
    `This week's events:\n${lines.join("\n")}`,
    ``,
    `Rules: factual, professional, neutral. Mention dominant themes. No bullet points, no headings, no markdown. Return only the paragraph text.`,
  ].join("\n"), 256);
}

async function generateLeadSummary(event: any, vessel: any): Promise<string> {
  const specs = [vessel?.type, vessel?.deadweight ? `${Number(vessel.deadweight).toLocaleString()} DWT` : null,
    vessel?.built_year ? `built ${vessel.built_year}` : null, vessel?.flag].filter(Boolean).join(", ");
  return callHaiku([
    `Write a 3–4 sentence editorial summary for a lead story in a maritime intelligence magazine.`,
    `Event: ${event.event_type?.replace(/_/g, " ")}`,
    `Vessel: ${event.vessel_name || "Unknown"}${event.imo ? ` (IMO ${event.imo})` : ""}`,
    specs ? `Specs: ${specs}` : "",
    event.location   ? `Location: ${event.location}`   : "",
    event.event_date ? `Date: ${event.event_date}`      : "",
    `Source: ${event.source_name}`,
    `Background: ${event.summary}`,
    ``,
    `Rules: own words only, professional tone, no markdown, no speculation. One paragraph only. Return only the paragraph.`,
  ].filter(Boolean).join("\n"), 320);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchEventsForWeek(weekStart: string, weekEnd: string) {
  const { rows } = await pool.query(`
    SELECT re.id, re.imo, re.vessel_name, re.event_type, re.event_date,
           re.location, re.source_name, re.summary, re.matched_vessel_id,
           v.mmsi::text AS vessel_mmsi, v.flag, v.type, v.deadweight, v.built_year,
           o.owner_name, o.manager_name
    FROM radar_events re
    LEFT JOIN vessels v ON v.mmsi = re.matched_vessel_id
    LEFT JOIN owners  o ON o.imo  = v.imo
    WHERE COALESCE(re.event_date, re.created_at::date) BETWEEN $1 AND $2
    AND (re.event_type != 'sanction' OR re.event_date IS NOT NULL)
    AND re.event_type NOT IN ('layup', 'judicial_auction')
    ORDER BY re.event_date ASC NULLS LAST, re.created_at ASC
  `, [weekStart, weekEnd]);
  return rows;
}

async function fetchVesselForLead(imo: string | null) {
  if (!imo) return null;
  try {
    const { rows } = await pool.query(
      `SELECT name, type, deadweight, built_year, flag FROM vessels WHERE imo=$1::bigint LIMIT 1`, [imo]
    );
    return rows[0] ?? null;
  } catch { return null; }
}

async function upsertDigest(weekStart: string, weekEnd: string, weekLabel: string,
  introText: string | null, eventCount: number, leadStoryId: number | null, publish: boolean) {
  await pool.query(`
    INSERT INTO weekly_digests (week_start, week_end, week_label, intro_text, event_count, lead_story_id, published)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (week_start) DO UPDATE
      SET lead_story_id = EXCLUDED.lead_story_id,
          event_count   = EXCLUDED.event_count,
          intro_text    = COALESCE(EXCLUDED.intro_text, weekly_digests.intro_text),
          published     = CASE WHEN $7 THEN true ELSE weekly_digests.published END
  `, [weekStart, weekEnd, weekLabel, introText, eventCount, leadStoryId, publish]);
}

async function saveEditorial(eventId: number, summary: string) {
  await pool.query(`UPDATE radar_events SET editorial_summary=$1 WHERE id=$2`, [summary, eventId]);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode    = url.searchParams.get("mode") ?? "backfill"; // backfill | regen | current | publish
  const publish = url.searchParams.get("publish") === "yes";

  const processed: string[] = [];
  let weeksCount = 0;

  // Collect weeks to process
  type WeekJob = { weekStart: Date; isRegen: boolean };
  const jobs: WeekJob[] = [];

  // Backfill only touches weeks from May 2026 onwards (prevents THETIS old dates creating stale digests)
  const BACKFILL_MIN_DATE = "2026-05-04";

  if (mode === "regen") {
    const { rows } = await pool.query(`SELECT week_start::text FROM weekly_digests ORDER BY week_start ASC`);
    for (const r of rows) {
      jobs.push({ weekStart: new Date(r.week_start + "T00:00:00Z"), isRegen: true });
    }
  } else if (mode === "current") {
    const now = new Date();
    const ws  = getMondayOf(now);
    jobs.push({ weekStart: ws, isRegen: false });
  } else {
    // backfill: weeks with events but no digest — only from BACKFILL_MIN_DATE onwards
    const { rows: existingRows } = await pool.query(`SELECT to_char(week_start,'YYYY-MM-DD') AS ws FROM weekly_digests`);
    const existing = new Set(existingRows.map((r: any) => r.ws));

    const { rows: weekRows } = await pool.query(`
      SELECT DISTINCT date_trunc('week', COALESCE(event_date, created_at::date))::date AS wmon
      FROM radar_events
      WHERE COALESCE(event_date, created_at::date) >= $1::date
      ORDER BY wmon ASC
    `, [BACKFILL_MIN_DATE]);
    for (const r of weekRows) {
      const s = (r.wmon instanceof Date ? r.wmon.toISOString() : String(r.wmon)).slice(0, 10);
      if (!existing.has(s)) {
        jobs.push({ weekStart: new Date(s + "T00:00:00Z"), isRegen: false });
      }
    }
  }

  for (const { weekStart, isRegen } of jobs) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekLabel = buildWeekLabel(weekStart, weekEnd);
    const ws = toStr(weekStart);
    const we = toStr(weekEnd);

    const events = await fetchEventsForWeek(ws, we);
    if (events.length === 0) { processed.push(`SKIP ${weekLabel} — no events`); continue; }

    // Photo-aware lead selection: within same priority tier, prefer events with vessel photos
    const photoImos = await fetchPhotoImos(events);
    const lead = selectLead(events, photoImos);
    let leadId: number | null = lead?.id ?? null;
    let editorial: string | null = null;

    if (lead) {
      const vessel = await fetchVesselForLead(lead.imo);
      try {
        editorial = await generateLeadSummary(lead, vessel);
        await saveEditorial(lead.id, editorial);
      } catch (e: any) {
        processed.push(`WARN ${weekLabel} lead editorial failed: ${e.message}`);
      }
    }

    if (isRegen) {
      // Regen: fully regenerate intro + update lead + event count
      const groups = groupByCategory(events);
      let introText: string | null = null;
      try {
        introText = await generateIntro(weekLabel, groups);
      } catch (e: any) {
        processed.push(`WARN ${weekLabel} intro failed: ${e.message}`);
      }
      await pool.query(
        `UPDATE weekly_digests
         SET lead_story_id=$1, event_count=$2,
             intro_text=COALESCE($3, intro_text)
         WHERE week_start=$4::date`,
        [leadId, events.length, introText, ws]
      );
      const hasPhoto = lead?.imo ? photoImos.has(lead.imo) : false;
      processed.push(`REGEN ${weekLabel} — ${events.length} events, lead=${leadId}(${hasPhoto ? "photo" : "no-photo"}), intro=${!!introText}`);
      weeksCount++;
      continue;
    }

    const groups = groupByCategory(events);
    let introText: string | null = null;
    try {
      introText = await generateIntro(weekLabel, groups);
    } catch (e: any) {
      processed.push(`WARN ${weekLabel} intro failed: ${e.message}`);
    }

    await upsertDigest(ws, we, weekLabel, introText, events.length, leadId, publish);
    processed.push(`INSERT ${weekLabel} — ${events.length} events, lead=${leadId}, published=${publish}`);
    weeksCount++;
  }

  return NextResponse.json({ mode, weeks_processed: weeksCount, details: processed });
}
