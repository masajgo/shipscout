import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 9;

// Called by Vercel Cron every minute to keep cache warm
export async function GET(req: NextRequest) {
  // Verify it's a cron call (Vercel sets this header)
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Trigger main endpoint to collect + cache
  try {
    const base = req.nextUrl.origin;
    const res = await fetch(`${base}/api/ais`);
    const data = await res.json();
    return NextResponse.json({
      ok: true,
      vessels: data.vessels?.length ?? 0,
      source: data.source,
    });
  } catch (e: unknown) {
    console.error("[ais/warm]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
