import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/listings/[id] — edit or withdraw own listing
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { rows } = await pool.query(
    `SELECT listing_id, status FROM sp_listings
     WHERE listing_id = $1 AND broker_user_id = $2 AND scraped_at IS NULL`,
    [id, session.id]
  );
  if (!rows.length)               return NextResponse.json({ error: "Not found" },                { status: 404 });
  if (rows[0].status === "withdrawn") return NextResponse.json({ error: "Already withdrawn" }, { status: 409 });

  const { action, price_usd, currency, description, images, broker_phone, broker_company } = body;

  if (action === "withdraw") {
    await pool.query(`UPDATE sp_listings SET status = 'withdrawn' WHERE listing_id = $1`, [id]);
    return NextResponse.json({ ok: true });
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  function add(col: string, val: unknown) { vals.push(val); sets.push(`${col} = $${vals.length}`); }

  if (price_usd   !== undefined) add("price_usd",     price_usd ? Number(price_usd) : null);
  if (currency    !== undefined) add("currency",       currency);
  if (description !== undefined) {
    if (typeof description !== "string" || description.trim().length < 20)
      return NextResponse.json({ error: "Description too short" }, { status: 422 });
    add("description", description.trim());
  }
  if (images      !== undefined) add("images",         JSON.stringify(Array.isArray(images) ? images : []));
  if (broker_phone    !== undefined) add("broker_phone",    broker_phone);
  if (broker_company  !== undefined) add("broker_company",  broker_company);

  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  if (rows[0].status === "approved") {
    sets.push("status = 'pending'", "approved_at = NULL", "approved_by = NULL", "rejection_reason = NULL");
  }

  vals.push(id);
  await pool.query(`UPDATE sp_listings SET ${sets.join(", ")} WHERE listing_id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE /api/listings/[id] — hard-delete pending/rejected listing
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { rowCount } = await pool.query(
    `DELETE FROM sp_listings
     WHERE listing_id = $1 AND broker_user_id = $2
       AND status IN ('pending','rejected') AND scraped_at IS NULL`,
    [id, session.id]
  );

  if (!rowCount) return NextResponse.json({ error: "Not found or not deletable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
