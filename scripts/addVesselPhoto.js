'use strict';
/**
 * addVesselPhoto.js — Manually add a Wikimedia Commons photo to a vessel
 *
 * Usage:
 *   node scripts/addVesselPhoto.js --imo 9000687 --url "https://upload.wikimedia.org/..."
 *   node scripts/addVesselPhoto.js --imo 9000687 --file "Ocean Dream at Civitavecchia.jpg"
 *   node scripts/addVesselPhoto.js --imo 9000687 --url "..." --not-primary
 *
 * The script:
 *   1. Calls Commons API to verify the file exists and is CC/PD licensed
 *   2. Fetches attribution metadata
 *   3. POSTs to /api/admin/photos (production endpoint)
 *   4. Reports the result
 *
 * Requires ADMIN_SECRET and NEXT_PUBLIC_SITE_URL (or SITE_URL) in .env.local
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://shipscout.io';
const COMMONS_API  = 'https://commons.wikimedia.org/w/api.php';
const CC_LICENSES  = ['cc-by', 'cc-by-sa', 'cc0', 'pd', 'public domain'];

if (!ADMIN_SECRET) {
  console.error('[ERR] ADMIN_SECRET not set in .env.local');
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key  = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

function isCC(lic) {
  return !!lic && CC_LICENSES.some(c => lic.toLowerCase().includes(c));
}
function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

async function resolveFile(input) {
  let title = input;
  if (input.includes('upload.wikimedia.org')) {
    const m = input.match(/\/commons\/[a-f0-9]\/[a-f0-9]{2}\/(.+?)(?:\?|$)/);
    if (!m) { console.error('[ERR] Could not extract filename from URL'); process.exit(1); }
    title = `File:${decodeURIComponent(m[1])}`;
  } else if (!input.startsWith('File:') && !input.startsWith('file:')) {
    title = `File:${input}`;
  }

  console.log(`[INFO] Resolving: ${title}`);

  const params = new URLSearchParams({
    action: 'query', titles: title,
    prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: '960', format: 'json', origin: '*',
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { 'User-Agent': 'ShipScout-PhotoBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { console.error(`[ERR] Commons API ${res.status}`); process.exit(1); }
  const data = await res.json();
  const page  = Object.values(data?.query?.pages ?? {})[0];

  if (!page || page.missing !== undefined) {
    console.error('[ERR] File not found on Wikimedia Commons');
    process.exit(1);
  }

  const ii     = page.imageinfo?.[0];
  if (!ii) { console.error('[ERR] No image info returned'); process.exit(1); }
  if (ii.mime && !ii.mime.startsWith('image/')) {
    console.error(`[ERR] Not an image file (mime: ${ii.mime})`); process.exit(1);
  }

  const meta    = ii.extmetadata ?? {};
  const license = meta.LicenseShortName?.value ?? meta.License?.value ?? '';

  console.log(`[INFO] File  : ${page.title}`);
  console.log(`[INFO] MIME  : ${ii.mime}`);
  console.log(`[INFO] Size  : ${ii.width}×${ii.height}`);
  console.log(`[INFO] License: ${license}`);

  if (!isCC(license)) {
    console.error(`[ERR] License "${license}" is not CC/PD — cannot use this photo`);
    process.exit(1);
  }

  const artist      = stripHtml(meta.Artist?.value ?? '');
  const attribution = artist ? `© ${artist} / ${license}` : license;
  console.log(`[INFO] Artist: ${artist || '(none)'}`);
  console.log(`[INFO] Attribution: ${attribution}`);

  return {
    url:   ii.url,
    thumb: ii.thumburl ?? ii.url,
    title: page.title,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const imo        = args.imo   ? String(args.imo)            : null;
  const fileInput  = args.url   || args.file                  || null;
  const isPrimary  = !args['not-primary'];

  if (!imo)       { console.error('[ERR] --imo required');       process.exit(1); }
  if (!fileInput) { console.error('[ERR] --url or --file required'); process.exit(1); }
  if (!/^[789][0-9]{6}$/.test(imo)) {
    console.error('[ERR] IMO must be a 7-digit number starting with 7, 8, or 9');
    process.exit(1);
  }

  console.log(`\n[addVesselPhoto] IMO=${imo}  primary=${isPrimary}`);
  console.log(`[addVesselPhoto] Endpoint: ${SITE_URL}/api/admin/photos\n`);

  const fileInfo = await resolveFile(fileInput);
  console.log(`\n[INFO] URL confirmed: ${fileInfo.url.slice(0, 80)}…`);

  // POST to production endpoint
  console.log('\n[INFO] Saving to vessel_photos via admin API…');
  const postRes = await fetch(`${SITE_URL}/api/admin/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_SECRET}`,
    },
    body: JSON.stringify({ key: ADMIN_SECRET, imo, file_url: fileInfo.url, is_primary: isPrimary }),
    signal: AbortSignal.timeout(30_000),
  });

  const json = await postRes.json();

  if (!postRes.ok) {
    console.error(`[ERR] API ${postRes.status}:`, json);
    process.exit(1);
  }

  if (json.skipped) {
    console.log(`\n[SKIP] ${json.reason}`);
  } else {
    console.log(`\n[OK] Inserted vessel_photos.id=${json.id}`);
    console.log(`     IMO ${json.imo} · ${json.license} · ${json.artist || '(no artist)'}`);
    console.log(`     URL: ${json.url?.slice(0, 80)}…`);
  }
}

main().catch(err => { console.error('[FATAL]', err.message); process.exit(1); });
