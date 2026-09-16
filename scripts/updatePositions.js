#!/usr/bin/env node
/**
 * updatePositions.js
 * Connects to aisstream.io WebSocket and updates vessel positions in DB.
 * Subscribes by bounding boxes covering global shipping lanes.
 * Run for a fixed duration (default 2h) then exit — launchd restarts daily.
 *
 * Usage: node scripts/updatePositions.js [--duration=7200]
 */

const path = require("path");
const fs   = require("fs");
const { Pool } = require("pg");

// Load .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) return;
    const [k, ...rest] = t.split("=");
    const key = k.trim();
    if (!process.env[key]) process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  });
}

const API_KEY  = process.env.AISSTREAM_API_KEY || "";
const DB_URL   = process.env.DATABASE_URL || "";
const DURATION = parseInt(process.argv.find(a => a.startsWith("--duration="))?.split("=")[1] || "7200");

if (!API_KEY) { console.error("AISSTREAM_API_KEY missing"); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL });

// aisstream.io format: [[minLat, minLon], [maxLat, maxLon]]
const BOXES = [
  [[-80, -180], [80,  -30]],  // Americas + Atlantic
  [[-80,  -30], [80,   60]],  // Europe + Africa
  [[-80,   60], [80,  180]],  // Asia + Pacific
];

let updated = 0;
let connected = false;

// Batch upsert buffer — flush every 5s to avoid per-message DB writes
const buffer = new Map(); // mmsi → {lat, lon, speed, course, nav_status}

async function flushBuffer() {
  if (buffer.size === 0) return;
  const entries = [...buffer.entries()];
  buffer.clear();

  try {
    // Build unnest arrays
    const mmsis   = entries.map(([m]) => parseInt(m, 10));
    const lats    = entries.map(([, v]) => v.lat);
    const lons    = entries.map(([, v]) => v.lon);
    const speeds  = entries.map(([, v]) => v.speed);
    const courses = entries.map(([, v]) => v.course);
    const navs    = entries.map(([, v]) => v.nav_status);

    const result = await pool.query(
      `UPDATE vessels AS v SET
         lat             = d.lat,
         lon             = d.lon,
         geom            = ST_SetSRID(ST_MakePoint(d.lon, d.lat), 4326),
         speed           = d.speed,
         course          = d.course,
         nav_status      = d.nav_status,
         last_pos_update = NOW()
       FROM (
         SELECT UNNEST($1::bigint[])  AS mmsi,
                UNNEST($2::float8[])  AS lat,
                UNNEST($3::float8[])  AS lon,
                UNNEST($4::float4[])  AS speed,
                UNNEST($5::float4[])  AS course,
                UNNEST($6::smallint[]) AS nav_status
       ) AS d
       WHERE v.mmsi = d.mmsi::bigint`,
      [mmsis, lats, lons, speeds, courses, navs]
    );
    updated += result.rowCount ?? 0;
  } catch (e) {
    console.error("Flush error:", e.message);
  }
}

function connect() {
  const ws = new (require("ws"))("wss://stream.aisstream.io/v0/stream");

  ws.on("open", () => {
    connected = true;
    console.log(`[${new Date().toISOString()}] Connected to aisstream.io`);
    ws.send(JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: BOXES,
      FilterMessageTypes: ["PositionReport"],
    }));
  });

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw);
      const meta = msg.MetaData;
      if (!meta?.MMSI) return;

      const pos = msg.Message?.PositionReport;
      if (!pos) return;

      const lat = pos.Latitude;
      const lon = pos.Longitude;
      if (!lat || !lon || (lat === 0 && lon === 0)) return;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      buffer.set(String(meta.MMSI), {
        lat,
        lon,
        speed:      pos.Sog ?? null,
        course:     pos.Cog ?? null,
        nav_status: pos.NavigationalStatus != null ? pos.NavigationalStatus : null,
      });
    } catch {}
  });

  ws.on("error", e => console.error("WS error:", e.message));

  ws.on("close", (code, reason) => {
    connected = false;
    console.log(`[${new Date().toISOString()}] Disconnected (${code}). Reconnecting in 10s...`);
    setTimeout(connect, 10000);
  });

  return ws;
}

async function main() {
  console.log(`[${new Date().toISOString()}] updatePositions starting — will run for ${DURATION}s`);

  // Ensure ws package is available
  try { require("ws"); } catch {
    console.error("ws package not installed. Run: npm install ws");
    process.exit(1);
  }

  const flushInterval = setInterval(flushBuffer, 5000);
  connect();

  // Log progress every 60s
  const logInterval = setInterval(() => {
    console.log(`[${new Date().toISOString()}] Updated ${updated} vessel positions so far | buffer: ${buffer.size}`);
  }, 60000);

  await new Promise(resolve => setTimeout(resolve, DURATION * 1000));

  clearInterval(flushInterval);
  clearInterval(logInterval);
  await flushBuffer();

  console.log(`[${new Date().toISOString()}] Done. Total positions updated: ${updated}`);
  await pool.end();
  process.exit(0);
}

main();
