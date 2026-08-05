import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const CC_LICENSES = ["cc-by", "cc-by-sa", "cc0", "pd", "public domain"];

function isCC(lic: string) {
  return CC_LICENSES.some(cc => lic.toLowerCase().includes(cc));
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

/** Resolve a Wikimedia Commons file URL or page title to its metadata. */
async function resolveCommonsFile(input: string): Promise<{
  url: string; thumb: string; artist: string; license: string;
  licenseUrl: string; attribution: string; pageUrl: string;
} | null> {
  // Accept full upload.wikimedia.org URLs or "File:Name.jpg" titles
  let title = input;
  if (input.includes("upload.wikimedia.org")) {
    // Extract filename from URL: .../commons/a/ab/Filename.jpg
    const m = input.match(/\/commons\/[a-f0-9]\/[a-f0-9]{2}\/(.+?)(?:\?|$)/);
    if (!m) return null;
    title = `File:${decodeURIComponent(m[1])}`;
  } else if (!input.startsWith("File:") && !input.startsWith("file:")) {
    title = `File:${input}`;
  }

  const params = new URLSearchParams({
    action: "query", titles: title,
    prop: "imageinfo", iiprop: "url|extmetadata|mime",
    iiurlwidth: "960", format: "json", origin: "*",
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": "ShipScout-PhotoBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  const data = await res.json();
  const page  = Object.values(data?.query?.pages ?? {})[0] as any;
  if (!page || page.missing !== undefined) return null;

  const ii     = page.imageinfo?.[0];
  if (!ii) return null;
  if (ii.mime && !ii.mime.startsWith("image/")) throw new Error("Not an image file");

  const meta    = ii.extmetadata ?? {};
  const license = meta.LicenseShortName?.value ?? meta.License?.value ?? "";
  if (!isCC(license)) throw new Error(`License not CC/PD: "${license}"`);

  const artist = stripHtml(meta.Artist?.value ?? "");
  return {
    url:         ii.url,
    thumb:       ii.thumburl ?? ii.url,
    artist,
    license,
    licenseUrl:  meta.LicenseUrl?.value ?? "",
    attribution: artist ? `© ${artist} / ${license}` : license,
    pageUrl:     `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? "")}`,
  };
}

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

// POST /api/admin/photos
// Body: { key, imo, file_url, is_primary? }
// Resolves the Commons file, checks CC license, saves to vessel_photos.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Auth from body too (for CLI scripts that pass key in body)
  if (body.key && body.key !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { imo, file_url, is_primary = true } = body;
  if (!imo)      return NextResponse.json({ error: "imo required" },      { status: 400 });
  if (!file_url) return NextResponse.json({ error: "file_url required" }, { status: 400 });

  // Validate IMO format
  if (!/^[789][0-9]{6}$/.test(String(imo))) {
    return NextResponse.json({ error: "imo must be a 7-digit IMO number starting with 7,8 or 9" }, { status: 400 });
  }

  let fileInfo: Awaited<ReturnType<typeof resolveCommonsFile>>;
  try {
    fileInfo = await resolveCommonsFile(file_url);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (!fileInfo) {
    return NextResponse.json({ error: "File not found on Wikimedia Commons" }, { status: 404 });
  }

  // If setting as primary, demote any existing primary
  if (is_primary) {
    await pool.query(
      `UPDATE vessel_photos SET is_primary = false WHERE imo = $1::bigint AND is_primary = true`,
      [imo]
    );
  }

  // Remove sentinel if present
  await pool.query(`DELETE FROM vessel_photos WHERE imo = $1::bigint AND photo_url = 'none'`, [imo]);

  const { rows } = await pool.query(`
    INSERT INTO vessel_photos
      (imo, photo_url, photo_thumb, artist, license, license_url,
       source, page_url, attribution, is_primary, match_confidence)
    VALUES ($1,$2,$3,$4,$5,$6,'Wikimedia Commons',$7,$8,$9,'manual')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [BigInt(imo), fileInfo.url, fileInfo.thumb, fileInfo.artist, fileInfo.license,
      fileInfo.licenseUrl, fileInfo.pageUrl, fileInfo.attribution, is_primary]);

  if (!rows.length) {
    return NextResponse.json({ skipped: true, reason: "Duplicate URL already in vessel_photos" });
  }

  return NextResponse.json({
    inserted: true,
    id:       rows[0].id,
    imo,
    license:  fileInfo.license,
    artist:   fileInfo.artist,
    url:      fileInfo.url,
    thumb:    fileInfo.thumb,
  });
}
