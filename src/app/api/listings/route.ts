import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/listings — authenticated broker's own listings
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT listing_id, imo, vessel_name, listing_type, status, currency,
            price_usd, broker_name, broker_email, broker_phone, broker_company,
            description, images, submitted_at, approved_at, rejection_reason
     FROM   sp_listings
     WHERE  broker_user_id = $1
       AND  scraped_at IS NULL
     ORDER  BY submitted_at DESC`,
    [session.id]
  );

  return NextResponse.json({ listings: rows });
}

// POST /api/listings — create a new listing
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    imo, vessel_name, listing_type, price_usd, currency,
    description, images, broker_name, broker_email, broker_phone, broker_company,
  } = body as Record<string, unknown>;

  if (!imo || typeof imo !== "string" || !/^\d{7}$/.test(imo)) {
    return NextResponse.json({ error: "Valid 7-digit IMO required" }, { status: 422 });
  }
  if (!["sale", "charter", "scrap"].includes(listing_type as string)) {
    return NextResponse.json({ error: "listing_type must be sale, charter, or scrap" }, { status: 422 });
  }
  if (!description || typeof description !== "string" || description.trim().length < 20) {
    return NextResponse.json({ error: "Description must be at least 20 characters" }, { status: 422 });
  }
  if (!broker_email || typeof broker_email !== "string") {
    return NextResponse.json({ error: "Broker email required" }, { status: 422 });
  }

  // One active listing per IMO per broker
  const { rows: existing } = await pool.query(
    `SELECT 1 FROM sp_listings
     WHERE imo = $1 AND broker_user_id = $2
       AND status IN ('pending','approved') AND scraped_at IS NULL LIMIT 1`,
    [imo, session.id]
  );
  if (existing.length) {
    return NextResponse.json({ error: "You already have an active listing for this vessel" }, { status: 409 });
  }

  const { rows } = await pool.query(
    `INSERT INTO sp_listings
       (imo, vessel_name, listing_type, status, price_usd, currency,
        description, images, broker_user_id,
        broker_name, broker_email, broker_phone, broker_company, submitted_at)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
     RETURNING listing_id, status, submitted_at`,
    [
      imo, vessel_name || null, listing_type,
      price_usd    ? Number(price_usd) : null,
      currency     || "USD",
      description.trim(),
      JSON.stringify(Array.isArray(images) ? images : []),
      session.id,
      broker_name    || session.fullName || null,
      broker_email,
      broker_phone   || null,
      broker_company || session.company  || null,
    ]
  );

  return NextResponse.json({ listing: rows[0] }, { status: 201 });
}
