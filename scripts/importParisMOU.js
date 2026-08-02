'use strict';
/**
 * importParisMOU.js
 *
 * Downloads Paris MOU monthly Detention List XLS files, parses them with
 * parseParisMOUxls.py (xlrd), and inserts into radar_events.
 *
 * Only officially published files are used; dates on every record are real.
 * Records missing an inspection date are silently skipped.
 *
 * Usage:
 *   node scripts/importParisMOU.js           # all available months
 *   node scripts/importParisMOU.js --dry-run # print only
 */

const path        = require('path');
const fs          = require('fs');
const os          = require('os');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');
const pool    = new Pool({ connectionString: process.env.DATABASE_URL });

const PYTHON = '/usr/bin/python3';
const PARSER = path.resolve(__dirname, 'parseParisMOUxls.py');

// All known available Paris MOU XLS files (Jan–Jun 2024)
const SOURCES = [
  { label: '2024-01', url: 'https://parismou.org/system/files/2024-02/2024-01%20Detention%20Lists%20%28Excel%29_0.XLS' },
  { label: '2024-02', url: 'https://parismou.org/system/files/2024-03/2024-02%20Detention%20Lists%20%28Excel%29.XLS' },
  { label: '2024-03', url: 'https://parismou.org/system/files/2024-04/2024-03%20Detention%20Lists%20%28Excel%29.XLS' },
  { label: '2024-04', url: 'https://parismou.org/system/files/2024-05/2024-04%20Detention%20Lists%20%28Excel%29.XLS' },
  { label: '2024-05', url: 'https://parismou.org/system/files/2024-06/2024-05%20Detention%20Lists%20%28Excel%29.XLS' },
  { label: '2024-06', url: 'https://parismou.org/system/files/2024-07/2024-06%20Detention%20Lists%20%28Excel%29.XLS' },
];

const DEDUP_DAYS = 30; // longer window for bulk import

let totalInserted = 0;
let totalSkipped  = 0;
let totalDup      = 0;

// ---------------------------------------------------------------------------

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ShipScout-Importer/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

function parseXLS(filePath) {
  try {
    const out = execFileSync(PYTHON, [PARSER, filePath], { encoding: 'utf8', timeout: 30_000 });
    return out.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch (err) {
    console.error(`  [ERROR] Python parser failed: ${err.message}`);
    return [];
  }
}

async function isDuplicate(imo, eventDate) {
  const { rows } = await pool.query(
    `SELECT 1 FROM radar_events
     WHERE imo = $1 AND event_type = 'detention'
       AND ABS(event_date - $2::date) <= $3
     LIMIT 1`,
    [imo, eventDate, DEDUP_DAYS]
  );
  return rows.length > 0;
}

async function findVesselMMSI(imo) {
  const { rows } = await pool.query(
    `SELECT mmsi FROM vessels WHERE imo = $1::bigint LIMIT 1`,
    [imo]
  );
  return rows.length > 0 ? rows[0].mmsi : null;
}

async function insertEvent(ev, matchedId) {
  await pool.query(
    `INSERT INTO radar_events
       (imo, vessel_name, event_type, event_date, location,
        source_name, summary, matched_vessel_id)
     VALUES ($1,$2,'detention',$3,$4,'Paris MOU',$5,$6)`,
    [
      ev.imo,
      ev.vessel_name,
      ev.event_date,
      ev.location,
      `Vessel detained at ${ev.location} under Paris MOU Port State Control inspection.${ev.flag ? ` Flag: ${ev.flag}.` : ''}`,
      matchedId || null,
    ]
  );
}

async function processSource(src) {
  console.log(`\n  ${src.label} — downloading ...`);
  const tmpFile = path.join(os.tmpdir(), `paris_mou_${src.label}.xls`);

  try {
    await downloadFile(src.url, tmpFile);
    console.log(`    Downloaded ${(fs.statSync(tmpFile).size / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error(`    [ERROR] Download failed: ${err.message}`);
    return;
  }

  const records = parseXLS(tmpFile);
  console.log(`    Parsed ${records.length} records`);

  let inserted = 0, skipped = 0, dup = 0;

  for (const ev of records) {
    if (!ev.imo || !ev.event_date) { skipped++; continue; }

    let isDup = false;
    try { isDup = await isDuplicate(ev.imo, ev.event_date); } catch {}
    if (isDup) { dup++; continue; }

    let matchedId = null;
    try { matchedId = await findVesselMMSI(ev.imo); } catch {}

    if (DRY_RUN) {
      console.log(`    [DRY] ${ev.vessel_name} (IMO ${ev.imo}) @ ${ev.location} on ${ev.event_date}${matchedId ? ' ✓matched' : ''}`);
      inserted++;
    } else {
      try {
        await insertEvent(ev, matchedId);
        inserted++;
      } catch (err) {
        console.error(`    [ERROR] Insert failed for ${ev.imo}: ${err.message}`);
        skipped++;
      }
    }
  }

  console.log(`    -> inserted=${inserted}  dup=${dup}  skipped=${skipped}`);
  totalInserted += inserted;
  totalSkipped  += skipped;
  totalDup      += dup;

  try { fs.unlinkSync(tmpFile); } catch {}
}

async function main() {
  console.log(`\n=== Paris MOU Detention Import — ${new Date().toISOString()} ===`);
  if (DRY_RUN) console.log('*** DRY-RUN MODE ***');

  for (const src of SOURCES) {
    await processSource(src);
  }

  console.log('\n=== Complete ===');
  console.log(`  Inserted : ${totalInserted}`);
  console.log(`  Duplicate: ${totalDup}`);
  console.log(`  Skipped  : ${totalSkipped}`);
  if (DRY_RUN) console.log('  (DRY-RUN — nothing written)');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  pool.end().finally(() => process.exit(1));
});
