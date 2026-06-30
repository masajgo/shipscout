import { NextRequest, NextResponse } from "next/server";
import { computeScrapScore } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE = "https://api.datalastic.com/api/v0";
const REPORTS = "https://api.datalastic.com/api/maritime_reports";

async function dl(url: string) {
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "X-Api-Key": API_KEY! },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imo: string }> }
) {
  let imo: string;
  try {
    ({ imo } = await params);
  } catch {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });
  if (!API_KEY) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  try {
  // Paralel çek
  const [info, ownership, dryDock, inspections] = await Promise.allSettled([
    dl(`${BASE}/vessel_info?imo=${imo}`),
    dl(`${REPORTS}/ownership?imo=${imo}`),
    dl(`${REPORTS}/dry_dock?imo=${imo}`),
    dl(`${REPORTS}/inspections?imo=${imo}`),
  ]);

  const vessel  = info.status        === "fulfilled" ? info.value        : null;
  const owner   = ownership.status   === "fulfilled" ? ownership.value   : null;
  const drydock = dryDock.status     === "fulfilled" ? dryDock.value     : null;
  const inspect = inspections.status === "fulfilled" ? inspections.value : null;

  const builtYear = vessel?.data?.year_built;
  const age = builtYear ? new Date().getFullYear() - builtYear : null;
  const scrapScore = computeScrapScore(
    age,
    inspect?.data?.length ?? 0,
    drydock?.data?.next_dry_dock ?? null,
  );

  return NextResponse.json({
    imo,
    scrapScore: Math.min(100, scrapScore),
    age,
    particulars: {
      name:         vessel?.data?.name,
      flag:         vessel?.data?.flag,
      type:         vessel?.data?.vessel_type,
      builtYear:    vessel?.data?.year_built,
      builtAt:      vessel?.data?.place_of_build,
      dwt:          vessel?.data?.deadweight,
      grt:          vessel?.data?.gross_tonnage,
      nrt:          vessel?.data?.net_tonnage,
      ldt:          vessel?.data?.lightship,
      loa:          vessel?.data?.length,
      beam:         vessel?.data?.breadth,
      draft:        vessel?.data?.draught,
      callSign:     vessel?.data?.callsign,
      mmsi:         vessel?.data?.mmsi,
      classSociety: vessel?.data?.class_society,
      status:       vessel?.data?.vessel_status,
    },
    owner: {
      name:         owner?.data?.owner_name,
      email:        owner?.data?.owner_email,
      phone:        owner?.data?.owner_phone,
      address:      owner?.data?.owner_address,
      country:      owner?.data?.owner_country,
      managerName:  owner?.data?.manager_name,
      managerEmail: owner?.data?.manager_email,
    },
    surveys: {
      lastDryDock: drydock?.data?.last_dry_dock,
      nextDryDock: drydock?.data?.next_dry_dock,
      classExpiry: drydock?.data?.class_expiry,
    },
    detentions: inspect?.data ?? [],
  });
  } catch (e: unknown) {
    console.error(`[owner/${imo}]`, e);
    return NextResponse.json({ error: "Owner data unavailable" }, { status: 503 });
  }
}
