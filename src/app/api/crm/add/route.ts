import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CRM_PATH = path.join(process.cwd(), "scraper/data/crm_vessels.json");

function loadCRM() {
  try {
    if (!fs.existsSync(CRM_PATH)) return [];
    return JSON.parse(fs.readFileSync(CRM_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveCRM(data: any[]) {
  const dir = path.dirname(CRM_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CRM_PATH, JSON.stringify(data, null, 2));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imo, name, score, stage } = body;

    if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

    const crm = loadCRM();
    const existingIndex = crm.findIndex((v: any) => v.imo === imo);

    const entry = {
      imo,
      name: name || `IMO ${imo}`,
      score: score || 0,
      stage: stage || "lead",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      crm[existingIndex] = { ...crm[existingIndex], ...entry, updatedAt: new Date().toISOString() };
    } else {
      crm.push(entry);
    }

    saveCRM(crm);
    return NextResponse.json({ success: true, entry });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
