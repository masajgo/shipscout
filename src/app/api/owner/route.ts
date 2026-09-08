import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const imo = req.nextUrl.searchParams.get("imo");
  if (!imo) return NextResponse.json({ error: "IMO required" }, { status: 400 });

  try {
    const { rows } = await pool.query(`
      SELECT o.owner_name, o.manager_name, o.ism_manager,
             o.best_email, o.phone, o.address, o.country, o.website,
             o.emails, o.phones
      FROM owners o
      WHERE o.imo = $1::bigint
      LIMIT 1
    `, [imo]);

    if (!rows.length) return NextResponse.json({ data: null });
    const o = rows[0];

    return NextResponse.json({
      data: [{
        owner_name:    o.owner_name,
        manager_name:  o.manager_name,
        owner_email:   o.best_email,
        owner_phone:   o.phone,
        owner_address: o.address,
        owner_country: o.country,
        manager_email: null,
      }]
    });
  } catch (err) {
    console.error("[owner]", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
