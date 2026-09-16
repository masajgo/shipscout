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

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(`
    SELECT
      agent_name,
      last_started_at,
      last_finished_at,
      last_status,
      last_rows,
      last_error,
      run_count,
      updated_at
    FROM agent_status
    ORDER BY updated_at DESC
  `);

  return NextResponse.json({ agents: rows });
}
