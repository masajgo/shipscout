#!/bin/bash
# runEquasisBatch.sh — Continuously fetch Equasis owner data for all DB vessels
#
# Fetches 20 IMOs per batch (Equasis TOS: 3-5s delay per vessel = ~1.5 min/batch)
# After each batch, syncs manager_name back to Supabase.
#
# Usage: bash scraper/runEquasisBatch.sh [batch_size]
#   default batch_size = 20

BATCH=${1:-20}
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

echo "[batch] Starting Equasis batch runner — batch_size=$BATCH"
echo "[batch] Root: $ROOT"

cd "$ROOT" || exit 1

ITERATION=0
while true; do
  ITERATION=$((ITERATION + 1))

  # Get IMOs from DB that still need fetching
  IMOS=$(node -e "
require('dotenv').config({path:'.env.local'});
const {Pool}=require('pg');
const fs=require('fs');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const owners=fs.existsSync('scraper/data/owners.json')?JSON.parse(fs.readFileSync('scraper/data/owners.json','utf8')):{};
pool.query('SELECT DISTINCT imo FROM vessels WHERE imo IS NOT NULL AND imo != 0 AND manager_name IS NULL ORDER BY RANDOM() LIMIT $1',[parseInt(process.argv[2])])
  .then(r=>{
    const imos=r.rows.map(x=>x.imo).filter(i=>!owners[String(i)]);
    console.log(imos.join(' '));
    pool.end();
  }).catch(e=>{console.error(e.message);pool.end();process.exit(1);});
" - "$BATCH" 2>/dev/null | tail -1)

  if [ -z "$IMOS" ]; then
    echo "[batch] No more IMOs to fetch — all done!"
    break
  fi

  COUNT=$(echo "$IMOS" | wc -w | tr -d ' ')
  echo ""
  echo "[batch] === Iteration $ITERATION — fetching $COUNT IMOs ==="
  echo "[batch] IMOs: $IMOS"

  # Run Equasis scraper
  node scraper/equasisOwner.js $IMOS

  # Sync to DB
  echo "[batch] Syncing to Supabase…"
  node scraper/syncManagerName.js 2>/dev/null | grep -E "Done|✓|✗"

  echo "[batch] Iteration $ITERATION complete. Sleeping 5s before next batch…"
  sleep 5
done

echo "[batch] All Equasis data fetched and synced!"
