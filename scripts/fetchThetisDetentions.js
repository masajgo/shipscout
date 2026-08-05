'use strict';

/**
 * fetchThetisDetentions.js
 *
 * Fetches current Paris MOU detentions from EMSA THETIS public API and
 * inserts them into radar_events. Designed for both initial backfill and
 * daily delta runs (new detentions only).
 *
 * Usage:
 *   node scripts/fetchThetisDetentions.js           # insert new detentions
 *   node scripts/fetchThetisDetentions.js --dry-run # print only, no DB writes
 *
 * API: https://portal.emsa.europa.eu/o/portlet-public/rest/detention/getCurrentDetentions.json
 * Public endpoint (no auth required) embedded in Paris MOU current-detentions page.
 * Robots.txt: no restrictions on /o/portlet-public/ path.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const THETIS_URL =
  'https://portal.emsa.europa.eu/o/portlet-public/rest/detention/getCurrentDetentions.json';

const REFERER =
  'https://portal.emsa.europa.eu/widget/web/thetis/current-detentions/-/publicSiteDetention_WAR_portletpublic';

const SOURCE_NAME = 'Paris MOU (THETIS)';
const DEDUP_DAYS  = 7;

// DD/MM/YYYY → YYYY-MM-DD
function parseDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function fetchDetentions() {
  const res = await fetch(THETIS_URL, {
    headers: {
      'User-Agent': 'ShipScout-RadarBot/1.0 (shipscout.io; mailto:ardavcioglu@gmail.com)',
      'Referer': REFERER,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`THETIS HTTP ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function isDuplicate(imo, eventDate) {
  // IMO + detention within ±DEDUP_DAYS of event_date — prevents re-importing
  // the same detention on every daily run
  if (!imo) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM radar_events
     WHERE imo = $1 AND event_type = 'detention'
       AND (
         event_date BETWEEN ($2::date - interval '${DEDUP_DAYS} days')
                        AND ($2::date + interval '${DEDUP_DAYS} days')
         OR (event_date IS NULL AND created_at > now() - interval '${DEDUP_DAYS} days')
       )
     LIMIT 1`,
    [imo, eventDate || new Date().toISOString().slice(0, 10)]
  );
  return rows.length > 0;
}

async function findMatchedVesselId(imo, vesselName) {
  if (!imo && !vesselName) return null;
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels
     WHERE ($1::bigint IS NOT NULL AND imo = $1::bigint)
        OR ($2::text   IS NOT NULL AND UPPER(name) = UPPER($2::text))
     LIMIT 1`,
    [imo || null, vesselName || null]
  );
  return rows.length > 0 ? rows[0].mmsi : null;
}

async function insertEvent(ev) {
  await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id, raw_headline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      ev.imo              || null,
      ev.vessel_name      || null,
      'detention',
      ev.event_date       || null,
      ev.location         || null,
      SOURCE_NAME,
      ev.summary,
      ev.matched_vessel_id || null,
      ev.raw_headline,
    ]
  );
}

async function main() {
  console.log(`[THETIS] Fetching current detentions${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const detentions = await fetchDetentions();
  console.log(`[THETIS] ${detentions.length} total current detentions received`);

  let inserted = 0, skipped = 0, errors = 0;
  const newImos = [];

  // Process in batches of 20
  for (let i = 0; i < detentions.length; i += 20) {
    const batch = detentions.slice(i, i + 20);

    for (const d of batch) {
      const imo       = d.imoNumber || null;
      const name      = d.shipName  || null;
      const eventDate = parseDate(d.detentionDate);
      const port      = d.detentionPort?.name || null;
      const country   = d.detentionReportingAuthority?.description || null;
      const flag      = d.flag?.description || null;
      const shipType  = d.shipType?.description || null;
      const location  = [port, country].filter(Boolean).join(', ') || null;

      const summary = [
        `${name || 'Vessel'} (IMO ${imo || '?'}) detained by Port State Control`,
        location ? `at ${location}` : null,
        eventDate ? `on ${eventDate}` : null,
        flag ? `Flag: ${flag}.` : null,
        shipType ? `Type: ${shipType}.` : null,
      ].filter(Boolean).join(' ') + '.';

      const rawHeadline = `Paris MOU detention — ${name} (IMO ${imo}) — ${location || '?'} — ${d.detentionDate || '?'}`;

      try {
        const dup = await isDuplicate(imo, eventDate);
        if (dup) {
          skipped++;
          continue;
        }

        const matchedVesselId = await findMatchedVesselId(imo, name);

        if (!DRY_RUN) {
          await insertEvent({ imo, vessel_name: name, event_date: eventDate,
            location, summary, matched_vessel_id: matchedVesselId,
            raw_headline: rawHeadline });
        }

        console.log(`  [${DRY_RUN ? 'DRY' : 'INS'}] ${name} (${imo}) — ${eventDate} — ${location}`);
        inserted++;
        if (imo) newImos.push(imo);
      } catch (e) {
        errors++;
        console.error(`  [ERR] ${name} (${imo}): ${e.message}`);
      }
    }

    // Disk IO friendly pause between batches
    if (i + 20 < detentions.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n[THETIS] Done: inserted=${inserted}, skipped=${skipped}, errors=${errors}`);
  console.log(`[THETIS] New IMOs: ${[...new Set(newImos)].join(', ') || 'none'}`);

  return { inserted, skipped, errors, newImos: [...new Set(newImos)] };
}

main()
  .then(({ inserted, skipped, errors, newImos }) => {
    console.log('\n=== SUMMARY ===');
    console.log(`Detentions inserted : ${inserted}`);
    console.log(`Duplicates skipped  : ${skipped}`);
    console.log(`Errors              : ${errors}`);
    console.log(`New IMOs for photos : ${newImos.length}`);
    pool.end();
  })
  .catch(err => {
    console.error('[FATAL]', err);
    pool.end().finally(() => process.exit(1));
  });
