import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { enrichCompanyContact } from "@/lib/contactEnricher";

export const runtime     = "nodejs";
export const maxDuration = 30;

// GET /api/vessels/:mmsi/contact
// Pipeline: manager_name (from DB, written by Equasis scraper) → contactEnricher
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  // 1. Read imo + manager_name from DB (manager_name populated by Equasis scraper)
  let imo:         string | null = null;
  let managerName: string | null = null;

  try {
    const { rows } = await pool.query(
      "SELECT imo::text, manager_name FROM vessels WHERE mmsi = $1::bigint",
      [mmsi],
    );
    imo         = rows[0]?.imo          ?? null;
    managerName = rows[0]?.manager_name ?? null;
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }

  if (!imo) {
    return NextResponse.json({ error: "vessel not found" }, { status: 404 });
  }

  if (!managerName) {
    return NextResponse.json(
      { error: "manager_name not yet available — run Equasis scraper first", imo },
      { status: 404 },
    );
  }

  // 2. Contact enrichment
  const contact = await enrichCompanyContact(managerName);

  return NextResponse.json(
    { imo, ownerName: managerName, contact },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
