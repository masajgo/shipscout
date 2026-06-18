import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "scraper/data/crm_vessels.json");

function load(): { vessels: any[] } {
  if (!fs.existsSync(STORE_PATH)) return { vessels: [] };
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function save(store: object) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export async function POST(req: NextRequest) {
  const { imo, name, score, status } = await req.json();
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  const store = load();
  const idx = store.vessels.findIndex((v) => v.imo === imo);

  const entry = {
    imo,
    name: name || `Vessel ${imo}`,
    score: score ?? null,
    status: status || null,
    addedAt: new Date().toISOString(),
    stage: "new",
  };

  if (idx !== -1) {
    store.vessels[idx] = { ...store.vessels[idx], ...entry };
  } else {
    store.vessels.push(entry);
  }

  save(store);
  return NextResponse.json({ status: "added", vessel: entry });
}
