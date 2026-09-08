import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/auth";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert maritime vessel listing copywriter for the S&P (Sale & Purchase) market. Write professional, accurate, and compelling vessel listing descriptions. Guidelines:
- Use maritime industry terminology naturally
- Be factual — do not invent technical specifications not provided
- Keep descriptions between 120–250 words
- For sale listings: highlight condition, history, and commercial potential
- For charter listings: emphasize operational readiness, cargo capacity, trading area
- For scrap listings: be straightforward about age and condition; mention compliance and delivery terms
- Write in third person, professional tone
- Do not include price or contact information`;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.vessel?.name || !body?.listingType) {
    return NextResponse.json({ error: "vessel and listingType are required" }, { status: 400 });
  }

  const { vessel, listingType, draft } = body;

  const userPrompt = [
    `Write a professional listing description for this vessel:`,
    `Name: ${vessel.name}`,
    `IMO: ${vessel.imo}`,
    `Type: ${vessel.type}`,
    `Flag: ${vessel.flag}`,
    `Built: ${vessel.builtYear}`,
    vessel.scrapScore ? `Scrap score: ${vessel.scrapScore}/100 (${vessel.scrapCategory})` : null,
    `Listing type: ${listingType === "sale" ? "For Sale" : listingType === "charter" ? "Charter" : "For Scrap"}`,
    draft?.trim() ? `\nThe broker's draft to refine:\n"${draft.trim()}"` : "",
  ].filter(Boolean).join("\n");

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  return NextResponse.json({ description: text });
}
