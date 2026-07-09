import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, full_name, company } = body as Record<string, string>;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 422 });
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query<{ id: string; email: string; full_name: string; company: string }>(
      `INSERT INTO broker_accounts (email, password_hash, full_name, company)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, company`,
      [email.toLowerCase().trim(), hash, full_name?.trim() || null, company?.trim() || null]
    );

    const broker = rows[0];
    const token  = await signSession({ id: broker.id, email: broker.email, fullName: broker.full_name, company: broker.company });
    const res    = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookieOptions(token));
    return res;

  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.error("[register] error:", err.code, err.message);
    if (err.code === "23505") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Registration failed — please try again" }, { status: 500 });
  }
}
