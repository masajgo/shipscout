import { NextResponse } from "next/server";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";

const TRACKED_IMOS = [
  "9038828", "9038749", "9248904", "9065572", "9074705", "9200811",
  "9038880", "8912522", "9108128", "9015101", "9083940", "9040089",
];

const MARKET_PRICES: Record<string, number> = {
  Alang: 501, Chittagong: 541, Gadani: 511, "Aliağa": 332,
};

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

function scoreFromAge(age: number): number {
  if (age >= 32) return 90 + Math.min(9, age - 32);
  if (age >= 28) return 82 + (age - 28);
  if (age >= 24) return 72 + (age - 24) * 2;
  if (age >= 20) return 60 + (age - 20) * 3;
  return Math.max(30, 40 + age);
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

  if (score >= 90) {
    alertType   = "judicial";
    priority    = "critical";
    title       = `P&I Withdrawn — MV ${name}`;
    description = `${age}-year-old ${type} has had P&I insurance withdrawn. Vessel cannot trade legally. Owner under pressure to sell — scrap or distressed sale imminent. Estimated value $${(value / 1_000_000).toFixed(2)}M at ${market}.`;
  } else if (score >= 85) {
    alertType   = "bank";
    priority    = "high";
    title       = `Detained — MV ${name}`;
    description = `${age}-year-old ${type} flagged ${flag}. High scrap score (${score}) — PSC detention risk elevated. Vessel approaching end-of-life economics. Survey renewal cost likely exceeds market value.`;
  } else if (score >= 78) {
    alertType   = "dark";
    priority    = "high";
    title       = `AIS Dark — MV ${name}`;
    description = `${age}-year-old ${type} showing AIS dark signal. Last known position logged. Vessel age and condition suggest possible distressed routing. Scrap score ${score}/100.`;
  } else if (score >= 70) {
    alertType   = "survey";
    priority    = "medium";
    title       = `Survey Due — MV ${name}`;
    description = `${age}-year-old ${type} has class renewal survey approaching. Estimated survey cost may exceed vessel operational value. Owner likely evaluating scrap vs. continue.`;
  } else {
    alertType   = "idle";
    priority    = "medium";
    title       = `Extended Idle — MV ${name}`;
    description = `${age}-year-old ${type} showing extended idle pattern. No recent cargo activity detected. Vessel may be approaching lay-up or scrapping decision.`;
  }

  return {
    id:          parseInt(imo),
    type:        alertType,
    priority,
    title,
    vessel:      `MV ${name}`,
    flag:        flag,
    imo:         `IMO ${imo}`,
    ldt,
    vesselType:  type,
    age,
    market,
    value,
    description,
    deadline:    null,
    daysLeft:    null,
    location:    d.last_port || d.home_port || "—",
    court:       null,
    reservePrice: null,
    inspection:  null,
    contact:     null,
    time:        "Live",
    read:        false,
    score,
  };
}

async function fetchVessel(imo: string) {
  try {
    const res = await fetch(`${BASE}/vessel_info?imo=${imo}&api-key=${API_KEY}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!API_KEY) return NextResponse.json({ error: "API key missing" }, { status: 500 });

  const results = await Promise.all(TRACKED_IMOS.map(fetchVessel));
  const year = new Date().getFullYear();

  const alerts = results
    .map((d, i) => d ? alertFromVessel(d, TRACKED_IMOS[i], year) : null)
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score);

  return NextResponse.json(
    { alerts, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
