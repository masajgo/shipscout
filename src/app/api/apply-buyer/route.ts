import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { company, country, contact_name, email, phone,
          buyer_type, vessel_types, dwt_min, dwt_max,
          annual_volume, certifications, notes } = body;

  if (!company || !email || !contact_name) {
    return NextResponse.json({ error: "Company, contact name and email are required" }, { status: 400 });
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buyer_applications (
      id            SERIAL PRIMARY KEY,
      company       TEXT NOT NULL,
      country       TEXT,
      contact_name  TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT,
      buyer_type    TEXT,
      vessel_types  TEXT,
      dwt_min       INTEGER,
      dwt_max       INTEGER,
      annual_volume TEXT,
      certifications TEXT,
      notes         TEXT,
      status        TEXT DEFAULT 'pending',
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `);

  await pool.query(`
    INSERT INTO buyer_applications
      (company, country, contact_name, email, phone, buyer_type,
       vessel_types, dwt_min, dwt_max, annual_volume, certifications, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
  `, [company, country, contact_name, email, phone, buyer_type,
      vessel_types, dwt_min || null, dwt_max || null, annual_volume, certifications, notes]);

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "ShipScout <hello@shipscout.io>",
        to: ["hello@shipscout.io"],
        subject: `New buyer application — ${company} (${buyer_type ?? "—"})`,
        text: [
          `Company: ${company}  Country: ${country ?? "—"}`,
          `Contact: ${contact_name}  Email: ${email}  Phone: ${phone ?? "—"}`,
          `Buyer type: ${buyer_type ?? "—"}`,
          `Vessel types: ${vessel_types ?? "—"}`,
          `DWT range: ${dwt_min ?? "—"} – ${dwt_max ?? "—"}`,
          `Annual volume: ${annual_volume ?? "—"}`,
          certifications ? `Certifications: ${certifications}` : "",
          notes ? `Notes: ${notes}` : "",
        ].filter(Boolean).join("\n"),
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
