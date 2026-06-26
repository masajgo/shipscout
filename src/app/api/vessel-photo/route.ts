import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { findLicensedPhoto, LicensedPhoto } from "@/lib/shipPhoto";

export const runtime     = "nodejs";
export const maxDuration = 20;

const CACHE_DAYS = 30;

// GET /api/vessel-photo?imo=&name=
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const imo  = searchParams.get("imo")?.trim()  || "";
  const name = searchParams.get("name")?.trim() || "";

  if (!imo) return NextResponse.json({ found: false, error: "imo required" }, { status: 400 });

  // 1. DB cache — scraper flat columns first, then licensed_photo JSONB
  try {
    const { rows } = await pool.query(
      `SELECT photo_url, photo_thumb, photo_artist, photo_license,
              photo_license_url, photo_source, photo_match_confidence,
              photo_fetched_at, licensed_photo
       FROM vessels WHERE imo = $1::bigint LIMIT 1`,
      [imo],
    );
    const row = rows[0];
    if (row?.photo_thumb && row?.photo_fetched_at) {
      const age = Date.now() - new Date(row.photo_fetched_at).getTime();
      if (age < CACHE_DAYS * 86_400_000) {
        return NextResponse.json({
          found:       true,
          url:         row.photo_url,
          thumb:       row.photo_thumb,
          author:      row.photo_artist,
          license:     row.photo_license,
          licenseUrl:  row.photo_license_url,
          source:      row.photo_source,
          confidence:  row.photo_match_confidence,
          attribution: `© ${row.photo_artist ?? "Unknown"} / ${row.photo_license ?? ""}`,
          pageUrl:     (row.licensed_photo as Record<string, string> | null)?.pageUrl ?? null,
        });
      }
    }
    // Fall back to licensed_photo JSONB (set by this route on live search)
    const lp = row?.licensed_photo as (LicensedPhoto & { cachedAt: string }) | null;
    if (lp?.cachedAt) {
      const age = Date.now() - new Date(lp.cachedAt).getTime();
      if (age < CACHE_DAYS * 86_400_000) {
        const { cachedAt: _c, ...photo } = lp;
        return NextResponse.json({ found: true, ...photo });
      }
    }
  } catch { /* proceed to live search */ }

  // 2. Live search via Wikimedia + Flickr
  if (!name) return NextResponse.json({ found: false });

  const photo = await findLicensedPhoto(name, imo);
  if (!photo) return NextResponse.json({ found: false });

  // 3. Cache to DB (best-effort)
  try {
    await pool.query(
      `UPDATE vessels SET
         photo_url             = $2,
         photo_thumb           = $3,
         photo_artist          = $4,
         photo_license         = $5,
         photo_license_url     = $6,
         photo_source          = $7,
         photo_match_confidence= NULL,
         photo_fetched_at      = NOW(),
         licensed_photo        = $8::jsonb
       WHERE imo = $1::bigint`,
      [
        imo,
        photo.url,
        photo.thumb,
        photo.author,
        photo.license,
        photo.licenseUrl,
        photo.source,
        JSON.stringify({ ...photo, cachedAt: new Date().toISOString() }),
      ],
    );
  } catch { /* non-fatal */ }

  return NextResponse.json({ found: true, ...photo });
}
