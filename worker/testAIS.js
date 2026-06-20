/**
 * testAIS.js — 30 saniye bağlanır, gelen mesaj tiplerini sayar, çıkar.
 * Run: node worker/testAIS.js
 */
"use strict";

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

const API_KEY  = process.env.AISSTREAM_API_KEY;
const DURATION = 30_000;

if (!API_KEY) {
  console.error("AISSTREAM_API_KEY not set in .env.local");
  process.exit(1);
}

const counts  = {};   // { MessageType: count }
const samples = {};   // { MessageType: first raw msg }
let total = 0;

console.log(`Connecting to AISStream for ${DURATION / 1000}s…\n`);

const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

const timer = setTimeout(() => {
  ws.terminate();
  printReport();
  process.exit(0);
}, DURATION);

ws.on("open", () => {
  console.log("Connected. Subscribing…\n");
  ws.send(JSON.stringify({
    APIKey:             API_KEY,
    BoundingBoxes:      [[[-90, -180], [90, 180]]],
    FilterMessageTypes: ["PositionReport", "ShipStaticData"],
  }));
});

ws.on("message", (raw) => {
  total++;
  let type = "(parse error)";
  try {
    const msg = JSON.parse(raw.toString());
    type = msg.MessageType ?? "(no MessageType)";
    if (!samples[type]) {
      samples[type] = msg;
    }
  } catch {}

  counts[type] = (counts[type] ?? 0) + 1;

  // Live counter every 50 messages
  if (total % 50 === 0) {
    const parts = Object.entries(counts).map(([t, n]) => `${t}:${n}`).join("  ");
    process.stdout.write(`\r[${total} msgs]  ${parts}  `);
  }
});

ws.on("error", (err) => {
  clearTimeout(timer);
  console.error("\nWebSocket error:", err.message);
  printReport();
  process.exit(1);
});

ws.on("close", () => {
  clearTimeout(timer);
  printReport();
  process.exit(0);
});

function printReport() {
  console.log("\n\n═══════════════════════════════════════");
  console.log("  AISStream message type report");
  console.log("═══════════════════════════════════════");
  console.log(`  Total messages received: ${total}`);
  console.log("");

  if (!total) {
    console.log("  ✗ No messages received — check API key and network.");
    return;
  }

  for (const [type, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(count / total * 30));
    console.log(`  ${type.padEnd(20)} ${String(count).padStart(5)}  (${pct.padStart(5)}%)  ${bar}`);
  }

  console.log("\n  Sample field keys per type:");
  for (const [type, msg] of Object.entries(samples)) {
    const msgKeys = msg.Message?.[type] ? Object.keys(msg.Message[type]).join(", ") : "—";
    const meta    = msg.MetaData ? Object.keys(msg.MetaData).join(", ") : "—";
    console.log(`\n  ${type}`);
    console.log(`    Message.${type}: ${msgKeys}`);
    console.log(`    MetaData      : ${meta}`);
  }

  console.log("\n  FilterMessageTypes set to: [\"PositionReport\", \"ShipStaticData\"]");

  if (!counts["ShipStaticData"]) {
    console.log("\n  ⚠  ShipStaticData: 0 mesaj");
    console.log("     Olası nedenler:");
    console.log("     1. AIS spec: static data 6 dakikada bir yayınlanır.");
    console.log("        30 saniyede 0 gelmesi NORMAL olabilir — 5-10 dk bekle.");
    console.log("     2. FilterMessageTypes sunucu tarafında ignore edilebilir —");
    console.log("        filtreyi kaldır ve tüm mesajları logla.");
    console.log("     3. API key'in ShipStaticData erişimine izni olmayabilir.");
  } else {
    console.log(`\n  ✓ ShipStaticData geliyor (${counts["ShipStaticData"]} mesaj)`);
  }
}
