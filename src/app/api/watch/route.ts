import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const BLOB_KEY = "watched_vessels.json";

type Store = { vessels: any[]; ownerQueue: any[] };

async function loadStore(): Promise<Store> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return { vessels: [], ownerQueue: [] };
    const res = await fetch(blobs[0].url);
    if (!res.ok) return { vessels: [], ownerQueue: [] };
    return await res.json();
  } catch {
    return { vessels: [], ownerQueue: [] };
  }
}

async function saveStore(store: Store) {
  await put(BLOB_KEY, JSON.stringify(store, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    const vessel = await req.json();
    if (!vessel?.imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

    const store  = await loadStore();
    const exists = store.vessels.find((v) => v.imo === vessel.imo);
    if (exists) return NextResponse.json({ status: "already_watching" });

    const entry = {
      imo:     vessel.imo,
      name:    vessel.name   || `Vessel ${vessel.imo}`,
      flag:    vessel.flag   || null,
      source:  vessel.source || "manual",
      addedAt: new Date().toISOString(),
      status:  "watching",
    };

    store.vessels.push(entry);
    store.ownerQueue.push({ imo: vessel.imo, queuedAt: new Date().toISOString() });
    await saveStore(store);

    return NextResponse.json({ status: "watching", vessel: entry });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}

export async function GET() {
  const store = await loadStore();
  return NextResponse.json({ vessels: store.vessels });
}
