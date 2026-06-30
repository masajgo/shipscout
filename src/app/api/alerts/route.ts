import { NextResponse } from "next/server";
import { scoreFromAge } from "@/lib/scoring";
import { SCRAP_MARKETS } from "@/lib/scrapMarkets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";

const TRACKED_IMOS = [
  "9038828", "9038749", "9248904", "9065572", "9074705", "9200811",
  "9038880", "8912522", "9108128", "9015101", "9083940", "9040089",
];

const MARKET_PRICES: Record<string, number> = Object.fromEntries(
  SCRAP_MARKETS.map(m => [m.market, m.price])
);

function typeLabel(raw: string): string {
  if (!raw) return "General Cargo";
  const r = raw.toLowerCase();
  if (r.includes("bulk"))    return "Bulk Carrier";
  if (r.includes("crude") || r.includes("oil tanker")) return "Oil Tanker";
  if (r.includes("tanker"))  return "Oil Tanker";
  if (r.includes("container")) return "Container Ship";
  if (r.includes("cargo"))   return "General Cargo";
  return raw;
}

function bestMarket(type: string): string {
  if (type?.toLowerCase().includes("tanker")) return "Alang";
  if (type?.toLowerCase().includes("bulk"))   return "Chittagong";
  if (type?.toLowerCase().includes("container")) return "Alang";
  return "Gadani";
}


function alertFromVessel(d: any, imo: string, year: number) {
  const built  = parseInt(d.year_built) || 2000;
  const age    = year - built;
  const dwt    = d.deadweight || 0;
  const ldt    = d.lightship  || Math.round(dwt * 0.17);
  const type   = typeLabel(d.type_specific);
  const market = bestMarket(d.type_specific);
  const price  = MARKET_PRICES[market] ?? 500;
  const value  = ldt * price;
  const score  = Math.min(99, scoreFromAge(age));
  const name   = d.name || `Vessel ${imo}`;
  const flag   = d.country_iso || "—";

  let alertType: string;
  let priority: string;
  let title: string;
  let description: string;

  if (score >= 85) {
    alertType   = "age";
    priority    = "critical";
    title       = `End-of-Life Signal — MV ${name}`;
    description = `${age}-year-old ${type} flagged ${flag}. At this age, survey renewal costs typically exceed market value. Est. scrap value $${(value / 1_000_000).toFixed(2)}M at ${market} (${ldt.toLocaleString()} LDT).`;
  } else if (score >= 70) {
    alertType   = "survey";
    priority    = "high";
    title       = `Survey Due — MV ${name}`;
    description = `${age}-year-old ${type} approaching class renewal survey. Owner likely evaluating economics of continued trading vs. scrapping. Est. scrap value $${(value / 1_000_000).toFixed(2)}M.`;
  } else {
    alertType   = "idle";
    priority    = "medium";
    title       = `Age Watch — MV ${name}`;
    description = `${age}-year-old ${type} flagged ${flag}. Scrap score ${score}/100. Est. value $${(value / 1_000_000).toFixed(2)}M at ${market}.`;
  }

  return {
    id:          parseInt(imo),
    type:        alertType,
    priority,
    title,
    vessel:      `MV ${name}`,
    flag,
    imo:         `IMO ${imo}`,
    ldt,
    vesselType:  type,
    age,
    market,
    value,
    description,
    deadline:     null,
    daysLeft:     null,
    location:     d.last_port || d.home_port || "—",
    court:        null,
    reservePrice: null,
    inspection:   null,
    contact:      null,
    time:         "Live",
    read:         false,
    score,
  };
}

async function fetchVessel(imo: string) {
  try {
    const res = await fetch(`${BASE}/vessel_info?imo=${imo}`, {
      next: { revalidate: 3600 },
      headers: { "X-Api-Key": API_KEY! },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!API_KEY) {
    // No key → return empty list so the page renders without crashing
    return NextResponse.json(
      { alerts: [], updatedAt: new Date().toISOString(), warning: "API key missing" },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  }

  try {
    const results = await Promise.all(TRACKED_IMOS.map(fetchVessel));
    const year = new Date().getFullYear();

    const alerts = results
      .map((d, i) => d ? alertFromVessel(d, TRACKED_IMOS[i], year) : null)
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score);

    return NextResponse.json(
      { alerts, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: unknown) {
    console.error("[alerts]", e);
    return NextResponse.json(
      { alerts: [], updatedAt: new Date().toISOString(), error: "Upstream data unavailable" },
      { status: 200, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  }
}
