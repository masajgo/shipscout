import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

const BATCH_SIZE  = 10;
const THUMB_WIDTH = 960;
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const CC_LICENSES = ["cc-by", "cc-by-sa", "cc0", "pd", "public domain"];

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

function isCC(license: string) {
  const l = license.toLowerCase();
  return CC_LICENSES.some(cc => l.includes(cc));
}

async function searchCommons(imo: string) {
  const params = new URLSearchParams({
    action: "query", generator: "search",
    gsrsearch: `${imo} ship`, gsrnamespace: "6", gsrlimit: "5",
    prop: "imageinfo", iiprop: "url|extmetadata|mime",
    iiurlwidth: String(THUMB_WIDTH), format: "json", origin: "*",
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": "ShipScout-PhotoBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const data = await res.json();
  return data?.query?.pages ?? {};
}

function pickBestPhoto(pages: Record<string, any>, imo: string, name: string) {
  const candidates: any[] = [];
  for (const page of Object.values(pages) as any[]) {
    const ii = page.imageinfo?.[0];
    if (!ii || (ii.mime && !ii.mime.startsWith("image/"))) continue;
    const meta    = ii.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? meta.License?.value ?? "";
    if (!isCC(license)) continue;
    const artist  = stripHtml(meta.Artist?.value ?? "");
    const title   = page.title ?? "";
    const desc    = stripHtml(meta.ImageDescription?.value ?? "");
    let score = 0;
    if (title.includes(imo) || desc.includes(imo)) score += 10;
    if (name && (title.toUpperCase().includes(name.toUpperCase()) ||
                 desc.toUpperCase().includes(name.toUpperCase()))) score += 5;
    if (score === 0) continue;
    candidates.push({ photo_url: ii.url, photo_thumb: ii.thumburl ?? ii.url,
      artist, license, license_url: meta.LicenseUrl?.value ?? "",
      attribution: artist ? `© ${artist} / ${license}` : license, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = new URL(req.url).searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  // Fetch pending IMOs
  const { rows: pending } = await pool.query<{ imo: string; vessel_name: string | null }>(`
    SELECT DISTINCT re.imo,
           COALESCE(v.name, re.vessel_name) AS vessel_name
    FROM radar_events re
    LEFT JOIN vessels v ON v.imo = re.imo::bigint
    WHERE re.imo IS NOT NULL
      AND re.imo ~ '^[789][0-9]{6}$'
      AND re.imo::bigint NOT IN (SELECT imo FROM vessel_photos WHERE imo IS NOT NULL)
    ORDER BY re.imo
    LIMIT $1
  `, [limit]);

  const results = { found: 0, missing: 0, errors: 0, details: [] as string[] };

  for (const row of pending) {
    const { imo, vessel_name } = row;
    const name = vessel_name ?? "";
    try {
      const pages = await searchCommons(imo);
      const photo  = pickBestPhoto(pages, imo, name);
      if (photo) {
        await pool.query(`
          INSERT INTO vessel_photos
            (imo, photo_url, photo_thumb, artist, license, license_url,
             source, attribution, is_primary, match_confidence)
          VALUES ($1,$2,$3,$4,$5,$6,'Wikimedia Commons',$7,true,'imo_match')
          ON CONFLICT DO NOTHING
        `, [BigInt(imo), photo.photo_url, photo.photo_thumb, photo.artist,
            photo.license, photo.license_url, photo.attribution]);
        results.found++;
        results.details.push(`FOUND ${imo} ${name}`);
      } else {
        results.missing++;
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (e: any) {
      results.errors++;
      results.details.push(`ERROR ${imo}: ${e.message}`);
    }
  }

  return NextResponse.json({ pending_total: pending.length, ...results });
}
