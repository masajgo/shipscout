import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization")?.replace("Bearer ", "");
  const param  = req.nextUrl.searchParams.get("key");
  return header === secret || param === secret;
}

// GET /api/admin/listings?status=pending&page=1
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p      = req.nextUrl.searchParams;
  const status = p.get("status") || "pending";
  const page   = Math.max(1, parseInt(p.get("page") ?? "1"));
  const limit  = Math.min(50, Math.max(1, parseInt(p.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const validStatuses = ["pending", "approved", "rejected", "withdrawn", "all"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const whereStatus = status === "all" ? "" : `AND s.status = $1`;
  const params: unknown[] = status === "all" ? [] : [status];

  params.push(limit, offset);
  const li = params.length;

  const { rows } = await pool.query(
    `SELECT
       s.listing_id, s.imo, s.vessel_name, s.listing_type, s.status,
       s.currency, s.price_usd, s.description, s.images,
       s.broker_name, s.broker_email, s.broker_phone, s.broker_company,
       s.submitted_at, s.approved_at, s.approved_by, s.rejection_reason,
       v.name AS db_vessel_name, v.type AS vessel_type,
       v.flag, v.built_year, v.scrap_score, v.scrap_category
     FROM sp_listings s
     LEFT JOIN vessels v ON v.imo::text = s.imo
     WHERE s.scraped_at IS NULL
       ${whereStatus}
     ORDER BY s.submitted_at DESC
     LIMIT $${li - 1} OFFSET $${li}`,
    params
  );

  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM sp_listings WHERE scraped_at IS NULL ${whereStatus}`,
    status === "all" ? [] : [status]
  );

  return NextResponse.json({ listings: rows, total: parseInt(count), page, limit });
}
