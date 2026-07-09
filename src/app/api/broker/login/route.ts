import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signSession, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, password } = body as Record<string, string>;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 422 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await pool.query<{
    id: string; email: string; full_name: string; company: string;
    password_hash: string; failed_login_count: number; locked_until: string | null;
  }>(
    `SELECT id, email, full_name, company, password_hash, failed_login_count, locked_until
     FROM broker_accounts WHERE email = $1`,
    [normalizedEmail]
  );

  // Constant-time comparison to prevent email enumeration via timing
  const dummy = "$2b$12$invalidhashfortimingreasonssssssssssssssssssssssssssss";
  const hash  = rows[0]?.password_hash ?? dummy;

  // Check lockout before running bcrypt (but after dummy hash selection to keep timing consistent)
  if (rows.length && rows[0].locked_until && new Date(rows[0].locked_until) > new Date()) {
    await bcrypt.compare(password, dummy); // keep timing consistent
    const mins = Math.ceil((new Date(rows[0].locked_until).getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Account locked due to too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const match = await bcrypt.compare(password, hash);

  if (!rows.length || !match) {
    if (rows.length) {
      const newCount = (rows[0].failed_login_count ?? 0) + 1;
      const lockUntil = newCount >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : null;
      await pool.query(
        `UPDATE broker_accounts SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
        [newCount, lockUntil, rows[0].id]
      );
    }
    return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
  }

  // Success — reset lockout counters
  await pool.query(
    `UPDATE broker_accounts SET failed_login_count = 0, locked_until = NULL WHERE id = $1`,
    [rows[0].id]
  );

  const broker = rows[0];
  const token  = await signSession({ id: broker.id, email: broker.email, fullName: broker.full_name, company: broker.company });
  const res    = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieOptions(token));
  return res;
}
