import { NextResponse } from "next/server";
import { clearCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearCookieOptions());
  return res;
}
