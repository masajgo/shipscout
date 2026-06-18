import { NextRequest, NextResponse } from "next/server";

// In-memory store — persists within the same serverless instance
// For full persistence, connect Vercel Blob store via dashboard
const crm: any[] = [];

export async function POST(req: NextRequest) {
  try {
    const { imo, name, score, stage } = await req.json();
    if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

    const idx = crm.findIndex((v) => v.imo === imo);
    const entry = {
      imo,
      name:      name  || `IMO ${imo}`,
      score:     score || 0,
      stage:     stage || "lead",
      addedAt:   idx >= 0 ? crm[idx].addedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (idx >= 0) {
      crm[idx] = entry;
    } else {
      crm.push(entry);
    }

    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ vessels: crm });
}
