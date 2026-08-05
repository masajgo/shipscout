'use strict';
/**
 * photoScanRadar.js  —  Wikimedia Commons photo scan for radar_events IMOs
 *
 * Search strategy per IMO (in order, stops at first hit):
 *   1. "{imo} ship"            — primary IMO search
 *   2. "IMO {imo}"             — spotter/uploader tagging format
 *   3. "{oldName} ship"        — each historical name from Equasis ShipHistory
 *
 * Equasis layer is optional: activates when EQUASIS_EMAIL + EQUASIS_PASSWORD
 * are set in .env.local. Uses the shared equasis_usage.json counter and
 * spends at most EQUASIS_PHOTO_LIMIT queries per run.
 *
 * Usage:
 *   node scripts/photoScanRadar.js                      # live run
 *   node scripts/photoScanRadar.js --dry-run            # no DB writes
 *   node scripts/photoScanRadar.js --imo 9000687        # single IMO
 *   node scripts/photoScanRadar.js --skip-equasis       # Commons only
 *   caffeinate node scripts/photoScanRadar.js           # prevent sleep
 */

const path    = require('path');
const fs      = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool }     = require('pg');
const { chromium } = require('playwright');
const cheerio      = require('cheerio');
const { parseShipNamesFromHistory, login: equasisLogin } = require('../scraper/equasisOwner');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN       = process.argv.includes('--dry-run');
const SKIP_EQUASIS  = process.argv.includes('--skip-equasis');
const SINGLE_IMO    = (() => { const i = process.argv.indexOf('--imo'); return i > -1 ? process.argv[i + 1] : null; })();

const BATCH_SIZE    = 20;
const BATCH_PAUSE   = 10_000;  // ms between Commons batches
const COMMONS_API   = 'https://commons.wikimedia.org/w/api.php';
const THUMB_WIDTH   = 960;
const CC_LICENSES   = ['cc-by', 'cc-by-sa', 'cc0', 'pd', 'public domain'];

// Equasis: share the daily counter but cap photo-scan usage
const EQUASIS_PHOTO_LIMIT = 200;  // max Equasis queries this script will spend per run
const EQUASIS_DAILY_LIMIT = 800;  // same as equasisOwner.js DAILY_LIMIT
const EQUASIS_USAGE_FILE  = path.resolve(__dirname, '../scraper/data/equasis_usage.json');
const EQUASIS_HOME        = 'https://www.equasis.org/EquasisWeb/public/HomePage?fs=HomePage';
const EQUASIS_HISTORY_URL = 'https://www.equasis.org/EquasisWeb/restricted/ShipHistory?fs=ShipInfo';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Stats ─────────────────────────────────────────────────────────────────────

const stats = {
  found_imo:      0,  // found by IMO search
  found_imo_fmt:  0,  // found by "IMO XXXXXXX" format
  found_old_name: 0,  // found by old name
  missing:        0,
  errors:         0,
  old_name_lookups: 0, // IMOs where we fetched Equasis history
  old_names_found:  0, // IMOs that had at least one old name
  equasis_queries:  0,
  cover_before:   0,
  cover_after:    0,
};

// ── Equasis usage helpers ─────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10); }

function loadEquasisUsage() {
  if (!fs.existsSync(EQUASIS_USAGE_FILE)) return { date: todayStr(), count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(EQUASIS_USAGE_FILE, 'utf8'));
    return u.date !== todayStr() ? { date: todayStr(), count: 0 } : u;
  } catch { return { date: todayStr(), count: 0 }; }
}

function saveEquasisUsage(u) {
  fs.mkdirSync(path.dirname(EQUASIS_USAGE_FILE), { recursive: true });
  fs.writeFileSync(EQUASIS_USAGE_FILE, JSON.stringify(u, null, 2));
}

function equasisQuotaRemaining() {
  const u = loadEquasisUsage();
  const globalRemaining = EQUASIS_DAILY_LIMIT - u.count;
  return Math.min(EQUASIS_PHOTO_LIMIT - stats.equasis_queries, globalRemaining);
}

function consumeEquasisQuery() {
  const u = loadEquasisUsage();
  u.count++;
  saveEquasisUsage(u);
  stats.equasis_queries++;
}

// ── Commons API helpers ───────────────────────────────────────────────────────

async function queryCommons(searchStr) {
  const params = new URLSearchParams({
    action:       'query',
    generator:    'search',
    gsrsearch:    searchStr,
    gsrnamespace: '6',
    gsrlimit:     '8',
    prop:         'imageinfo',
    iiprop:       'url|extmetadata|mime',
    iiurlwidth:   String(THUMB_WIDTH),
    format:       'json',
    origin:       '*',
  });
  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { 'User-Agent': 'ShipScout-PhotoBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)' },
    signal: AbortSignal.timeout(15_000),
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
  return CC_LICENSES.some(cc => licenseKey.toLowerCase().includes(cc));
}

/**
 * Scores and picks the best photo from Commons search results.
 * knownNames: all names for this vessel (current + historical).
 * minScore: minimum score to accept (use higher for old-name searches).
 */
function pickBestPhoto(pages, imo, knownNames, minScore = 5) {
  const candidates = [];
  const upperImo   = String(imo);
  const upperNames = (knownNames || []).map(n => n.toUpperCase()).filter(Boolean);

  for (const page of Object.values(pages)) {
    const ii = page.imageinfo?.[0];
    if (!ii) continue;
    if (ii.mime && !ii.mime.startsWith('image/')) continue;

    const meta    = ii.extmetadata ?? {};
    const license = meta.LicenseShortName?.value ?? meta.License?.value ?? '';
    if (!isAcceptableLicense(license)) continue;

    const artist = stripHtml(meta.Artist?.value ?? '');
    const desc   = stripHtml(meta.ImageDescription?.value ?? '').toUpperCase();
    const title  = (page.title ?? '').toUpperCase();
    const both   = title + ' ' + desc;

    let score = 0;
    if (both.includes(upperImo)) score += 10;
    if (upperNames.some(n => both.includes(n))) score += 5;
    if (score < minScore) continue;

    // Bad filename filter (SVG, logos, signatures — same as cleanup/route.ts)
    const filename = decodeURIComponent(ii.url.split('/').pop() ?? '');
    if (filename.toLowerCase().endsWith('.svg')) continue;
    if (/signature|sign\b|logo|emblem|stamp|portrait|drawing|painting|coat[_-]of[_-]arms|crest|seal\b|symbol|autograph/i.test(filename)) continue;

    candidates.push({
      photo_url:   ii.url,
      photo_thumb: ii.thumburl ?? ii.url,
      artist,
      license,
      license_url: meta.LicenseUrl?.value ?? '',
      page_url:    `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title ?? '')}`,
      attribution: artist ? `© ${artist} / ${license}` : license,
      score,
    });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getPendingIMOs() {
  if (SINGLE_IMO) {
    // Fetch name for the single requested IMO
    const { rows } = await pool.query(`
      SELECT DISTINCT re.imo,
        re.vessel_name,
        v.name AS vessel_db_name
      FROM radar_events re
      LEFT JOIN vessels v ON v.imo = re.imo::bigint
      WHERE re.imo = $1
      LIMIT 1
    `, [SINGLE_IMO]);
    return rows;
  }

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

async function savePhoto(imo, photo, matchType) {
  await pool.query(`
    INSERT INTO vessel_photos
      (imo, photo_url, photo_thumb, artist, license, license_url,
       source, page_url, attribution, is_primary, match_confidence)
    VALUES ($1,$2,$3,$4,$5,$6,'Wikimedia Commons',$7,$8,true,$9)
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
    matchType,   // 'imo_match' | 'imo_format' | 'old_name_match'
  ]);
}

async function countCoverage() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(DISTINCT re.imo)
       FROM radar_events re
       WHERE re.imo IS NOT NULL AND re.imo ~ '^[789][0-9]{6}$') AS total,
      (SELECT count(DISTINCT vp.imo)
       FROM vessel_photos vp
       JOIN radar_events re ON re.imo = vp.imo::text
       WHERE vp.photo_url IS NOT NULL AND vp.photo_url <> 'none') AS covered
  `);
  return rows[0];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Equasis ShipHistory fetch ─────────────────────────────────────────────────

/**
 * Uses Playwright session (already logged in) to POST to ShipHistory
 * and returns array of all known ship names (including current).
 */
async function fetchOldNamesFromEquasis(context, imo) {
  try {
    const res = await context.request.post(EQUASIS_HISTORY_URL, {
      form: { P_IMO: String(imo), event: '', P_COMP: '', P_INSP: '' },
      timeout: 20_000,
    });
    if (!res.ok()) {
      console.log(`    [EQ] ShipHistory HTTP ${res.status()} for IMO ${imo}`);
      return [];
    }
    const html  = await res.text();
    const names = parseShipNamesFromHistory(html);
    consumeEquasisQuery();
    return names;
  } catch (e) {
    console.log(`    [EQ] Error fetching ShipHistory for ${imo}: ${e.message}`);
    return [];
  }
}

// ── Photo search strategies ───────────────────────────────────────────────────

async function tryStrategy(label, searchStr, imo, knownNames, minScore) {
  const pages = await queryCommons(searchStr);
  const photo  = pickBestPhoto(pages, imo, knownNames, minScore);
  return photo;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== ShipScout Radar Photo Scan (+ Old Names) — ${new Date().toISOString()} ===`);
  if (DRY_RUN)      console.log('*** DRY-RUN ***');
  if (SKIP_EQUASIS) console.log('*** SKIP-EQUASIS ***');
  if (SINGLE_IMO)   console.log(`*** SINGLE IMO: ${SINGLE_IMO} ***`);
  console.log();

  // Coverage before
  const coverBefore = await countCoverage();
  stats.cover_before = Number(coverBefore.covered);
  console.log(`Coverage before: ${coverBefore.covered}/${coverBefore.total} IMOs have photos`);

  let pending;
  try {
    pending = await getPendingIMOs();
  } catch (err) {
    console.error('Fatal: could not query radar IMOs:', err.message);
    await pool.end(); process.exit(1);
  }
  console.log(`Pending IMOs (no photo yet): ${pending.length}\n`);

  // Check Equasis availability
  const hasEquasisCreds = !!(process.env.EQUASIS_EMAIL && process.env.EQUASIS_PASSWORD);
  const useEquasis      = !SKIP_EQUASIS && hasEquasisCreds;
  let equasisContext    = null;
  let equasisBrowser    = null;
  let equasisAvailable  = false;

  if (useEquasis) {
    const quota = equasisQuotaRemaining();
    if (quota <= 0) {
      console.log(`[EQ] Daily Equasis quota exhausted — old-name layer disabled`);
    } else {
      console.log(`[EQ] Equasis enabled — up to ${Math.min(quota, EQUASIS_PHOTO_LIMIT)} queries for old names`);
      try {
        equasisBrowser  = await chromium.launch({ headless: true });
        equasisContext  = await equasisBrowser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        });
        const page = await equasisContext.newPage();
        await equasisLogin(page);
        await page.close();
        equasisAvailable = true;
        console.log('[EQ] Logged in ✓\n');
      } catch (e) {
        console.warn(`[EQ] Login failed: ${e.message} — Equasis disabled for this run`);
        if (equasisBrowser) await equasisBrowser.close().catch(() => {});
        equasisContext = null; equasisBrowser = null;
      }
    }
  } else if (!hasEquasisCreds) {
    console.log('[EQ] No Equasis credentials in .env.local — old-name layer disabled\n');
  }

  // ── Process in batches ─────────────────────────────────────────────────────

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch     = pending.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} IMOs)…`);

    for (const row of batch) {
      const { imo, vessel_name, vessel_db_name } = row;
      const displayName = vessel_db_name || vessel_name || '?';
      const knownNames  = [vessel_db_name, vessel_name].filter(Boolean);

      let photo    = null;
      let matchType = null;

      try {
        // ── Strategy 1: "{imo} ship" ───────────────────────────────────────
        photo = await tryStrategy('IMO', `${imo} ship`, imo, knownNames, 5);
        if (photo) { matchType = 'imo_match'; stats.found_imo++; }

        await sleep(400);

        // ── Strategy 2: "IMO XXXXXXX" quoted format ───────────────────────
        if (!photo) {
          photo = await tryStrategy('IMO-fmt', `"IMO ${imo}"`, imo, knownNames, 5);
          if (photo) { matchType = 'imo_format'; stats.found_imo_fmt++; }
          await sleep(400);
        }

        // ── Strategy 3: Equasis old names ─────────────────────────────────
        if (!photo && equasisAvailable && equasisQuotaRemaining() > 0) {
          stats.old_name_lookups++;
          const allNames = await fetchOldNamesFromEquasis(equasisContext, imo);

          if (allNames.length > 0) {
            stats.old_names_found++;
            // Deduplicate: remove names already in knownNames
            const upperKnown = knownNames.map(n => n.toUpperCase());
            const oldNames   = allNames.filter(n => !upperKnown.includes(n.toUpperCase()));

            if (oldNames.length > 0) {
              console.log(`    [EQ] ${imo} old names: ${oldNames.join(', ')}`);
              const allNamesExpanded = [...knownNames, ...allNames];

              for (const oldName of oldNames) {
                if (photo) break;
                // minScore=10: require IMO in metadata to avoid same-name false positives
                // (e.g. searching "GEMINI" could match "NG Gemini" — a different ship)
                photo = await tryStrategy('old-name', `${oldName} ship`, imo, allNamesExpanded, 10);
                if (photo) {
                  matchType = 'old_name_match';
                  stats.found_old_name++;
                  console.log(`    [OLD] ${imo} — found via "${oldName}" (score ${photo.score})`);
                }
                await sleep(400);
              }
            }
          }
          await sleep(300); // brief pause after Equasis call
        }

        // ── Result ────────────────────────────────────────────────────────
        if (photo) {
          if (!DRY_RUN) await savePhoto(imo, photo, matchType);
          console.log(`  [FOUND/${matchType}]  IMO ${imo} — ${displayName} — ${photo.license}`);
        } else {
          console.log(`  [NONE]              IMO ${imo} — ${displayName}`);
          stats.missing++;
        }

      } catch (err) {
        console.error(`  [ERROR]  IMO ${imo}: ${err.message}`);
        stats.errors++;
      }
    }

    if (i + BATCH_SIZE < pending.length) {
      console.log(`  -- Pause ${BATCH_PAUSE / 1000}s between batches --`);
      await sleep(BATCH_PAUSE);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  if (equasisBrowser) await equasisBrowser.close().catch(() => {});

  // ── Report ────────────────────────────────────────────────────────────────

  const coverAfter = await countCoverage();
  stats.cover_after = Number(coverAfter.covered);

  const newlyFound = stats.found_imo + stats.found_imo_fmt + stats.found_old_name;

  console.log('\n=== Complete ===');
  console.log(`\nSearch results:`);
  console.log(`  Found (IMO search)      : ${stats.found_imo}`);
  console.log(`  Found ("IMO XXXXXXX")   : ${stats.found_imo_fmt}`);
  console.log(`  Found (old name)        : ${stats.found_old_name}`);
  console.log(`  Missing                 : ${stats.missing}`);
  console.log(`  Errors                  : ${stats.errors}`);
  if (useEquasis) {
    console.log(`\nEquasis old-name layer:`);
    console.log(`  IMOs queried            : ${stats.old_name_lookups}`);
    console.log(`  IMOs with old names     : ${stats.old_names_found}`);
    console.log(`  Equasis queries used    : ${stats.equasis_queries}`);
    console.log(`  Remaining quota today   : ${equasisQuotaRemaining()}`);
  }
  console.log(`\nCoverage:`);
  console.log(`  Before  : ${stats.cover_before}/${coverBefore.total} (${Math.round(100 * stats.cover_before / Number(coverBefore.total) || 0)}%)`);
  console.log(`  After   : ${stats.cover_after}/${coverAfter.total} (${Math.round(100 * stats.cover_after / Number(coverAfter.total) || 0)}%)`);
  console.log(`  New photos added : ${newlyFound}`);
  if (DRY_RUN) console.log('\n  (DRY-RUN — nothing written)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end().finally(() => process.exit(1));
});
