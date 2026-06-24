import { NextRequest, NextResponse } from "next/server";
import { computeScrapScore } from "@/lib/scoring";
import pool from "@/lib/db";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";
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
  const { imo } = await params;
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });
  if (!API_KEY) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  const [info, ownership, dryDock, inspections, dbRow] = await Promise.allSettled([
    dl(`${BASE}/vessel_info?imo=${imo}`),
    dl(`${REPORTS}/ownership?imo=${imo}`),
    dl(`${REPORTS}/dry_dock?imo=${imo}`),
    dl(`${REPORTS}/inspections?imo=${imo}`),
    pool.query(`SELECT photo_url FROM vessels WHERE imo = $1::bigint LIMIT 1`, [imo])
      .then(r => r.rows[0] ?? null).catch(() => null),
  ]);

  const vessel   = info.status        === "fulfilled" ? info.value        : null;
  const owner    = ownership.status   === "fulfilled" ? ownership.value   : null;
  const drydock  = dryDock.status     === "fulfilled" ? dryDock.value     : null;
  const inspect  = inspections.status === "fulfilled" ? inspections.value : null;
  const photoUrl = dbRow.status       === "fulfilled" ? (dbRow.value as any)?.photo_url ?? null : null;

  const builtYear = vessel?.data?.year_built;
  const age = builtYear ? new Date().getFullYear() - builtYear : null;
  const dwt = vessel?.data?.deadweight || 0;
  const ldtRaw = vessel?.data?.lightship;
  const vesselType = (vessel?.data?.type_specific || "").toLowerCase();
  // DWT-to-LDT ratio by vessel type
  const ldtRatio = vesselType.includes("passenger") || vesselType.includes("cruise") ? 0.20
    : vesselType.includes("tanker") ? 0.18
    : 0.17; // bulk, general cargo, container default
  const ldtFromDwt = dwt ? Math.round(dwt * ldtRatio) : 0;
  // Use raw LDT only if plausible (>= 500); otherwise estimate from DWT
  const ldt = (ldtRaw && ldtRaw >= 500) ? ldtRaw : ldtFromDwt;
  const ldt_estimated = !(ldtRaw && ldtRaw >= 500) && !!ldt;

  const scrapScore = computeScrapScore(
    age,
    inspect?.data?.length ?? 0,
    drydock?.data?.next_dry_dock ?? null,
  );

  return NextResponse.json({
    imo,
    age,
    scrapScore,
    photoUrl,
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
      ldt_estimated,
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
