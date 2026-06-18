import { NextRequest, NextResponse } from "next/server";

// In-memory store — persists within the same serverless instance
// For full persistence, connect Vercel Blob store via dashboard
const store: { vessels: any[]; ownerQueue: any[] } = { vessels: [], ownerQueue: [] };

export async function POST(req: NextRequest) {
  try {
    const vessel = await req.json();
    if (!vessel?.imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

    const exists = store.vessels.find((v) => v.imo === vessel.imo);
    if (exists) return NextResponse.json({ status: "already_watching" });

    const entry = {
      imo:       vessel.imo,
      name:      vessel.name      || `Vessel ${vessel.imo}`,
      flag:      vessel.flag      || null,
      source:    vessel.source    || "manual",
      addedAt:   new Date().toISOString(),
      status:    "watching",
    };

    store.vessels.push(entry);
    store.ownerQueue.push({ imo: vessel.imo, queuedAt: new Date().toISOString() });

    return NextResponse.json({ status: "watching", vessel: entry });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ vessels: store.vessels });
}
