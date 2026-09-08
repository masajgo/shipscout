import { NextResponse } from "next/server";
import { scoreFromAge } from "@/lib/scoring";
import { SCRAP_MARKETS } from "@/lib/scrapMarkets";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (r.includes("bulk"))      return "Bulk Carrier";
  if (r.includes("crude") || r.includes("oil tanker")) return "Oil Tanker";
  if (r.includes("tanker"))    return "Oil Tanker";
  if (r.includes("container")) return "Container Ship";
  if (r.includes("cargo"))     return "General Cargo";
  return raw;
}

function bestMarket(type: string): string {
  if (type?.toLowerCase().includes("tanker"))    return "Alang";
  if (type?.toLowerCase().includes("bulk"))      return "Chittagong";
  if (type?.toLowerCase().includes("container")) return "Alang";
  return "Gadani";
}

function alertFromRow(v: any, year: number) {
  const age    = v.age ?? (v.built_year ? year - v.built_year : 20);
  const dwt    = Number(v.deadweight) || 0;
  const ldt    = v.ldt ? Number(v.ldt) : Math.round(dwt * 0.17);
  const type   = typeLabel(v.type_specific ?? v.type ?? "");
  const market = bestMarket(v.type_specific ?? v.type ?? "");
  const price  = MARKET_PRICES[market] ?? 500;
  const value  = ldt * price;
  const score  = Math.min(99, scoreFromAge(age));
  const name   = v.name || `Vessel ${v.imo}`;
  const flag   = v.flag || "—";
  const imo    = String(v.imo);

  let alertType: string, priority: string, title: string, description: string;

  if (score >= 85) {
    alertType   = "age";
    priority    = "critical";
    title       = `End-of-Life Signal — MV ${name}`;
    description = `${age}-year-old ${type} flagged ${flag}. Survey renewal costs typically exceed market value. Est. scrap value $${(value / 1_000_000).toFixed(2)}M at ${market} (${ldt.toLocaleString()} LDT).`;
  } else if (score >= 70) {
    alertType   = "survey";
    priority    = "high";
    title       = `Survey Due — MV ${name}`;
    description = `${age}-year-old ${type} approaching class renewal. Owner likely evaluating scrapping vs. trading. Est. scrap value $${(value / 1_000_000).toFixed(2)}M.`;
  } else {
    alertType   = "idle";
    priority    = "medium";
    title       = `Age Watch — MV ${name}`;
    description = `${age}-year-old ${type} flagged ${flag}. Scrap score ${score}/100. Est. value $${(value / 1_000_000).toFixed(2)}M at ${market}.`;
  }

  return {
    id:           parseInt(imo),
    type:         alertType,
    priority,
    title,
    vessel:       `MV ${name}`,
    flag,
    imo:          `IMO ${imo}`,
    ldt,
    vesselType:   type,
    age,
    market,
    value,
    description,
    deadline:     null,
    daysLeft:     null,
    location:     v.home_port || "—",
    court:        null,
    reservePrice: null,
    inspection:   null,
    contact:      null,
    time:         "Live",
    read:         false,
    score,
  };
}

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT imo::text, name, flag, type_specific, type, built_year, age,
             deadweight, ldt, home_port, scrap_score
      FROM vessels
      WHERE imo = ANY($1::bigint[])
    `, [TRACKED_IMOS]);

    const year   = new Date().getFullYear();
    const alerts = rows
      .map(v => alertFromRow(v, year))
      .sort((a, b) => b.score - a.score);

    return NextResponse.json(
      { alerts, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (e: unknown) {
    console.error("[alerts]", e);
    return NextResponse.json(
      { alerts: [], updatedAt: new Date().toISOString(), error: "Data unavailable" },
      { status: 200, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  }
}
