/**
 * aisWorker.js  —  AIS live position tracking worker
 *
 * Sürekli çalışır. Her POLL_INTERVAL_MS'de bir:
 *   1. AISStream.io WebSocket'ten COLLECT_MS boyunca veri toplar (in-memory)
 *   1b. Datalastic built year enrichment (sadece kandidatlar, cache'li)
 *   2. Supabase vessels tablosuna batch UPSERT (500'erli)
 *   3. vessel_tracks'e iz kaydı (son 2dk içinde 100m altında hareket yok ise)
 *
 * Required env:
 *   AISSTREAM_API_KEY  — AISStream.io key
 *   DATABASE_URL       — postgresql://... (Supabase)
 */

"use strict";

const { WebSocket } = require("ws");
const { Pool }      = require("pg");
const path          = require("path");
const fs            = require("fs");
const { enrichCandidates, updateStaticsToDB, computeScrapScore, scrapCategory } =
  require("../scraper/builtYearEnrichment");

// ─── Env ──────────────────────────────────────────────────────────────────────

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const AIS_KEY    = process.env.AISSTREAM_API_KEY;
const DB_URL     = process.env.DATABASE_URL;
const POLL_MS    = parseInt(process.env.POLL_INTERVAL_MS || "45000");
const COLLECT_MS = parseInt(process.env.COLLECT_MS       || "30000");
const BATCH_SIZE = 500;

let BBOXES;
try   { BBOXES = JSON.parse(process.env.AIS_BBOXES || ""); }
catch { BBOXES = [[[-90.0, -180.0], [90.0, 180.0]]]; }

// ─── Supabase pool ────────────────────────────────────────────────────────────

let pgPool = null;

function initPostgres() {
  if (!DB_URL) return;
  const ssl = DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined;
  pgPool = new Pool({
    connectionString:        DB_URL,
    max:                     5,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 10_000,
    ssl,
  });
  pgPool.on("error", e => log(`pg pool error: ${e.message}`));
}

// ─── Logging + helpers ────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, label, { maxAttempts = 7, baseMs = 2000, maxMs = 300_000 } = {}) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (err) {
      if (i >= maxAttempts - 1) throw err;
      const exp   = Math.min(baseMs * (2 ** i), maxMs);
      const delay = exp + Math.random() * exp * 0.15;
      log(`[${label}] attempt ${i + 1} failed: ${err.message} — retry in ${Math.round(delay / 1000)}s`);
      await sleep(delay);
    }
  }
}

// ─── AIS type label ───────────────────────────────────────────────────────────

const AIS_TYPE_MAP = {
  30:"Fishing", 31:"Towing", 32:"Towing (large)",
  33:"Dredging", 34:"Diving ops", 35:"Military",
  36:"Sailing", 37:"Pleasure", 52:"Tug",
  60:"Passenger", 69:"Passenger",
  70:"Cargo",  79:"Cargo",
  80:"Tanker", 89:"Tanker", 90:"Other",
};

function aisTypeLabel(code) {
  if (code == null) return null;
  const n = parseInt(code);
  if (AIS_TYPE_MAP[n])    return AIS_TYPE_MAP[n];
  if (n >= 60 && n <= 69) return "Passenger";
  if (n >= 70 && n <= 79) return "Cargo";
  if (n >= 80 && n <= 89) return "Tanker";
  return n > 0 ? String(n) : null;
}

// ─── In-memory vessel store (module scope — ShipStaticData ~6dk'da bir gelir) ─

const vesselStore = new Map();

function updateVessel(mmsi, fields) {
  const existing = vesselStore.get(mmsi) || {};
  const merged   = { ...existing, ...fields };
  const { score, reasons } = computeScrapScore(merged);
  merged.scrapScore    = score;
  merged.scrapCategory = scrapCategory(score);
  merged.scrapReasons  = reasons;
  vesselStore.set(mmsi, merged);
}

// ─── Step 1: AIS WebSocket collector ─────────────────────────────────────────

function collectPositions(bboxes, apiKey, durationMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch {}
      if (err) reject(err);
      else resolve([...vesselStore.values()].filter(v => v.lat !== undefined && v.lon !== undefined));
    };

    const ws    = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const timer = setTimeout(() => finish(null), durationMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey:             apiKey,
        BoundingBoxes:      bboxes,
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
    });

    ws.on("message", (raw) => {
      try {
        const msg  = JSON.parse(raw.toString());
        const type = msg.MessageType;
        const mmsi = msg.MetaData?.MMSI?.toString();
        if (!mmsi) return;

        if (type === "PositionReport") {
          const pos      = msg.Message.PositionReport;
          const metaName = (msg.MetaData?.ShipName || "").trim();
          updateVessel(mmsi, {
            mmsi,
            ...(metaName && { name: metaName }),
            lat:           pos.Latitude,
            lon:           pos.Longitude,
            speed:         pos.Sog               ?? 0,
            course:        pos.Cog               ?? 0,
            heading:       pos.TrueHeading       ?? 511,
            navStatus:     pos.NavigationalStatus ?? 0,
            ts:            msg.MetaData?.time_utc || new Date().toISOString(),
            lastPosUpdate: Date.now(),
          });
        }

        if (type === "ShipStaticData") {
          const stat = msg.Message.ShipStaticData;
          const dim  = stat.Dimension || {};
          const cur  = vesselStore.get(mmsi) || {};
          updateVessel(mmsi, {
            mmsi,
            name:             (stat.Name        || "").trim() || cur.name        || "",
            callSign:         (stat.CallSign    || "").trim() || cur.callSign    || "",
            imo:              stat.ImoNumber?.toString()      || cur.imo         || "",
            vesselType:       stat.Type                      ?? cur.vesselType  ?? 0,
            draught:          stat.MaximumStaticDraught       ?? 0,
            destination:      (stat.Destination || "").trim() || cur.destination || "",
            eta:              stat.Eta                        || cur.eta         || "",
            length:           (dim.A || 0) + (dim.B || 0) || cur.length || 0,
            beam:             (dim.C || 0) + (dim.D || 0) || cur.beam   || 0,
            lastStaticUpdate: Date.now(),
          });
        }
      } catch {}
    });

    ws.on("error", (err) => finish(err));
    ws.on("close", ()    => finish(null));
  });
}

// ─── Step 2: Batch UPSERT to Supabase ────────────────────────────────────────
//
// vessels tablosu şeması: mmsi,imo,name,type,flag,built_year,age,
//   length,beam,draught,destination,lat,lon,geom,speed,course,
//   nav_status,scrap_score,scrap_category,last_pos_update,last_static_update,updated_at
//
// 20 param per row (lat/lon reused for geom), 500 rows/batch → 10 000 params (pg max 65 535)

const PARAMS_PER_ROW = 20;

const UPSERT_CONFLICT = `
  ON CONFLICT (mmsi) DO UPDATE SET
    imo               = COALESCE(EXCLUDED.imo,                    vessels.imo),
    name              = COALESCE(NULLIF(EXCLUDED.name,''),        vessels.name),
    type              = COALESCE(EXCLUDED.type,                   vessels.type),
    flag              = COALESCE(NULLIF(EXCLUDED.flag,''),        vessels.flag),
    built_year        = COALESCE(EXCLUDED.built_year,             vessels.built_year),
    age               = COALESCE(EXCLUDED.age,                    vessels.age),
    length            = CASE WHEN EXCLUDED.length  > 0 THEN EXCLUDED.length  ELSE vessels.length  END,
    beam              = CASE WHEN EXCLUDED.beam    > 0 THEN EXCLUDED.beam    ELSE vessels.beam    END,
    draught           = CASE WHEN EXCLUDED.draught > 0 THEN EXCLUDED.draught ELSE vessels.draught END,
    destination       = COALESCE(NULLIF(EXCLUDED.destination,''), vessels.destination),
    lat               = EXCLUDED.lat,
    lon               = EXCLUDED.lon,
    geom              = EXCLUDED.geom,
    speed             = EXCLUDED.speed,
    course            = EXCLUDED.course,
    nav_status        = EXCLUDED.nav_status,
    scrap_score       = EXCLUDED.scrap_score,
    scrap_category    = EXCLUDED.scrap_category,
    last_pos_update   = EXCLUDED.last_pos_update,
    last_static_update = COALESCE(EXCLUDED.last_static_update,   vessels.last_static_update),
    updated_at        = NOW()
  WHERE NOW() - vessels.updated_at > INTERVAL '5 seconds' OR vessels.updated_at IS NULL
`;

function buildBatchInsert(batch) {
  const clauses     = [];
  const params      = [];
  let   base        = 1;
  const currentYear = new Date().getFullYear();

  for (const v of batch) {
    const mmsi      = parseInt(v.mmsi);
    const imo       = parseInt(v.imo) || null;
    const builtYear = v.builtYear || null;
    const age       = builtYear ? currentYear - builtYear : null;
    const lastPos   = v.lastPosUpdate    ? new Date(v.lastPosUpdate).toISOString()    : null;
    const lastStat  = v.lastStaticUpdate ? new Date(v.lastStaticUpdate).toISOString() : null;

    // b(i) = absolute param index for i-th param of this row
    const b = (i) => base + i - 1;

    // lat=$b(12), lon=$b(13) — both reused inside ST_MakePoint (no extra params)
    clauses.push(
      `($${b(1)}::bigint,$${b(2)}::bigint,$${b(3)},$${b(4)},$${b(5)},` +
      `$${b(6)}::int4,$${b(7)}::int4,` +
      `$${b(8)}::float4,$${b(9)}::float4,$${b(10)}::float4,$${b(11)},` +
      `$${b(12)}::float8,$${b(13)}::float8,` +
      `ST_SetSRID(ST_MakePoint($${b(13)}::float8,$${b(12)}::float8),4326)::geography,` +
      `$${b(14)}::float4,$${b(15)}::float4,$${b(16)}::int2,$${b(17)}::int4,$${b(18)},` +
      `$${b(19)}::timestamptz,$${b(20)}::timestamptz,NOW())`
    );

    params.push(
      mmsi,                        // 1  mmsi
      imo,                         // 2  imo
      v.name        || null,       // 3  name
      aisTypeLabel(v.vesselType),  // 4  type
      null,                        // 5  flag (not in AIS stream — stays null)
      builtYear,                   // 6  built_year
      age,                         // 7  age
      v.length      || null,       // 8  length
      v.beam        || null,       // 9  beam
      v.draught     || null,       // 10 draught
      v.destination || null,       // 11 destination
      v.lat,                       // 12 lat  (also used in geom)
      v.lon,                       // 13 lon  (also used in geom)
      v.speed       ?? null,       // 14 speed
      v.course      ?? null,       // 15 course
      v.navStatus   ?? null,       // 16 nav_status
      v.scrapScore  ?? null,       // 17 scrap_score
      v.scrapCategory || null,     // 18 scrap_category
      lastPos,                     // 19 last_pos_update
      lastStat,                    // 20 last_static_update
    );

    base += PARAMS_PER_ROW;
  }

  const sql =
    `INSERT INTO vessels (\n` +
    `  mmsi,imo,name,type,flag,built_year,age,\n` +
    `  length,beam,draught,destination,\n` +
    `  lat,lon,geom,\n` +
    `  speed,course,nav_status,scrap_score,scrap_category,\n` +
    `  last_pos_update,last_static_update,updated_at\n` +
    `) VALUES ${clauses.join(",")}` +
    UPSERT_CONFLICT;

  return { sql, params };
}

async function upsertToSupabase(vessels) {
  if (!pgPool || !vessels.length) return;

  const valid = vessels.filter(v => {
    const mmsi = parseInt(v.mmsi);
    return mmsi && v.lon != null && v.lat != null;
  });

  if (!valid.length) return;

  // Batch UPSERT (position + static + enrichment in one shot)
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch           = valid.slice(i, i + BATCH_SIZE);
    const { sql, params } = buildBatchInsert(batch);
    const client          = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql, params);
      await client.query("COMMIT");
      log(`Supabase: batch ${Math.floor(i / BATCH_SIZE) + 1} — ${batch.length} rows upserted`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

let running   = true;
let pollTimer = null;
let consecutiveErrors = 0;

async function poll() {
  const t0 = Date.now();

  // 1. AIS collect
  let vessels;
  try {
    vessels = await withRetry(
      () => collectPositions(BBOXES, AIS_KEY, COLLECT_MS),
      "AIS", { maxAttempts: 5, baseMs: 3000 }
    );
    consecutiveErrors = 0;
    log(`AIS: ${vessels.length} vessels | store: ${vesselStore.size}`);
  } catch (err) {
    consecutiveErrors++;
    log(`AIS failed (${consecutiveErrors}×): ${err.message}`);
    scheduleNext(Math.min(30_000 * consecutiveErrors, 300_000));
    return;
  }

  if (!vessels.length) {
    log("AIS: no vessels — check API key / bbox");
    scheduleNext(POLL_MS);
    return;
  }

  // 1b. Datalastic enrichment (sadece scrap adayları, cache'li)
  try {
    await enrichCandidates(vessels);
    const enriched = vessels.filter(v => v.builtYear).length;
    log(`Enrichment: ${enriched}/${vessels.length} builtYear resolved`);
  } catch (err) {
    log(`Enrichment skipped: ${err.message}`);
  }

  // 2. Supabase batch UPSERT (konum + AIS statik)
  if (pgPool) {
    try {
      await withRetry(() => upsertToSupabase(vessels), "Supabase", { maxAttempts: 4, baseMs: 2000 });
      log(`Supabase: ${vessels.length} vessels upserted in ${Date.now() - t0}ms`);
    } catch (err) {
      log(`Supabase upsert failed after retries: ${err.message}`);
    }

    // 2b. Ship particulars UPDATE (Datalastic statik alanlar: tonaj, LDT, tip, vb)
    try {
      await updateStaticsToDB(pgPool, vessels);
    } catch (err) {
      log(`updateStaticsToDB error: ${err.message}`);
    }
  } else {
    log("Supabase: skipped (DATABASE_URL not set)");
  }

  const elapsed = Date.now() - t0;
  log(`Cycle done in ${elapsed}ms — next in ${Math.round(Math.max(0, POLL_MS - elapsed) / 1000)}s`);
  scheduleNext(Math.max(0, POLL_MS - elapsed));
}

function scheduleNext(ms) {
  if (!running) return;
  pollTimer = setTimeout(poll, ms);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  log(`${signal} — shutting down`);
  running = false;
  if (pollTimer) clearTimeout(pollTimer);
  await pgPool?.end().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  err    => log(`Uncaught: ${err.message}`));
process.on("unhandledRejection", reason => log(`Unhandled: ${reason}`));

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function start() {
  log("═══════════════════════════════════════════");
  log("ShipScout AIS Worker");
  log(`  Poll interval : ${POLL_MS}ms`);
  log(`  Collect window: ${COLLECT_MS}ms`);
  log(`  Batch size    : ${BATCH_SIZE}`);
  log(`  Bounding boxes: ${JSON.stringify(BBOXES)}`);
  log(`  AIS key       : ${AIS_KEY  ? "✓" : "✗ MISSING"}`);
  log(`  Supabase      : ${DB_URL   ? "✓" : "✗ MISSING — set DATABASE_URL"}`);
  log("═══════════════════════════════════════════");

  if (!AIS_KEY) { log("ERROR: AISSTREAM_API_KEY not set"); process.exit(1); }
  if (!DB_URL)  { log("WARNING: DATABASE_URL not set — Supabase writes disabled"); }

  initPostgres();
  poll();
}

start();
