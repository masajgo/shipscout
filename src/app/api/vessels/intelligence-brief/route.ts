import { NextResponse } from "next/server";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const HAIKU_MODEL       = "claude-haiku-4-5-20251001";

interface BriefRequest {
  vesselName:    string;
  imo:           string | number;
  age:           number;
  type:          string | null;
  flag:          string | null;
  ldt:           number | null;
  scrapScore:    number;
  detentionCount: number;
  specialSurveyDate: string | null;
  signals:       { label: string; explanation: string }[];
  managerName:   string | null;
  ownerName:     string | null;
  estimatedValue: string | null;
}

export async function POST(req: Request) {
  let body: BriefRequest;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    vesselName, imo, age, type, flag, ldt, scrapScore,
    detentionCount, specialSurveyDate, signals, managerName, ownerName, estimatedValue
  } = body;

  const signalLines = signals
    .filter(s => s.label !== "25+ Years")
    .map(s => `- ${s.label}: ${s.explanation}`)
    .join("\n");

  const surveyNote = specialSurveyDate
    ? `Special survey due ${new Date(specialSurveyDate).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}.`
    : null;

  const prompt = [
    `You are a maritime intelligence analyst writing a brief for a cash buyer considering purchasing a vessel for recycling.`,
    ``,
    `Vessel: ${vesselName} (IMO ${imo})`,
    `Age: ${age} years old`,
    type    ? `Type: ${type}` : null,
    flag    ? `Flag: ${flag}` : null,
    ldt     ? `LDT: ${ldt.toLocaleString()} t` : null,
    estimatedValue ? `Est. scrap value at Aliağa: ${estimatedValue}` : null,
    `Scrap score: ${scrapScore}/100`,
    detentionCount > 0 ? `PSC detentions: ${detentionCount}` : null,
    surveyNote,
    managerName || ownerName ? `Manager/Owner: ${managerName ?? ownerName}` : null,
    signalLines ? `\nDistress signals:\n${signalLines}` : null,
    ``,
    `Write a 2-sentence intelligence brief for this vessel aimed at a cash buyer or recycling yard.`,
    `Sentence 1: What makes this vessel notable right now (combine age, score, key signal).`,
    `Sentence 2: What the buyer should do or consider (timing, approach, risk).`,
    ``,
    `Rules: factual, no hype, no markdown, no headers. Return only the 2 sentences.`,
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
      max_tokens: 180,
      messages:   [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) return NextResponse.json({ error: `Anthropic ${res.status}` }, { status: 502 });

  const data  = await res.json();
  const brief = (data.content?.[0]?.text ?? "").trim();
  return NextResponse.json({ brief });
}
