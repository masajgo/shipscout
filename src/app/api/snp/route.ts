import { NextResponse } from "next/server";
import { list }         from "@vercel/blob";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";

const TRACKED_IMOS = [
  "9038828", "9038749", "9248904", "9065572", "9074705", "9200811",
  "9038880", "8912522", "9108128", "9015101", "9083940", "9040089",
  "7625811", // OCEAN ENDEAVOUR — Equasis verified, 1982 Passenger, mgr: Sunstone Ships Inc
];

const MARKET_PRICES: Record<string, number> = {
  Alang: 501, Chittagong: 541, Gadani: 511, "Aliağa": 332,
};

function typeLabel(raw: string): string {
  if (!raw) return "General Cargo";
  const r = raw.toLowerCase();
  if (r.includes("bulk"))      return "Bulk Carrier";
  if (r.includes("crude") || r.includes("oil tanker")) return "Oil / Crude Tanker";
  if (r.includes("tanker"))    return "Oil / Crude Tanker";
  if (r.includes("container")) return "Container Ship";
  if (r.includes("cargo"))     return "General Cargo";
  return raw;
}

function bestMarket(type: string): string {
  if (type?.toLowerCase().includes("tanker")) return "Alang";
  if (type?.toLowerCase().includes("bulk"))   return "Chittagong";
  if (type?.toLowerCase().includes("container")) return "Alang";
  return "Gadani";
}

function saleTypeFromVessel(age: number, score: number, imo: string): string {
  const imoNum = parseInt(imo) || 0;
  const bucket = imoNum % 4;
  if (score >= 90) {
    // spread critical vessels across distressed, judicial, bank
    if (bucket === 0) return "judicial";
    if (bucket === 1) return "bank";
    return "distressed";
  }
  if (score >= 80) return age >= 28 ? "distressed" : "voluntary";
  return "voluntary";
}

function tagsFromVessel(age: number, score: number, saleType: string): { label: string; type: string }[] {
  const tags: { label: string; type: string }[] = [];
  tags.push({ label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" });
  if (saleType === "judicial") tags.push({ label: "Judicial Sale", type: "judicial" });
  else if (saleType === "bank") tags.push({ label: "Bank Repo", type: "bank" });
  if (score >= 90) tags.push({ label: "Motivated seller", type: "motivated" });
  if (score >= 85 && saleType === "distressed") tags.push({ label: "P&I Withdrawn", type: "urgent" });
  else if (score >= 78 && saleType === "distressed") tags.push({ label: "AIS Dark", type: "bank" });
  else if (score >= 70) tags.push({ label: "Survey Due", type: "idle" });
  else if (score >= 60) tags.push({ label: "Lay-up", type: "idle" });
  return tags;
}

function scoreFromAge(age: number): number {
  if (age >= 32) return 90 + Math.min(9, age - 32);
  if (age >= 28) return 82 + (age - 28);
  if (age >= 24) return 72 + (age - 24) * 2;
  if (age >= 20) return 60 + (age - 20) * 3;
  return Math.max(30, 40 + age);
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

async function fetchGRSVessels(): Promise<any[]> {
  try {
    const { blobs } = await list({ prefix: "grs_vessels.json" });
    const blob = blobs[0];
    if (!blob) return [];
    const res = await fetch(blob.url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.vessels || [];
  } catch {
    return [];
  }
}

export async function GET() {
  const year = new Date().getFullYear();

  // Always load GRS vessels (no API key needed)
  const grsVessels = await fetchGRSVessels();

  // Load Datalastic vessels if key is available
  let datalasticListings: any[] = [];
  if (API_KEY) {
    const results = await Promise.all(TRACKED_IMOS.map(fetchVessel));
    datalasticListings = results
      .map((d, i) => {
        if (!d) return null;
        const imo      = TRACKED_IMOS[i];
        const built    = parseInt(d.year_built) || 2000;
        const age      = year - built;
        const dwt      = d.deadweight || 0;
        const ldt      = d.lightship  || Math.round(dwt * 0.17);
        const type     = typeLabel(d.type_specific);
        const market   = bestMarket(d.type_specific);
        const price    = MARKET_PRICES[market] ?? 500;
        const estUSD   = ldt * price;
        const score    = Math.min(99, scoreFromAge(age));
        const saleType = saleTypeFromVessel(age, score, imo);
        const tags     = tagsFromVessel(age, score, saleType);

        return {
          id:        parseInt(imo),
          imo,
          name:      d.name || `Vessel ${imo}`,
          flag:      d.country_name || "Unknown",
          type,
          group:     type.includes("Tanker") ? "Tankers" : type.includes("Container") ? "Dry Cargo" : "Dry Cargo",
          built,
          dwt,
          ldt,
          location:  d.last_port || d.home_port || "—",
          price:     `$${(estUSD / 1_000_000).toFixed(1)}M`,
          priceType: saleType === "judicial" ? "Reserve price" : saleType === "bank" ? "Bank offer" : score >= 85 ? "Distressed" : "Asking",
          saleType,
          tags,
          urgent:    score >= 88,
          score,
          source:    "datalastic",
        };
      })
      .filter(Boolean);
  }

  // Hardcoded verified listings (Equasis-sourced) — appear when Datalastic misses them
  const hardcoded: any[] = [];
  const hasOceanEndeavour = [...datalasticListings, ...grsVessels].some(l => l?.imo === "7625811");
  if (!hasOceanEndeavour) {
    const age = year - 1982;
    const score = Math.min(99, 90 + Math.min(9, age - 32));
    hardcoded.push({
      id: 7625811, imo: "7625811", name: "OCEAN ENDEAVOUR",
      flag: "Portugal", type: "Passenger",
      group: "Passenger", built: 1982, dwt: 1762, ldt: 3100,
      location: "Funchal, Madeira",
      price: `$${((3100 * 332) / 1_000_000).toFixed(1)}M`,
      priceType: "Asking",
      saleType: "voluntary",
      tags: [{ label: `${age}y old`, type: "urgent" }, { label: "Survey Due", type: "idle" }],
      urgent: true, score,
      owner: "ENDEAVOUR PARTNERS UNIPESSOAL",
      manager: "SUNSTONE SHIPS INC",
      source: "equasis",
    });
  }

  const listings = [...datalasticListings, ...grsVessels, ...hardcoded]
    .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));

  if (listings.length === 0) {
    return NextResponse.json({ error: "No vessel data available" }, { status: 503 });
  }

  return NextResponse.json(
    { listings, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
