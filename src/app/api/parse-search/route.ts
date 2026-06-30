import { NextRequest, NextResponse } from "next/server";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

// POST /api/parse-search
// Body: { query: string }
// Returns: filter object compatible with /api/vessels/search

const SYSTEM = `You are a maritime vessel search assistant. Parse the user's natural language query into a JSON filter object.

Return ONLY valid JSON with these optional fields:
{
  "type": ["Bulk Carrier"],         // array of vessel types from: Bulk Carrier, Tanker, Container, General Cargo, Offshore, Cruise
  "flag": "Panama",                 // string, partial match
  "ageMin": 15,                     // number
  "ageMax": 30,                     // number
  "dwtMin": 10000,                  // number
  "dwtMax": 200000,                 // number
  "ldtMin": 5000,                   // number
  "ldtMax": 50000,                  // number
  "scrapRisk": ["critical","high"], // subset of: critical, high, medium
  "hasDetention": true,             // boolean
  "specialSurvey6mo": true,         // boolean
  "hasContact": true                // boolean
}

Only include fields that are clearly implied by the query. Do not invent values.
Examples:
- "old tankers over 25 years" → {"type":["Tanker"],"ageMin":25}
- "critical scrap candidates with contacts" → {"scrapRisk":["critical"],"hasContact":true}
- "Panama flagged bulk carriers" → {"type":["Bulk Carrier"],"flag":"Panama"}`;

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({ query: "" }));
  if (!query?.trim()) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ noKey: true, filters: {} });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system:     SYSTEM,
        messages:   [{ role: "user", content: query }],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json() as {
      content?: { text: string }[];
      error?: { type: string; message: string };
    };

    if (data.error) {
      const msg = data.error.message || "";
      if (msg.includes("credit") || msg.includes("balance")) {
        return NextResponse.json({ noCredits: true, filters: {} });
      }
      return NextResponse.json({ error: msg, filters: {} }, { status: 500 });
    }

    const text = data.content?.[0]?.text?.trim() ?? "{}";
    // Extract JSON even if model wrapped it in markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const filters = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return NextResponse.json({ filters });
  } catch (e: unknown) {
    const msg = (e as Error).message;
    if (msg.includes("credit") || msg.includes("balance")) {
      return NextResponse.json({ noCredits: true, filters: {} });
    }
    return NextResponse.json({ error: msg, filters: {} }, { status: 500 });
  }
}
