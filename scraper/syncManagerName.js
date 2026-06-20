"use strict";
/**
 * syncManagerName.js — owners.json → Supabase manager_name sync
 *
 * Reads scraper/data/owners.json and UPDATEs vessels.manager_name
 * for every IMO that has a managerName in the owners file.
 *
 * Usage:
 *   node scraper/syncManagerName.js
 */

const path = require("path");
const fs   = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const OWNERS_FILE = path.join(__dirname, "data", "owners.json");

async function main() {
  if (!fs.existsSync(OWNERS_FILE)) {
    console.log("[sync] owners.json not found — nothing to sync");
    return;
  }

  const owners = JSON.parse(fs.readFileSync(OWNERS_FILE, "utf8"));
  const entries = Object.values(owners).filter(o => o.imo && o.managerName);

  if (!entries.length) {
    console.log("[sync] No entries with managerName found in owners.json");
    return;
  }

  console.log(`[sync] Syncing ${entries.length} manager_name entries to Supabase…`);
  let updated = 0;

  for (const entry of entries) {
    try {
      const res = await pool.query(
        "UPDATE vessels SET manager_name = $1 WHERE imo = $2::bigint AND manager_name IS DISTINCT FROM $1",
        [entry.managerName, entry.imo]
      );
      if (res.rowCount > 0) {
        updated++;
        console.log(`[sync]   ✓ IMO ${entry.imo} → ${entry.managerName}`);
      }
    } catch (e) {
      console.error(`[sync]   ✗ IMO ${entry.imo} — ${e.message}`);
    }
  }

  console.log(`\n[sync] Done — ${updated} rows updated in Supabase`);
  await pool.end();
}

main().catch(e => { console.error("[sync] Fatal:", e.message); process.exit(1); });
