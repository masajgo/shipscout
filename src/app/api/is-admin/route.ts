import { NextRequest, NextResponse } from "next/server";

const ALLOWED = (process.env.ADMIN_ALLOWED_IPS ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
           ?? req.headers.get("x-real-ip")
           ?? "";
  const admin = ALLOWED.length === 0 || ALLOWED.includes(ip);
  return NextResponse.json({ admin }, { headers: { "Cache-Control": "no-store" } });
}
