import { NextResponse } from "next/server";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";

// Tracked IMOs — Datalastic verified
const TRACKED_IMOS = [
  "9038828", // ZEUS           — Crude Oil Tanker, Panama,     1992
  "9038749", // ENERGY 5       — Crude Oil Tanker, Saint Kitts, 1994
  "9248904", // CFL DEXING     — Bulk Carrier,     Panama,     2001
  "9065572", // WHITE SHARK    — Bulk Carrier,     Saint Kitts, 1993
  "9074705", // HONG LI        — Bulk Carrier,     Panama,     1995
  "9200811", // ISTANBUL BRIDGE— Container Ship,   Liberia,    2000
];

// $/LDT prices per market (updated Jun 2026)
const MARKET_PRICES: Record<string, number> = {
  Alang: 510, Chittagong: 560, Gadani: 500, "Aliağa": 420,
};

function bestMarket(type: string): string {
  if (type?.toLowerCase().includes("tanker")) return "Alang";
  if (type?.toLowerCase().includes("bulk"))   return "Chittagong";
  if (type?.toLowerCase().includes("container")) return "Alang";
  return "Gadani";
}

function scoreFromAge(age: number): number {
  if (age >= 32) return 90 + Math.min(9, age - 32);
  if (age >= 28) return 82 + (age - 28);
  if (age >= 24) return 72 + (age - 24) * 2;
  if (age >= 20) return 60 + (age - 20) * 3;
  return Math.max(30, 40 + age);
}

function statusFromScore(score: number): { status: string; statusType: string } {
  if (score >= 90) return { status: "P&I Withdrawn", statusType: "r" };
  if (score >= 85) return { status: "Detained",      statusType: "r" };
  if (score >= 78) return { status: "AIS Dark",      statusType: "b" };
  if (score >= 70) return { status: "Survey Due",    statusType: "a" };
  if (score >= 60) return { status: "Lay-up",        statusType: "a" };
  return               { status: "94d Idle",         statusType: "a" };
}

function typeLabel(raw: string): string {
  if (!raw) return "General Cargo";
  const r = raw.toLowerCase();
  if (r.includes("bulk"))      return "Bulk Carrier";
  if (r.includes("crude") || r.includes("oil tanker")) return "Tanker";
  if (r.includes("tanker"))    return "Tanker";
  if (r.includes("container")) return "Container";
  if (r.includes("cargo"))     return "General Cargo";
  return raw;
}

async function fetchVessel(imo: string) {
  try {
    const res = await fetch(
      `${BASE}/vessel_info?imo=${imo}&api-key=${API_KEY}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!API_KEY) {
    return NextResponse.json({ error: "API key missing" }, { status: 500 });
  }

  const results = await Promise.all(TRACKED_IMOS.map(fetchVessel));
  const year = new Date().getFullYear();

  const vessels = results
    .map((d, i) => {
      if (!d) return null;
      const imo      = TRACKED_IMOS[i];
      const built    = parseInt(d.year_built) || 2000;
      const age      = year - built;
      const dwt      = d.deadweight   || 0;
      const ldt      = d.lightship    || Math.round(dwt * 0.17);
      const type     = typeLabel(d.type_specific);
      const market   = bestMarket(d.type_specific);
      const price    = MARKET_PRICES[market] ?? 500;
      const estUSD   = ldt * price;
      const score    = Math.min(99, scoreFromAge(age));
      const { status, statusType } = statusFromScore(score);

      return {
        imo,
        name:       d.name        || `Vessel ${imo}`,
        flag:       d.country_name || "Unknown",
        type,
        built,
        dwt,
        ldt,
        location:   d.last_port   || d.home_port || "—",
        score,
        status,
        statusType,
        estValue:   `$${(estUSD / 1_000_000).toFixed(2)}M`,
        market,
        deadline:   null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score);

  return NextResponse.json(
    { vessels, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
