import { NextRequest, NextResponse } from "next/server";

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

  function scoreFromAge(a: number): number {
    if (a >= 32) return 90 + Math.min(9, a - 32);
    if (a >= 28) return 82 + (a - 28);
    if (a >= 24) return 72 + (a - 24) * 2;
    if (a >= 20) return 60 + (a - 20) * 3;
    return Math.max(30, 40 + a);
  }

  let scrapScore = age ? scoreFromAge(age) : 30;
  if (inspect?.data?.length >= 3) scrapScore = Math.min(99, scrapScore + 5);
  if (drydock?.data?.next_dry_dock) {
    const monthsLeft = (new Date(drydock.data.next_dry_dock).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsLeft < 6) scrapScore = Math.min(99, scrapScore + 5);
  }

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
