import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { categorizeEmails, guessEmailsFromName, GENERIC_LOCALS } from "@/lib/contactEnricher";
import type { ContactResult } from "@/lib/contactEnricher";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
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
              department_emails, generic_emails, guessed_emails,
              email_validations, best_email,
              web_fetched_at
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
  const genEmails    = (ownerRow.generic_emails as string[] | null) ?? [];
  const dbGuessed    = (ownerRow.guessed_emails as { email: string; name: string; guessed: true }[] | null) ?? [];
  const website      = (ownerRow.website as string | null) ?? null;
  const emailFormat  = (ownerRow.email_format as string | null) ?? null;
  const webFetchedAt = (ownerRow.web_fetched_at as string | null) ?? null;

  // Prefer DB-stored categorised arrays; fall back to runtime categorisation
  const categorized  = categorizeEmails(allEmails);
  const department   = deptEmails.length ? deptEmails : [...new Set([...categorized.department])];
  const generic      = genEmails.length  ? genEmails  : categorized.generic;
  const other        = categorized.other.filter(e => !GENERIC_LOCALS.has(e.split("@")[0]));

  // Layer 4 — prefer DB-stored guessed emails, fall back to runtime guess
  const guessedEmails = dbGuessed.length
    ? dbGuessed
    : (website && emailFormat && managerName)
      ? guessEmailsFromName(managerName, emailFormat, website)
      : [];

  const linkedinCompanyUrl = (ownerRow.linkedin_company_url as string | null)
    || `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;
  const linkedinPeopleUrl  = (ownerRow.linkedin_people_url as string | null)
    || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + " chartering sale purchase")}`;

  const contact: ContactResult = {
    company,
    website,
    emails:           allEmails,
    emailsByType:     { department, generic, other },
    emailFormat,
    guessedEmails,
    phones:           (ownerRow.phones            as string[] | null) ?? [],
    address:          (ownerRow.address           as string | null)   ?? null,
    emailValidations: (ownerRow.email_validations as Record<string, unknown> | null) ?? {},
    bestEmail:        (ownerRow.best_email        as string | null)   ?? null,
    linkedinCompanyUrl,
    linkedinPeopleUrl,
    contactPath:      null,
  };

  return NextResponse.json(
    {
      imo,
      ownerName:   ownerRow.owner_name   as string | null,
      managerName: ownerRow.manager_name as string | null,
      contact,
      webFetchedAt: webFetchedAt,
      cached: "db",
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
