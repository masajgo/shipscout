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

// DELETE /api/admin/photos/[id]?mode=single|wrong_vessel&key=...
//
// mode=single       — delete just this photo; promote next if was primary
// mode=wrong_vessel — delete ALL photos for this vessel; clear vessels.photo_* columns
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const photoId = parseInt(id);
  if (isNaN(photoId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "single";

  try {
    // Fetch the photo record first
    const { rows } = await pool.query(
      `SELECT id, imo, is_primary FROM vessel_photos WHERE id = $1`,
      [photoId],
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const photo = rows[0] as { id: number; imo: string; is_primary: boolean };

    if (mode === "wrong_vessel") {
      // Delete ALL photos for this vessel
      await pool.query(`DELETE FROM vessel_photos WHERE imo = $1`, [photo.imo]);

      // Clear photo columns on vessels — photo was wrong, keep checked_at so scanner skips it
      await pool.query(
        `UPDATE vessels SET
           photo_url = NULL, photo_thumb = NULL, photo_artist = NULL,
           photo_license = NULL, photo_license_url = NULL,
           photo_source = NULL, photo_match_confidence = NULL,
           photo_fetched_at = NULL, licensed_photo = NULL
         WHERE imo = $1::bigint`,
        [photo.imo],
      );

      return NextResponse.json({ deleted: "all", imo: photo.imo });
    }

    // mode === "single": delete just this photo
    await pool.query(`DELETE FROM vessel_photos WHERE id = $1`, [photoId]);

    // If it was primary, promote the next photo for this vessel
    if (photo.is_primary) {
      const { rows: remaining } = await pool.query(
        `SELECT id, photo_url, photo_thumb, artist, license, license_url,
                page_url, attribution, match_confidence, source
         FROM vessel_photos WHERE imo = $1
         ORDER BY id ASC LIMIT 1`,
        [photo.imo],
      );

      if (remaining.length) {
        const next = remaining[0];

        // Promote next photo to primary
        await pool.query(
          `UPDATE vessel_photos SET is_primary = true WHERE id = $1`,
          [next.id],
        );

        // Sync vessels.photo_* columns with new primary
        await pool.query(
          `UPDATE vessels SET
             photo_url              = $2,
             photo_thumb            = $3,
             photo_artist           = $4,
             photo_license          = $5,
             photo_license_url      = $6,
             photo_source           = $7,
             photo_match_confidence = $8,
             photo_fetched_at       = NOW(),
             licensed_photo         = $9::jsonb
           WHERE imo = $1::bigint`,
          [
            photo.imo,
            next.photo_url, next.photo_thumb, next.artist,
            next.license, next.license_url, next.source,
            next.match_confidence,
            JSON.stringify({
              url: next.photo_url, thumb: next.photo_thumb,
              license: next.license, licenseUrl: next.license_url,
              author: next.artist, source: next.source,
              pageUrl: next.page_url, attribution: next.attribution,
              cachedAt: new Date().toISOString(),
            }),
          ],
        );
      } else {
        // No photos left — clear vessels columns
        await pool.query(
          `UPDATE vessels SET
             photo_url = NULL, photo_thumb = NULL, photo_artist = NULL,
             photo_license = NULL, photo_license_url = NULL,
             photo_source = NULL, photo_match_confidence = NULL,
             photo_fetched_at = NULL, licensed_photo = NULL
           WHERE imo = $1::bigint`,
          [photo.imo],
        );
      }
    }

    return NextResponse.json({ deleted: photoId });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
