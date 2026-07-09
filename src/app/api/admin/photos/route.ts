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

// GET /api/admin/photos
// ?confidence=high|medium  &primaryOnly=true  &search=<imo|name>  &page=1  &limit=60
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p           = req.nextUrl.searchParams;
  const confidence  = p.get("confidence") || "";       // "" = all
  const primaryOnly = p.get("primaryOnly") === "true";
  const search      = p.get("search")?.trim() || "";
  const page        = Math.max(1, parseInt(p.get("page") ?? "1"));
  const limit       = Math.min(120, Math.max(1, parseInt(p.get("limit") ?? "60")));
  const offset      = (page - 1) * limit;

  const params: unknown[] = [];
  const where: string[]   = [];

  if (confidence === "high" || confidence === "medium") {
    params.push(confidence);
    where.push(`vp.match_confidence = $${params.length}`);
  }
  if (primaryOnly) {
    where.push(`vp.is_primary = true`);
  }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    where.push(`(v.name ILIKE $${n} OR v.imo::text ILIKE $${n})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM vessel_photos vp
       LEFT JOIN vessels v ON vp.imo = v.imo::text
       ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT
         vp.id, vp.imo, vp.photo_url AS url, vp.photo_thumb AS thumb,
         vp.artist, vp.license, vp.license_url AS "licenseUrl",
         vp.page_url AS "pageUrl", vp.attribution,
         vp.match_confidence AS confidence,
         vp.is_primary AS "isPrimary", vp.source, vp.created_at AS "createdAt",
         v.name AS "vesselName", v.type_specific AS "vesselType",
         v.flag, v.built_year AS "builtYear", v.scrap_score AS "scrapScore"
       FROM vessel_photos vp
       LEFT JOIN vessels v ON vp.imo = v.imo::text
       ${whereClause}
       ORDER BY
         CASE vp.match_confidence WHEN 'medium' THEN 0 ELSE 1 END,
         vp.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      photos: rows,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
