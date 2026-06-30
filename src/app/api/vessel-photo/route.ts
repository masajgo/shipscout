import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

// GET /api/vessel-photo?imo=
// Returns { photos: [...] } from vessel_photos table.
// Falls back to vessels.photo_* for backward compat when vessel_photos is empty.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const imo = searchParams.get("imo")?.trim() || "";

  if (!imo) return NextResponse.json({ photos: [], error: "imo required" }, { status: 400 });

  try {
    // 1. vessel_photos table (multi-photo)
    const { rows } = await pool.query(
      `SELECT photo_url AS url, photo_thumb AS thumb, artist, license,
              license_url AS "licenseUrl", page_url AS "pageUrl",
              attribution, is_primary AS "isPrimary", match_confidence AS confidence
       FROM vessel_photos
       WHERE imo = $1
       ORDER BY is_primary DESC, id ASC`,
      [imo],
    );

    if (rows.length > 0) {
      return NextResponse.json({ photos: rows });
    }

    // 2. Fallback: vessels.photo_* columns (scraped but not yet migrated)
    const { rows: vrows } = await pool.query(
      `SELECT photo_url, photo_thumb, photo_artist, photo_license,
              photo_license_url, licensed_photo, photo_fetched_at
       FROM vessels WHERE imo = $1::bigint LIMIT 1`,
      [imo],
    );

    const v = vrows[0];
    if (v?.photo_thumb && v?.photo_fetched_at) {
      const pageUrl = (v.licensed_photo as Record<string, string> | null)?.pageUrl ?? null;
      return NextResponse.json({
        photos: [{
          url:         v.photo_url,
          thumb:       v.photo_thumb,
          artist:      v.photo_artist ?? "Unknown",
          license:     v.photo_license ?? "",
          licenseUrl:  v.photo_license_url ?? null,
          pageUrl,
          attribution: `© ${v.photo_artist ?? "Unknown"} / ${v.photo_license ?? ""}`,
          isPrimary:   true,
          confidence:  null,
        }],
      });
    }

    return NextResponse.json({ photos: [] });
  } catch (e: unknown) {
    return NextResponse.json({ photos: [], error: (e as Error).message }, { status: 500 });
  }
}
