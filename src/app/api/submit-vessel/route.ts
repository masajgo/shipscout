import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { imo, vessel_name, vessel_type, name, company, title, email, phone,
          preference, delivery_region, availability, notes } = body;

  if (!imo || !email || !name) {
    return NextResponse.json({ error: "IMO, name and email are required" }, { status: 400 });
  }

  // Save to DB
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vessel_submissions (
      id           SERIAL PRIMARY KEY,
      imo          TEXT NOT NULL,
      vessel_name  TEXT,
      vessel_type  TEXT,
      contact_name TEXT NOT NULL,
      company      TEXT,
      title        TEXT,
      email        TEXT NOT NULL,
      phone        TEXT,
      preference   TEXT,
      delivery_region TEXT,
      availability TEXT,
      notes        TEXT,
      status       TEXT DEFAULT 'pending',
      created_at   TIMESTAMPTZ DEFAULT now()
    )
  `);

  const ref = `SS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;

  await pool.query(`
    INSERT INTO vessel_submissions
      (imo, vessel_name, vessel_type, contact_name, company, title, email, phone,
       preference, delivery_region, availability, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [imo, vessel_name, vessel_type, name, company, title, email, phone,
      preference, delivery_region, availability, notes]);

  // Notify via Resend if key available
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ShipScout <onboarding@resend.dev>",
        to: ["info@turqomarine.com"],
        subject: `New vessel submission — ${vessel_name ?? imo} (${ref})`,
        text: [
          `Reference: ${ref}`,
          `IMO: ${imo}  Vessel: ${vessel_name ?? "—"}  Type: ${vessel_type ?? "—"}`,
          `Contact: ${name}  Company: ${company ?? "—"}  Title: ${title ?? "—"}`,
          `Email: ${email}  Phone: ${phone ?? "—"}`,
          `Preference: ${preference ?? "—"}  Delivery: ${delivery_region ?? "—"}  Availability: ${availability ?? "—"}`,
          notes ? `Notes: ${notes}` : "",
        ].filter(Boolean).join("\n"),
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, ref });
}
