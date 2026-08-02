import { NextResponse } from "next/server";
import { list }         from "@vercel/blob";
import { scoreFromAge } from "@/lib/scoring";
import { SCRAP_MARKETS } from "@/lib/scrapMarkets";
import pool              from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.DATALASTIC_API_KEY;
const BASE    = "https://api.datalastic.com/api/v0";

const TRACKED_IMOS = [
  "9038828", "9038749", "9248904", "9065572", "9074705", "9200811",
  "9038880", "8912522", "9108128", "9015101", "9083940", "9040089",
  "7625811",
];

const MARKET_PRICES: Record<string, number> = Object.fromEntries(
  SCRAP_MARKETS.map(m => [m.market, m.price])
);

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

function tagsFromVessel(age: number, score: number): { label: string; type: string }[] {
  const tags: { label: string; type: string }[] = [
    { label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" },
  ];
  if (score >= 85) tags.push({ label: "Survey Due", type: "idle" });
  return tags;
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
  } catch { return null; }
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
  } catch { return []; }
}

// Fetch enriched detail data from sp_listings table (GRS scrape)
async function fetchSPListings(): Promise<Record<string, any>> {
  try {
    const { rows } = await pool.query(`
      SELECT grs_id, built, length_m, beam_m, draft_m, dwt, engine_kw, speed,
             pax, cars, decks, class_code, flag, gross_tonnage, shipyard,
             description, specs_text, images, price_eur
      FROM   sp_listings
      WHERE  scraped_at IS NOT NULL
    `);
    const map: Record<string, any> = {};
    for (const r of rows) map[r.grs_id] = r;
    return map;
  } catch { return {}; }
}

// Fetch user-submitted, admin-approved listings
async function fetchUserListings(): Promise<any[]> {
  try {
    const { rows } = await pool.query(`
      SELECT
        s.listing_id, s.imo, s.vessel_name, s.listing_type,
        s.price_usd, s.currency, s.description, s.images,
        s.broker_name, s.broker_email, s.broker_phone, s.broker_company,
        s.approved_at,
        v.type, v.flag, v.built_year, v.length, v.beam, v.draught,
        v.scrap_score, v.scrap_category
      FROM sp_listings s
      LEFT JOIN vessels v ON v.imo::text = s.imo
      WHERE s.scraped_at IS NULL AND s.status = 'approved'
      ORDER BY s.approved_at DESC
    `);
    return rows;
  } catch { return []; }
}

export async function GET() {
  const year = new Date().getFullYear();

  let grsVessels: any[] = [];
  let spDetails: Record<string, any> = {};
  let userListings: any[] = [];
  try {
    [grsVessels, spDetails, userListings] = await Promise.all([
      fetchGRSVessels(),
      fetchSPListings(),
      fetchUserListings(),
    ]);
  } catch (e: unknown) {
    console.error("[snp] data fetch failed", e);
    // continue with empty — hardcoded listings still render
  }

  // Merge GRS vessel data with sp_listings details
  const grsListings = grsVessels.map((v: any) => {
    const d     = spDetails[v.grsId] || {};
    const built = d.built || v.built || (year - 25);
    const age   = year - built;
    const score = Math.min(99, scoreFromAge(age));
    const tags: any[] = [
      { label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" },
      { label: "Voluntary Sale", type: "new" },
    ];
    if (d.pax)  tags.push({ label: `${d.pax} pax`, type: "idle" });
    if (d.cars) tags.push({ label: `${d.cars} cars`, type: "idle" });
    if (score >= 85) tags.push({ label: "High priority", type: "urgent" });

    const priceEUR = d.price_eur || v.priceEUR || null;
    const priceUSD = priceEUR ? priceEUR * 1.08 : null;

    return {
      ...v,
      built,
      age,
      score,
      tags,
      // Enrich with detail data
      length:       d.length_m      || v.length      || null,
      beam:         d.beam_m        || null,
      draft:        d.draft_m       || null,
      dwt:          d.dwt           || v.dwt          || 0,
      speed:        d.speed         || v.speed        || null,
      pax:          d.pax           || v.pax          || null,
      cars:         d.cars          || null,
      decks:        d.decks         || null,
      classCode:    d.class_code    || v.classCode    || null,
      engineKw:     d.engine_kw     || null,
      flag:         d.flag          || v.flag         || "Unknown",
      grossTonnage: d.gross_tonnage || null,
      shipyard:     d.shipyard      || null,
      description:  d.description   || null,
      specsText:    d.specs_text    || null,
      images:       d.images        || [],
      price:        priceUSD
        ? `$${(priceUSD / 1_000_000).toFixed(1)}M`
        : priceEUR
          ? `€${(priceEUR / 1_000_000).toFixed(1)}M`
          : v.price || "POA",
      priceType: "Asking",
    };
  });

  // Datalastic listings
  let datalasticListings: any[] = [];
  if (API_KEY) {
    let results: any[] = [];
    try {
      results = await Promise.all(TRACKED_IMOS.map(fetchVessel));
    } catch (e: unknown) {
      console.error("[snp] datalastic fetch failed", e);
    }
    datalasticListings = results
      .map((d, i) => {
        if (!d) return null;
        const imo    = TRACKED_IMOS[i];
        const built  = parseInt(d.year_built) || 2000;
        const age    = year - built;
        const dwt    = d.deadweight || 0;
        const ldt    = d.lightship  || Math.round(dwt * 0.17);
        const type   = typeLabel(d.type_specific);
        const market = bestMarket(d.type_specific);
        const price  = MARKET_PRICES[market] ?? 500;
        const estUSD = ldt * price;
        const score  = Math.min(99, scoreFromAge(age));
        return {
          id: parseInt(imo), imo, name: d.name || `Vessel ${imo}`,
          flag: d.country_name || "Unknown", type,
          group: type.includes("Tanker") ? "Tankers" : "Dry Cargo",
          built, dwt, ldt, age, score,
          length: d.length || null, beam: d.breadth || null,
          speed: d.speed_avg || null,
          location: d.last_port || d.home_port || "—",
          price: `$${(estUSD / 1_000_000).toFixed(1)}M`,
          priceType: "Est. scrap value",
          saleType: age >= 28 ? "distressed" : "voluntary",
          tags: tagsFromVessel(age, score),
          urgent: score >= 88, source: "datalastic",
          images: [], description: null,
        };
      })
      .filter(Boolean);
  }

    // Featured vessels — query live from vessels + owners tables (zero Datalastic credits)
  const FEATURED_IMOS = ["7625811", "5073234"];
  const alreadyShown  = new Set([...datalasticListings, ...grsListings].map((l: any) => l?.imo));
  const featuredIMOs  = FEATURED_IMOS.filter(imo => !alreadyShown.has(imo));

  const hardcoded: any[] = [];
  if (featuredIMOs.length > 0) {
    try {
      const { rows } = await pool.query(`
        SELECT
          v.imo::text, v.name, v.flag, v.type,
          v.built_year, v.age, v.deadweight AS dwt, v.ldt,
          v.length, v.scrap_score, v.scrap_category,
          v.scrap_value_usd, v.ldt_estimated, v.scrap_value_estimated,
          v.lat, v.lon, v.destination,
          o.owner_name, o.manager_name, o.address
        FROM vessels v
        LEFT JOIN owners o ON o.imo = v.imo
        WHERE v.imo = ANY($1::bigint[])
      `, [featuredIMOs.map(Number)]);

      for (const r of rows) {
        const built  = r.built_year ? parseInt(r.built_year) : null;
        const age    = built ? year - built : (r.age ? parseInt(r.age) : null);
        const dwt    = r.dwt  ? parseInt(r.dwt)  : null;
        const ldt    = r.ldt  ? parseInt(r.ldt)  : null;
        const score  = r.scrap_score ? parseInt(r.scrap_score) : (age ? Math.min(99, scoreFromAge(age)) : 50);
        const market = bestMarket(r.type || "");
        const mPrice = MARKET_PRICES[market] ?? 450;

        // Price: prefer DB scrap_value_usd, else compute from LDT × market, else POA
        let price = "POA";
        let priceType = "Est. scrap value";
        if (r.scrap_value_usd && parseFloat(r.scrap_value_usd) > 0) {
          price = `$${(parseFloat(r.scrap_value_usd) / 1_000_000).toFixed(1)}M`;
          if (r.scrap_value_estimated) priceType = "~Est. scrap value";
        } else if (ldt && ldt > 0) {
          price = `$${((ldt * mPrice) / 1_000_000).toFixed(1)}M`;
        }

        const tags: { label: string; type: string }[] = [];
        if (age != null) tags.push({ label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" });
        if (score >= 85) tags.push({ label: "Survey Due", type: "idle" });

        hardcoded.push({
          id:       parseInt(r.imo),
          imo:      r.imo,
          name:     r.name || `IMO ${r.imo}`,
          flag:     r.flag || "Unknown",
          type:     r.type || "General Cargo",
          group:    (r.type || "").toLowerCase().includes("tanker") ? "Tankers" : "Dry Cargo",
          built:    built ?? year,
          dwt:      dwt ?? 0,
          ldt:      ldt ?? 0,
          age:      age ?? 0,
          score,
          length:   r.length ? parseFloat(r.length) : null,
          beam:     null,
          draft:    null,
          location: r.destination || (r.lat && r.lon ? `${parseFloat(r.lat).toFixed(2)}°N ${parseFloat(r.lon).toFixed(2)}°E` : "—"),
          price,
          priceType,
          saleType: (age ?? 0) >= 28 ? "distressed" : "voluntary",
          tags,
          urgent:   score >= 88,
          source:   "equasis",
          owner:    r.owner_name   || null,
          manager:  r.manager_name || null,
          scrap_category: r.scrap_category || "low",
          images:   [],
          description: null,
        });
      }
    } catch (e) {
      console.error("[snp] featured vessel DB lookup failed", e);
    }
  }

  // Map user-submitted approved listings to the same card shape
  const mappedUserListings = userListings.map((u: any) => {
    const builtYear = u.built_year || null;
    const age   = builtYear ? year - builtYear : null;
    const score = age != null ? Math.min(99, scoreFromAge(age)) : 50;
    const priceUSD = u.price_usd || null;

    return {
      id:          u.listing_id,
      imo:         u.imo,
      name:        u.vessel_name || `IMO ${u.imo}`,
      flag:        u.flag        || "Unknown",
      type:        u.type        || "General Cargo",
      group:       "User Listed",
      built:       builtYear     || year,
      dwt:         0,
      ldt:         0,
      age:         age ?? 0,
      score,
      length:      u.length      || null,
      beam:        u.beam        || null,
      draft:       u.draught     || null,
      location:    "—",
      price:       priceUSD
        ? `${u.currency === "USD" ? "$" : u.currency + " "}${(priceUSD / 1_000_000).toFixed(2)}M`
        : "POA",
      priceType:   "Asking",
      saleType:    u.listing_type === "scrap" ? "distressed" : "voluntary",
      tags: [
        ...(age != null ? [{ label: `${age}y old`, type: age >= 30 ? "urgent" : "idle" }] : []),
        { label: u.listing_type === "sale" ? "For Sale" : u.listing_type === "charter" ? "Charter" : "For Scrap", type: "new" },
      ],
      urgent:      score >= 88,
      source:      "user",
      images:      Array.isArray(u.images) ? u.images : [],
      description: u.description || null,
      brokerName:  u.broker_name    || null,
      brokerEmail: u.broker_email   || null,
      brokerPhone: u.broker_phone   || null,
      brokerCompany: u.broker_company || null,
      scrap_category: u.scrap_category || null,
    };
  });

  const listings = [...datalasticListings, ...grsListings, ...mappedUserListings, ...hardcoded]
    .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));

  if (listings.length === 0) {
    return NextResponse.json({ error: "No vessel data available" }, { status: 503 });
  }

  return NextResponse.json(
    { listings, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
