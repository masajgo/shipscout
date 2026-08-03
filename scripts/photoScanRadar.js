'use strict';
/**
 * photoScanRadar.js
 *
 * Wikimedia Commons photo scan — ONLY for IMOs present in radar_events.
 * Much smaller scope than the full fleet scan (~300 unique IMOs vs 15k+ vessels).
 *
 * Source: Wikimedia Commons API (CC-licensed photos only)
 * Target: vessel_photos table
 *
 * Usage:
 *   node scripts/photoScanRadar.js          # live run
 *   node scripts/photoScanRadar.js --dry-run
 *   caffeinate node scripts/photoScanRadar.js  # prevent sleep on macOS
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const DRY_RUN    = process.argv.includes('--dry-run');
const pool       = new Pool({ connectionString: process.env.DATABASE_URL });

const BATCH_SIZE   = 20;
const BATCH_PAUSE  = 10_000; // 10 s between batches (rate-limit friendly)
const COMMONS_API  = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH  = 960;

// Only accept Creative Commons licenses
const CC_LICENSES  = ['cc-by', 'cc-by-sa', 'cc0', 'pd', 'public domain'];

let found = 0, missing = 0, skipped = 0, errors = 0;

// ---------------------------------------------------------------------------
// Commons API helpers
// ---------------------------------------------------------------------------

async function searchCommons(imo) {
  const params = new URLSearchParams({
    action:     'query',
    generator:  'search',
    gsrsearch:  `${imo} ship`,
    gsrnamespace: '6',        // File namespace
    gsrlimit:   '5',
    prop:       'imageinfo',
    iiprop:     'url|extmetadata|mime',
    iiurlwidth: String(THUMB_WIDTH),
    format:     'json',
    origin:     '*',
  });

  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { 'User-Agent': 'ShipScout-PhotoBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)' },
    signal:  AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
  const data = await res.json();
  return data?.query?.pages ?? {};
}

function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

function isAcceptableLicense(licenseKey) {
  if (!licenseKey) return false;
  const lk = licenseKey.toLowerCase();
  return CC_LICENSES.some(cc => lk.includes(cc));
}

function imoInText(imo, text) {
  if (!text) return false;
  return text.includes(imo);
}

/**
 * Picks the best matching photo from Commons search results.
 * Returns null if none qualify.
 */
function pickBestPhoto(pages, imo, vesselName) {
  const candidates = [];

  for (const page of Object.values(pages)) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;

    // Only images (not video/audio)
    if (ii.mime && !ii.mime.startsWith('image/')) continue;

    const meta    = ii.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? meta.License?.value ?? '';
    const artist  = stripHtml(meta.Artist?.value ?? '');
    const desc    = stripHtml(meta.ImageDescription?.value ?? '');
    const title   = page.title ?? '';

    if (!isAcceptableLicense(license)) continue;

    // Relevance score
    let score = 0;
    if (imoInText(imo, title) || imoInText(imo, desc)) score += 10;
    if (vesselName && (title.toUpperCase().includes(vesselName.toUpperCase())
                    || desc.toUpperCase().includes(vesselName.toUpperCase()))) score += 5;

    // Reject if score is 0 (no IMO or vessel name match — wrong ship)
    if (score === 0) continue;

    candidates.push({
      photo_url:    ii.url,
      photo_thumb:  ii.thumburl ?? ii.url,
      artist,
      license,
      license_url:  meta.LicenseUrl?.value ?? '',
      page_url:     `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      attribution:  artist ? `© ${artist} / ${license}` : license,
      score,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Returns all distinct IMOs in radar_events not yet in vessel_photos. */
async function getPendingIMOs() {
  const { rows } = await pool.query(`
    SELECT DISTINCT
      re.imo,
      re.vessel_name,
      v.name AS vessel_db_name
    FROM radar_events re
    LEFT JOIN vessels v ON v.imo = re.imo::bigint
    WHERE re.imo IS NOT NULL
      AND re.imo ~ '^[789][0-9]{6}$'
      AND re.imo::bigint NOT IN (
        SELECT imo FROM vessel_photos WHERE imo IS NOT NULL
      )
    ORDER BY re.imo
  `);
  return rows;
}

async function savePhoto(imo, photo) {
  await pool.query(`
    INSERT INTO vessel_photos
      (imo, photo_url, photo_thumb, artist, license, license_url,
       source, page_url, attribution, is_primary, match_confidence)
    VALUES ($1,$2,$3,$4,$5,$6,'Wikimedia Commons',$7,$8,true,'imo_match')
    ON CONFLICT DO NOTHING
  `, [
    BigInt(imo),
    photo.photo_url,
    photo.photo_thumb,
    photo.artist,
    photo.license,
    photo.license_url,
    photo.page_url,
    photo.attribution,
  ]);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n=== ShipScout Radar Photo Scan — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log('*** DRY-RUN ***\n');

  let pending;
  try {
    pending = await getPendingIMOs();
  } catch (err) {
    console.error('Fatal: could not query radar IMOs:', err.message);
    await pool.end();
    process.exit(1);
  }

  console.log(`Pending IMOs (not yet in vessel_photos): ${pending.length}\n`);

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} IMOs)...`);

    for (const row of batch) {
      const { imo, vessel_name, vessel_db_name } = row;
      const displayName = vessel_db_name || vessel_name || '?';

      try {
        const pages = await searchCommons(imo);
        const photo  = pickBestPhoto(pages, imo, displayName);

        if (photo) {
          if (!DRY_RUN) await savePhoto(imo, photo);
          console.log(`  [FOUND]  IMO ${imo} — ${displayName} — ${photo.license}`);
          found++;
        } else {
          console.log(`  [NONE]   IMO ${imo} — ${displayName}`);
          missing++;
        }
      } catch (err) {
        console.error(`  [ERROR]  IMO ${imo}: ${err.message}`);
        errors++;
      }

      // Small per-request delay (respectful of Commons rate limits)
      await sleep(500);
    }

    // Pause between batches
    if (i + BATCH_SIZE < pending.length) {
      console.log(`  -- Pause ${BATCH_PAUSE / 1000}s between batches --`);
      await sleep(BATCH_PAUSE);
    }
  }

  console.log('\n=== Complete ===');
  console.log(`  Found   : ${found}`);
  console.log(`  Missing : ${missing}`);
  console.log(`  Errors  : ${errors}`);
  console.log(`  Skipped : ${skipped}`);
  if (DRY_RUN) console.log('  (DRY-RUN — nothing written)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end().finally(() => process.exit(1));
});
