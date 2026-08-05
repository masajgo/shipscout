import { NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const THUMB_WIDTH = 960;
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const CC_LICENSES = ["cc-by", "cc-by-sa", "cc0", "pd", "public domain"];
const BAD_FILENAME = /signature|sign\b|logo|emblem|stamp|portrait|drawing|painting|coat[_-]of[_-]arms|crest|seal\b|symbol|autograph/i;

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();
}

function isCC(license: string) {
  return CC_LICENSES.some(cc => license.toLowerCase().includes(cc));
}

async function queryCommons(searchStr: string): Promise<Record<string, any>> {
  const params = new URLSearchParams({
    action: "query", generator: "search",
    gsrsearch: searchStr, gsrnamespace: "6", gsrlimit: "8",
    prop: "imageinfo", iiprop: "url|extmetadata|mime|size",
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

function pickBestPhoto(pages: Record<string, any>, imo: string, knownNames: string[], minScore = 5) {
  const candidates: any[] = [];
  const upperImo   = String(imo);
  const upperNames = knownNames.map(n => n.toUpperCase()).filter(Boolean);

  for (const page of Object.values(pages) as any[]) {
    const ii = page.imageinfo?.[0];
    if (!ii || (ii.mime && !ii.mime.startsWith("image/"))) continue;
    if (ii.mime === "image/svg+xml") continue;

    const meta    = ii.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? meta.License?.value ?? "";
    if (!isCC(license)) continue;

    const filename = decodeURIComponent((page.title ?? "").replace(/^File:/i, ""));
    if (BAD_FILENAME.test(filename)) continue;
    if (filename.toLowerCase().endsWith(".svg")) continue;

    const artist = stripHtml(meta.Artist?.value ?? "");
    const desc   = stripHtml(meta.ImageDescription?.value ?? "").toUpperCase();
    const title  = (page.title ?? "").toUpperCase();
    const both   = title + " " + desc;

    let score = 0;
    if (both.includes(upperImo)) score += 10;
    if (upperNames.some(n => both.includes(n))) score += 5;
    if (score < minScore) continue;

    candidates.push({
      photo_url:   ii.url,
      photo_thumb: ii.thumburl ?? ii.url,
      artist, license,
      license_url: meta.LicenseUrl?.value ?? "",
      attribution: artist ? `© ${artist} / ${license}` : license,
      score,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit   = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50", 10));
  // rescan=true: clear sentinels first so previously-missed IMOs are retried
  const rescan  = url.searchParams.get("rescan") === "true";
  // imo=XXXXXXX: scan a single specific IMO (ignores limit)
  const singleImo = url.searchParams.get("imo") ?? null;

  if (rescan) {
    await pool.query(`DELETE FROM vessel_photos WHERE photo_url = 'none'`);
  }

  let pending: { imo: string; vessel_name: string | null }[];

  if (singleImo) {
    const { rows } = await pool.query<{ imo: string; vessel_name: string | null }>(`
      SELECT DISTINCT re.imo, COALESCE(v.name, re.vessel_name) AS vessel_name
      FROM radar_events re
      LEFT JOIN vessels v ON v.imo = re.imo::bigint
      WHERE re.imo = $1
      LIMIT 1
    `, [singleImo]);
    pending = rows;
  } else {
    const { rows } = await pool.query<{ imo: string; vessel_name: string | null }>(`
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
    pending = rows;
  }

  const results = {
    pending_count: pending.length,
    found_imo:     0,
    found_imofmt:  0,
    missing:       0,
    errors:        0,
    details:       [] as string[],
  };

  for (const row of pending) {
    const { imo, vessel_name } = row;
    const name = vessel_name ?? "";
    const knownNames = name ? [name] : [];

    let photo: any   = null;
    let matchType    = "";

    try {
      // Strategy 1: "{imo} ship"
      const pages1 = await queryCommons(`${imo} ship`);
      photo = pickBestPhoto(pages1, imo, knownNames, 5);
      if (photo) { matchType = "imo_match"; results.found_imo++; }
      await sleep(350);

      // Strategy 2: "IMO XXXXXXX" format (how spotters tag uploads)
      if (!photo) {
        const pages2 = await queryCommons(`"IMO ${imo}"`);
        photo = pickBestPhoto(pages2, imo, knownNames, 5);
        if (photo) { matchType = "imo_format"; results.found_imofmt++; }
        await sleep(350);
      }

      if (photo) {
        await pool.query(`
          INSERT INTO vessel_photos
            (imo, photo_url, photo_thumb, artist, license, license_url,
             source, attribution, is_primary, match_confidence)
          VALUES ($1,$2,$3,$4,$5,$6,'Wikimedia Commons',$7,true,$8)
          ON CONFLICT DO NOTHING
        `, [BigInt(imo), photo.photo_url, photo.photo_thumb, photo.artist,
            photo.license, photo.license_url, photo.attribution, matchType]);
        results.details.push(`FOUND/${matchType} ${imo} ${name}`);
      } else {
        // Sentinel so this IMO is skipped on subsequent runs
        await pool.query(`
          INSERT INTO vessel_photos (imo, photo_url, source, match_confidence, is_primary)
          VALUES ($1,'none','Wikimedia Commons','no_match',false)
          ON CONFLICT DO NOTHING
        `, [BigInt(imo)]);
        results.missing++;
      }
    } catch (e: any) {
      results.errors++;
      results.details.push(`ERROR ${imo}: ${e.message}`);
    }
  }

  // Coverage summary
  const { rows: cov } = await pool.query(`
    SELECT
      (SELECT count(DISTINCT re.imo) FROM radar_events re
       WHERE re.imo IS NOT NULL AND re.imo ~ '^[789][0-9]{6}$') AS total,
      (SELECT count(DISTINCT vp.imo) FROM vessel_photos vp
       JOIN radar_events re ON re.imo = vp.imo::text
       WHERE vp.photo_url IS NOT NULL AND vp.photo_url <> 'none') AS covered
  `);
  results.details.push(`Coverage: ${cov[0].covered}/${cov[0].total} radar IMOs have photos`);

  return NextResponse.json(results);
}
