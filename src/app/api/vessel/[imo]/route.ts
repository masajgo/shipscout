import { NextRequest, NextResponse } from "next/server";
import { computeScrapScore } from "@/lib/scoring";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";
const REPORTS = "https://api.datalastic.com/api/maritime_reports";

async function dl(url: string) {
  try {
    const res = await fetch(`${url}&api-key=${API_KEY}`, { next: { revalidate: 3600 } });
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
  const { imo } = await params;
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });
  if (!API_KEY) return NextResponse.json({ error: "API key missing" }, { status: 500 });

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
  const dwt = vessel?.data?.deadweight || 0;
  const ldt = vessel?.data?.lightship || (dwt ? Math.round(dwt * 0.17) : 0);

  const scrapScore = computeScrapScore(
    age,
    inspect?.data?.length ?? 0,
    drydock?.data?.next_dry_dock ?? null,
  );

  return NextResponse.json({
    imo,
    age,
    scrapScore,
    particulars: {
      name:         vessel?.data?.name,
      flag:         vessel?.data?.country_name,
      type:         vessel?.data?.type_specific,
      builtYear:    vessel?.data?.year_built,
      builtAt:      vessel?.data?.place_of_build,
      dwt,
      grt:          vessel?.data?.gross_tonnage,
      nrt:          vessel?.data?.net_tonnage,
      ldt,
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
}
