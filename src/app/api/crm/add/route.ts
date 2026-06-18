import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const BLOB_KEY = "crm_vessels.json";

async function loadCRM(): Promise<any[]> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return [];
    const res = await fetch(blobs[0].url);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function saveCRM(data: any[]) {
  await put(BLOB_KEY, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { imo, name, score, stage } = await req.json();
    if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

    const crm = await loadCRM();
    const idx  = crm.findIndex((v) => v.imo === imo);
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

    await saveCRM(crm);
    return NextResponse.json({ success: true, entry });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  const crm = await loadCRM();
  return NextResponse.json({ vessels: crm });
}
