"use strict";
/**
 * testMerge.js — Belirli bir MMSI için merge davranışını test eder.
 * İlk PositionReport ve ilk ShipStaticData sonrası store snapshot'ı basar.
 *
 * Run: node worker/testMerge.js [MMSI]
 * Örnek: node worker/testMerge.js 123456789
 * MMSI verilmezse: ilk gelen her iki mesaj tipini yakalayan gemiyi otomatik seçer.
 */

const { WebSocket } = require("ws");
const path = require("path");
const fs   = require("fs");

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const API_KEY     = process.env.AISSTREAM_API_KEY;
const TARGET_MMSI = process.argv[2] || null;
const TIMEOUT_MS  = 5 * 60 * 1000; // 5 dk — ShipStaticData nadiren gelir

if (!API_KEY) { console.error("AISSTREAM_API_KEY not set"); process.exit(1); }

// ─── In-memory store (aisWorker mantığının aynısı) ────────────────────────────

const store = new Map();

function updateVessel(mmsi, fields) {
  const existing = store.get(mmsi) || {};
  const merged   = { ...existing, ...fields };
  store.set(mmsi, merged);
  return merged;
}

// ─── Snapshot printer ─────────────────────────────────────────────────────────

function snap(label, mmsi, merged) {
  const LINE = "─".repeat(56);
  console.log(`\n${LINE}`);
  console.log(`  ${label}`);
  console.log(`  MMSI: ${mmsi}`);
  console.log(LINE);

  const fields = [
    ["lat",         merged.lat],
    ["lon",         merged.lon],
    ["speed",       merged.speed],
    ["course",      merged.course],
    ["heading",     merged.heading],
    ["navStatus",   merged.navStatus],
    ["ts",          merged.ts],
    ["---",         ""],
    ["name",        merged.name],
    ["imo",         merged.imo],
    ["callSign",    merged.callSign],
    ["vesselType",  merged.vesselType],
    ["length",      merged.length],
    ["beam",        merged.beam],
    ["draught",     merged.draught],
    ["destination", merged.destination],
    ["eta",         merged.eta],
  ];

  for (const [k, v] of fields) {
    if (k === "---") { console.log("  " + "·".repeat(28)); continue; }
    const present = v !== undefined && v !== null && v !== "" && v !== 0;
    const marker  = present ? "✓" : "·";
    const display = present ? String(v) : "(missing)";
    console.log(`  ${marker}  ${k.padEnd(14)} ${display}`);
  }
  console.log(LINE + "\n");
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const seenPos    = new Set(); // MMSIs that got PositionReport
const seenStatic = new Set(); // MMSIs that got ShipStaticData
let done = false;

console.log(`Connecting… ${TARGET_MMSI ? `watching MMSI ${TARGET_MMSI}` : "auto-selecting first vessel with both message types"}`);
console.log(`Timeout: ${TIMEOUT_MS / 1000}s (ShipStaticData arrives ~every 6 min)\n`);

const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

const timer = setTimeout(() => {
  if (!done) {
    console.log("Timeout reached.");
    if (!seenStatic.size) {
      console.log("⚠  No ShipStaticData received in the window.");
      console.log("   Normal — static data is broadcast every ~6 minutes per vessel.");
      console.log("   Re-run with a longer timeout or try during peak traffic hours.");
    }
    ws.terminate();
    process.exit(0);
  }
}, TIMEOUT_MS);

ws.on("open", () => {
  ws.send(JSON.stringify({
    APIKey:             API_KEY,
    BoundingBoxes:      [[[-90, -180], [90, 180]]],
    FilterMessageTypes: ["PositionReport", "ShipStaticData"],
  }));
  console.log("Connected. Waiting for messages…\n");
});

ws.on("message", (raw) => {
  if (done) return;
  try {
    const msg  = JSON.parse(raw.toString());
    const type = msg.MessageType;
    const mmsi = msg.MetaData?.MMSI?.toString();
    if (!mmsi) return;

    // If a specific MMSI was requested, ignore others
    if (TARGET_MMSI && mmsi !== TARGET_MMSI) return;

    if (type === "PositionReport") {
      const pos      = msg.Message.PositionReport;
      const metaName = (msg.MetaData?.ShipName || "").trim();
      const merged   = updateVessel(mmsi, {
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

      if (!seenPos.has(mmsi)) {
        seenPos.add(mmsi);
        snap("After PositionReport", mmsi, merged);
      }
    }

    if (type === "ShipStaticData") {
      const stat = msg.Message.ShipStaticData;
      const dim  = stat.Dimension || {};
      const cur  = store.get(mmsi) || {};
      const merged = updateVessel(mmsi, {
        mmsi,
        name:             (stat.Name        || "").trim() || cur.name        || "",
        callSign:         (stat.CallSign    || "").trim() || cur.callSign    || "",
        imo:              stat.ImoNumber?.toString()      || cur.imo         || "",
        vesselType:       stat.Type                      ?? 0,
        draught:          stat.MaximumStaticDraught       ?? 0,
        destination:      (stat.Destination || "").trim() || cur.destination || "",
        eta:              stat.Eta                        || cur.eta         || "",
        length:           (dim.A || 0) + (dim.B || 0) || cur.length || 0,
        beam:             (dim.C || 0) + (dim.D || 0) || cur.beam   || 0,
        lastStaticUpdate: Date.now(),
      });

      if (!seenStatic.has(mmsi)) {
        seenStatic.add(mmsi);
        snap("After ShipStaticData  (merged on top of position)", mmsi, merged);

        // Verdict
        const hasPos    = merged.lat !== undefined && merged.lon !== undefined;
        const hasStatic = merged.length || merged.draught || merged.imo;
        console.log("  Merge verdict:");
        console.log(`    lat/lon preserved : ${hasPos    ? "✓ YES" : "✗ LOST — BUG"}`);
        console.log(`    static data added : ${hasStatic ? "✓ YES" : "✗ NOT PRESENT"}`);
        console.log("");

        // If we were watching a specific MMSI, exit after first static
        if (TARGET_MMSI) {
          done = true;
          clearTimeout(timer);
          ws.terminate();
          process.exit(0);
        }

        // Auto-mode: exit once we've seen both types for any one vessel
        if (seenPos.has(mmsi)) {
          done = true;
          clearTimeout(timer);
          ws.terminate();
          process.exit(0);
        }
      }
    }
  } catch {}
});

ws.on("error", (err) => { console.error("WS error:", err.message); process.exit(1); });
ws.on("close", () => { if (!done) process.exit(0); });
