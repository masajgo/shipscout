#!/usr/bin/env node
/**
 * Rewrites vessels.scrap_score / scrap_category with scraper/scrapScore.js.
 * Run after changing the formula; the AIS worker would otherwise only catch up
 * on vessels it happens to see, leaving the fleet on two different scales.
 *
 *   node scripts/recomputeScrapScores.js          # report only
 *   node scripts/recomputeScrapScores.js --apply  # write
 */

const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { computeScrapScore, scrapCategory } = require("../scraper/scrapScore");

const ENV_PATH = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i < 0 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  // Only the inputs aisWorker.js also has. Detention, survey and dry-dock live in
  // the Radar opportunity score instead, so the worker cannot undo them here.
  const { rows } = await pool.query(`
    SELECT mmsi, built_year, nav_status, speed, flag,
           scrap_score, scrap_category
    FROM vessels
  `);

  const changed = [];
  const before = {}, after = {};

  for (const r of rows) {
    const { score } = computeScrapScore({
      builtYear: r.built_year,
      navStatus: r.nav_status,
      speed:     r.speed,
      flag:      r.flag,
    });
    const cat = scrapCategory(score);
    before[r.scrap_category] = (before[r.scrap_category] || 0) + 1;
    after[cat] = (after[cat] || 0) + 1;
    if (score !== r.scrap_score || cat !== r.scrap_category) {
      changed.push([r.mmsi, score, cat]);
    }
  }

  console.log(`rows      : ${rows.length}`);
  console.log(`before    : ${JSON.stringify(before)}`);
  console.log(`after     : ${JSON.stringify(after)}`);
  console.log(`to update : ${changed.length}`);

  if (!APPLY) {
    console.log("\ndry run — pass --apply to write");
    await pool.end();
    return;
  }

  let done = 0;
  for (let i = 0; i < changed.length; i += BATCH) {
    const slice = changed.slice(i, i + BATCH);
    await pool.query(
      `UPDATE vessels v
         SET scrap_score = u.score, scrap_category = u.cat
       FROM (SELECT * FROM unnest($1::bigint[], $2::smallint[], $3::text[])
             AS t(mmsi, score, cat)) u
       WHERE v.mmsi = u.mmsi`,
      [slice.map(s => s[0]), slice.map(s => s[1]), slice.map(s => s[2])]
    );
    done += slice.length;
    process.stdout.write(`\rupdated ${done}/${changed.length}`);
  }
  console.log("\ndone");
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
