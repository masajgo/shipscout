import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { categorizeEmails, guessEmailsFromName, GENERIC_LOCALS } from "@/lib/contactEnricher";
import type { ContactResult } from "@/lib/contactEnricher";

export const runtime     = "nodejs";
export const maxDuration = 10;

/*
  Required columns (run once in Supabase SQL editor if not present):

  ALTER TABLE owners ADD COLUMN IF NOT EXISTS linkedin_company_url TEXT;
  ALTER TABLE owners ADD COLUMN IF NOT EXISTS linkedin_people_url  TEXT;
  ALTER TABLE owners ADD COLUMN IF NOT EXISTS department_emails    TEXT[];
*/

// GET /api/vessels/:mmsi/contact
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  // 1. Resolve IMO from vessels table
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

  // 2. Read from owners table
  let ownerRow: Record<string, unknown> | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT imo::text, vessel_name, owner_name, manager_name, ism_manager,
              website, emails, phones, address, email_format,
              linkedin_url, linkedin_company_url, linkedin_people_url,
              department_emails
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

  // 3. Build ContactResult from owners row
  const company      = (ownerRow.manager_name || ownerRow.owner_name || "") as string;
  const managerName  = (ownerRow.manager_name || ownerRow.ism_manager || "") as string;
  const allEmails    = (ownerRow.emails as string[] | null) ?? [];
  const deptEmails   = (ownerRow.department_emails as string[] | null) ?? [];
  const website      = (ownerRow.website as string | null) ?? null;
  const emailFormat  = (ownerRow.email_format as string | null) ?? null;

  // Categorise all emails; merge stored department_emails array at top
  const categorized  = categorizeEmails(allEmails);
  const department   = [...new Set([...deptEmails, ...categorized.department])];
  const generic      = categorized.generic;
  const other        = categorized.other.filter(e => !GENERIC_LOCALS.has(e.split("@")[0]));

  // Layer 4 — guessed personal email
  const guessedEmails = (website && emailFormat && managerName)
    ? guessEmailsFromName(managerName, emailFormat, website)
    : [];

  const linkedinCompanyUrl = (ownerRow.linkedin_company_url as string | null)
    || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;
  const linkedinPeopleUrl  = (ownerRow.linkedin_people_url as string | null)
    || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + " chartering sale purchase")}`;

  const contact: ContactResult = {
    company,
    website,
    emails:       allEmails,
    emailsByType: { department, generic, other },
    emailFormat,
    guessedEmails,
    phones:       (ownerRow.phones  as string[] | null) ?? [],
    address:      (ownerRow.address as string | null)   ?? null,
    linkedinCompanyUrl,
    linkedinPeopleUrl,
    contactPath:  null,
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
