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

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/listings/[id]
// Body: { action: "approve" | "reject", rejection_reason?: string }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, rejection_reason } = body;

  if (action === "approve") {
    const { rowCount } = await pool.query(
      `UPDATE sp_listings
       SET status = 'approved', approved_at = now(), approved_by = 'admin',
           rejection_reason = NULL
       WHERE listing_id = $1 AND scraped_at IS NULL`,
      [id]
    );
    if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    if (!rejection_reason || typeof rejection_reason !== "string" || !rejection_reason.trim()) {
      return NextResponse.json({ error: "rejection_reason required" }, { status: 422 });
    }
    const { rowCount } = await pool.query(
      `UPDATE sp_listings
       SET status = 'rejected', rejection_reason = $2, approved_at = NULL, approved_by = NULL
       WHERE listing_id = $1 AND scraped_at IS NULL`,
      [id, rejection_reason.trim()]
    );
    if (!rowCount) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
}
