import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { priceCategory, estimateCheque, type YardPrices } from "@/lib/scrapValue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const imo = req.nextUrl.searchParams.get("imo")?.trim();
  if (!imo || !/^\d{7}$/.test(imo)) {
    return NextResponse.json({ error: "Enter a valid 7-digit IMO number" }, { status: 400 });
  }

  const [vRes, pRes] = await Promise.all([
    pool.query(`
      SELECT imo::text, name, type, type_specific, flag,
             age, built_year, ldt, deadweight, gross_tonnage,
             scrap_score, scrap_category
      FROM vessels
      WHERE imo = $1::bigint
      LIMIT 1
    `, [imo]),
    pool.query(`SELECT yard, country, vessel_type, price_usd_ldt FROM scrap_prices`),
  ]);

  if (!vRes.rows.length) {
    return NextResponse.json({ error: "Vessel not found in our database. Please contact us directly." }, { status: 404 });
  }

  const v = vRes.rows[0];
  const yards: YardPrices = {};
  for (const p of pRes.rows) {
    yards[p.yard] ??= { country: p.country, prices: {} };
    yards[p.yard].prices[p.vessel_type] = Number(p.price_usd_ldt);
  }

  const category = priceCategory(v.type, v.type_specific);
  const aliagaPrice = yards["Aliaga"]?.prices[category] ?? null;
  const chittagongPrice = yards["Chittagong"]?.prices[category] ?? null;
  const alangPrice = yards["Alang"]?.prices[category] ?? null;

  function cheque(price: number | null) {
    if (!price || !v.ldt) return null;
    return Math.round(v.ldt * price);
  }

  // ±8% range around Aliağa estimate
  const midpoint = cheque(aliagaPrice);
  const rangeLow  = midpoint ? Math.round(midpoint * 0.92) : null;
  const rangeHigh = midpoint ? Math.round(midpoint * 1.08) : null;

  return NextResponse.json({
    imo:            v.imo,
    name:           v.name,
    type:           v.type_specific ?? v.type,
    flag:           v.flag,
    built_year:     v.built_year,
    age:            v.age,
    ldt:            v.ldt,
    deadweight:     v.deadweight,
    gross_tonnage:  v.gross_tonnage,
    scrap_category: v.scrap_category,
    price_category: category,
    estimates: {
      aliaga:     { price: aliagaPrice,     cheque: cheque(aliagaPrice),     country: "Turkey"     },
      chittagong: { price: chittagongPrice, cheque: cheque(chittagongPrice), country: "Bangladesh" },
      alang:      { price: alangPrice,      cheque: cheque(alangPrice),      country: "India"      },
    },
    range: { low: rangeLow, high: rangeHigh },
  });
}
