import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "scraper/data/watched_vessels.json");

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return { vessels: [], ownerQueue: [], emailQueue: [] };
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function saveStore(store: object) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export async function POST(req: NextRequest) {
  const vessel = await req.json();
  const store = loadStore();

  const exists = (store.vessels as { imo: string }[]).find((v) => v.imo === vessel.imo);
  if (exists) {
    return NextResponse.json({ status: "already_watching" });
  }

  const entry = {
    imo: vessel.imo,
    name: vessel.name,
    flag: vessel.flag || null,
    shipType: vessel.shipType || null,
    builtYear: vessel.builtYear || null,
    source: vessel.source || null,
    addedAt: new Date().toISOString(),
    detentions: [],
    ownerInfo: null,
    offerEmail: null,
    status: "watching",
  };

  (store.vessels as object[]).push(entry);
  (store.ownerQueue as object[]).push({ imo: vessel.imo, name: vessel.name, queuedAt: new Date().toISOString() });
  saveStore(store);

  return NextResponse.json({ status: "watching", vessel: entry });
}

export async function GET() {
  const store = loadStore();
  return NextResponse.json({ vessels: store.vessels });
}
