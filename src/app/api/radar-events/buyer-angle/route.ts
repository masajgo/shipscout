import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

interface BuyerAngleRequest {
  eventType:   string;
  vesselName:  string | null;
  imo:         string | null;
  location:    string | null;
  summary:     string;
  sourceName:  string;
}

const EVENT_CONTEXT: Record<string, string> = {
  arrest:          "vessel physically seized by port authority or coast guard",
  bank_seizure:    "vessel repossessed by lender — owner likely in financial distress",
  judicial_auction:"vessel being sold by court order — potential forced sale",
  bankruptcy:      "owner or operator entered insolvency proceedings",
  sanction:        "vessel placed on government sanctions list (OFAC or equivalent)",
  detention:       "vessel detained by Port State Control for safety/compliance deficiencies",
  scrap_sale:      "vessel sold for demolition/recycling",
  layup:           "vessel stationary for extended period — likely idle or awaiting sale",
};

export async function POST(req: Request) {
  let body: BuyerAngleRequest;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { eventType, vesselName, imo, location, summary, sourceName } = body;

  const eventDesc = EVENT_CONTEXT[eventType] ?? eventType;

  const prompt = [
    `You are a maritime intelligence analyst. A cash buyer or recycling yard is reading a news signal and wants to know what action to take.`,
    ``,
    `Event type: ${eventType} (${eventDesc})`,
    vesselName ? `Vessel: ${vesselName}${imo ? ` (IMO ${imo})` : ""}` : null,
    location   ? `Location: ${location}` : null,
    `Source: ${sourceName}`,
    `Summary: ${summary}`,
    ``,
    `Write exactly 2 sentences:`,
    `Sentence 1: What this event means in terms of vessel availability or owner distress.`,
    `Sentence 2: Specific action a cash buyer should consider (e.g., "Contact the manager now", "Monitor court proceedings", "Wait for auction listing").`,
    ``,
    `Rules: direct, actionable, no jargon, no markdown. Return only the 2 sentences.`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      HAIKU_MODEL,
      max_tokens: 160,
      messages:   [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) return NextResponse.json({ error: `Anthropic ${res.status}` }, { status: 502 });

  const data  = await res.json();
  const angle = (data.content?.[0]?.text ?? "").trim();
  return NextResponse.json({ angle });
}
