import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ContactResult } from "@/lib/contactEnricher";

export const runtime     = "nodejs";
export const maxDuration = 10;

// GET /api/vessels/:mmsi/contact
// Pipeline: owners tablo (Supabase) → 404 (cron yarın dolduracak)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  // 1. Gemi IMO'sunu vessels tablosundan al
  let imo: string | null = null;
  try {
    const { rows } = await pool.query(
      "SELECT imo::text FROM vessels WHERE mmsi = $1::bigint",
      [mmsi],
    );
    imo = rows[0]?.imo ?? null;
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }

  if (!imo) {
    return NextResponse.json({ error: "vessel not found" }, { status: 404 });
  }

  // 2. owners tablosundan kendi DB'mize bak
  let ownerRow: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT imo::text, vessel_name, owner_name, manager_name, ism_manager,
              website, emails, phones, address, email_format, linkedin_url
       FROM owners WHERE imo = $1::bigint`,
      [imo],
    );
    ownerRow = rows[0] ?? null;
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }

  if (!ownerRow) {
    return NextResponse.json(
      { error: "owner not yet enriched — daily scan will process this vessel", imo },
      { status: 404 },
    );
  }

  // 3. owners satırını ContactResult'a dönüştür
  const company = (ownerRow.manager_name || ownerRow.owner_name || "") as string;
  const linkedinSearchUrl = (ownerRow.linkedin_url as string | null) ||
    `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;

  const contact: ContactResult = {
    company,
    website:          (ownerRow.website      as string | null) ?? null,
    emails:           (ownerRow.emails       as string[] | null) ?? [],
    phones:           (ownerRow.phones       as string[] | null) ?? [],
    address:          (ownerRow.address      as string | null) ?? null,
    emailFormat:      (ownerRow.email_format as string | null) ?? null,
    linkedinSearchUrl,
    contactPath:      null,
  };

  return NextResponse.json(
    {
      imo,
      ownerName:   ownerRow.owner_name   as string | null,
      managerName: ownerRow.manager_name as string | null,
      contact,
      cached: "db",
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
