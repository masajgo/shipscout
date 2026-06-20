"use strict";
/**
 * testEnrichment.js
 * 30s AIS topla → enrichCandidates çalıştır → top-5 + kategori dağılımı bas.
 *
 * Run: node worker/testEnrichment.js
 */

const { WebSocket } = require("ws");
const path = require("path");
const fs   = require("fs");
const { enrichCandidates, computeScrapScore, scrapCategory } =
  require("../scraper/builtYearEnrichment");

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const API_KEY    = process.env.AISSTREAM_API_KEY;
const COLLECT_MS = 30_000;

if (!API_KEY) { console.error("AISSTREAM_API_KEY not set"); process.exit(1); }

// ─── Minimal vessel store (same merge logic as aisWorker) ─────────────────────

const store = new Map();

function updateVessel(mmsi, fields) {
  const existing = store.get(mmsi) || {};
  store.set(mmsi, { ...existing, ...fields });
}

// ─── Step 1: collect ──────────────────────────────────────────────────────────

function collect() {
  return new Promise((resolve) => {
    const ws    = new WebSocket("wss://stream.aisstream.io/v0/stream");
    let settled = false;
    const finish = () => { if (!settled) { settled = true; try { ws.terminate(); } catch {} resolve(); } };
    setTimeout(finish, COLLECT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey:             API_KEY,
        BoundingBoxes:      [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }));
      console.log(`Collecting AIS data for ${COLLECT_MS / 1000}s…`);
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
            lat:       pos.Latitude,
            lon:       pos.Longitude,
            speed:     pos.Sog               ?? 0,
            course:    pos.Cog               ?? 0,
            navStatus: pos.NavigationalStatus ?? 0,
            ts:        msg.MetaData?.time_utc || new Date().toISOString(),
          });
        }

        if (type === "ShipStaticData") {
          const stat = msg.Message.ShipStaticData;
          const dim  = stat.Dimension || {};
          const cur  = store.get(mmsi) || {};
          updateVessel(mmsi, {
            mmsi,
            name:        (stat.Name        || "").trim() || cur.name || "",
            imo:         stat.ImoNumber?.toString()      || cur.imo  || "",
            vesselType:  stat.Type                      ?? 0,
            draught:     stat.MaximumStaticDraught       ?? 0,
            destination: (stat.Destination || "").trim() || cur.destination || "",
            length:      (dim.A || 0) + (dim.B || 0) || cur.length || 0,
            beam:        (dim.C || 0) + (dim.D || 0) || cur.beam   || 0,
          });
        }
      } catch {}
    });

    ws.on("error", (err) => { console.error("WS error:", err.message); finish(); });
    ws.on("close", finish);
  });
}

// ─── Step 2: enrich + report ──────────────────────────────────────────────────

async function report(vessels) {
  const RISK_FLAGS = new Set(["KM","TG","PW","KH","BZ","SL","MN","TZ","VU","CK"]);

  // Pre-enrichment: kandidatları belirle ve AIS-only score ata
  const candidates = vessels.filter(v => {
    const ns    = parseInt(v.navStatus) || 0;
    const speed = parseFloat(v.speed)   || 0;
    return ns === 1 || ns === 5 || speed === 0 || (v.flag && RISK_FLAGS.has(v.flag));
  });

  console.log(`\nTotal vessels collected : ${vessels.length}`);
  console.log(`Scrap candidates (AIS)  : ${candidates.length}`);
  console.log(`  (anchored / moored / idle / risk flag)`);

  if (!candidates.length) {
    console.log("\nNo candidates found in this window — try again or broaden criteria.");
    return;
  }

  // Datalastic enrichment
  const withIMO = candidates.filter(v => v.imo).length;
  console.log(`\nIMO available           : ${withIMO} / ${candidates.length}`);
  if (!process.env.DATALASTIC_API_KEY) {
    console.log("DATALASTIC_API_KEY      : not set — builtYear will be null for all\n");
  } else {
    console.log(`DATALASTIC_API_KEY      : set — enriching up to ${withIMO} vessels\n`);
  }

  console.log("Running enrichCandidates…");
  const t0 = Date.now();
  await enrichCandidates(candidates);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  // Sort by score desc
  candidates.sort((a, b) => (b.scrapScore ?? 0) - (a.scrapScore ?? 0));

  // Top 5
  const LINE = "─".repeat(72);
  console.log(LINE);
  console.log("  TOP 5 SCRAP CANDIDATES");
  console.log(LINE);
  console.log(
    "  " +
    "MMSI".padEnd(12) +
    "Name".padEnd(22) +
    "IMO".padEnd(10) +
    "Built".padEnd(7) +
    "Score".padEnd(7) +
    "Category"
  );
  console.log(LINE);

  for (const v of candidates.slice(0, 5)) {
    const name     = (v.name || "—").slice(0, 20).padEnd(22);
    const imo      = (v.imo  || "—").padEnd(10);
    const built    = v.builtYear ? String(v.builtYear).padEnd(7) : "—".padEnd(7);
    const score    = String(v.scrapScore ?? 0).padEnd(7);
    const cat      = v.scrapCategory ?? scrapCategory(v.scrapScore ?? 0);
    const catColor = cat === "critical" ? "\x1b[31m" : cat === "high" ? "\x1b[33m" : cat === "medium" ? "\x1b[36m" : "\x1b[90m";
    console.log(`  ${v.mmsi.padEnd(12)}${name}${imo}${built}${score}${catColor}${cat}\x1b[0m`);
    if (v.scrapReasons?.length) {
      console.log(`  ${" ".repeat(12)}reasons: ${v.scrapReasons.join(", ")}`);
    }
  }

  // Category distribution (all candidates)
  console.log(LINE);
  const dist = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const v of candidates) {
    const cat = v.scrapCategory ?? scrapCategory(v.scrapScore ?? 0);
    dist[cat] = (dist[cat] || 0) + 1;
  }
  console.log("\n  Category distribution across all candidates:");
  for (const [cat, n] of Object.entries(dist)) {
    const pct = ((n / candidates.length) * 100).toFixed(0);
    const bar = "█".repeat(Math.round(n / candidates.length * 20));
    console.log(`    ${cat.padEnd(10)} ${String(n).padStart(4)}  (${pct.padStart(3)}%)  ${bar}`);
  }

  const withBuilt = candidates.filter(v => v.builtYear).length;
  console.log(`\n  Built year resolved : ${withBuilt} / ${candidates.length}`);
  console.log(`  High+critical       : ${dist.high + dist.critical} vessels\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  await collect();
  const vessels = [...store.values()];
  await report(vessels);
})();
