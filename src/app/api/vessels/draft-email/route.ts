import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

interface DraftEmailRequest {
  vesselName:   string;
  imo:          string | number;
  age:          number;
  type:         string | null;
  ldt:          number | null;
  flag:         string | null;
  managerName:  string | null;
  ownerName:    string | null;
  signals:      { label: string; explanation: string }[];
  estimatedValue: string | null;
}

export async function POST(req: Request) {
  let body: DraftEmailRequest;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vesselName, imo, age, type, ldt, flag, managerName, ownerName, signals, estimatedValue } = body;

  const recipientName = managerName ?? ownerName ?? null;
  const signalBullets = signals
    .filter(s => s.label !== "25+ Years")
    .map(s => `- ${s.label}: ${s.explanation}`)
    .join("\n");

  const prompt = [
    `You are a professional maritime broker writing a cold outreach email to a shipowner on behalf of a cash buyer interested in purchasing the vessel for immediate recycling.`,
    ``,
    `Vessel details:`,
    `- Name: ${vesselName} (IMO ${imo})`,
    `- Age: ${age} years`,
    type    ? `- Type: ${type}` : null,
    ldt     ? `- LDT: ${ldt.toLocaleString()} tonnes` : null,
    flag    ? `- Flag: ${flag}` : null,
    estimatedValue ? `- Estimated scrap value: ${estimatedValue}` : null,
    ``,
    `Distress signals that caught our attention:`,
    signalBullets || "- Vessel approaching end of commercial trading life",
    ``,
    `Recipient: ${recipientName ? `The ship manager or owner is ${recipientName}. Open with "Dear ${recipientName},"` : 'Unknown — open with "Dear Sir/Madam,"'}`,
    ``,
    `Write a 3-paragraph professional cold email:`,
    `1. Opening: briefly introduce purpose — a cash buyer seeking recycling tonnage`,
    `2. Middle: mention the specific vessel and 1-2 of its distress signals naturally (do not list them robotically). Show you've done research.`,
    `3. Close: simple CTA — "happy to discuss" or "let me know if you'd like to explore this"`,
    ``,
    `Rules: professional but not stiff. No fluff. No markdown. No headers. Max 180 words. Return only the email body (no subject line).`,
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
      max_tokens: 400,
      messages:   [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Anthropic ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const emailBody = (data.content?.[0]?.text ?? "").trim();
  const subject   = `${vesselName} (IMO ${imo}) — Recycling Purchase Interest`;

  return NextResponse.json({ subject, body: emailBody });
}
