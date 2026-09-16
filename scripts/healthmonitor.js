#!/usr/bin/env node
/**
 * ShipScout health monitor (Node.js port of healthmonitor.py)
 * Checks launchd jobs, DB connectivity, and recent agent log errors.
 * Sends a Resend alert email if issues are found.
 * Also writes status to agent_status table for the admin dashboard.
 */

const path    = require("path");
const fs      = require("fs");
const https   = require("https");
const { execSync, spawnSync } = require("child_process");

// ── Load .env.local ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    const k = key.trim();
    if (!process.env[k]) process.env[k] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  });
}

const RESEND_KEY  = process.env.RESEND_API_KEY || "";
const ALERT_FROM  = "info@turqomarine.com";
const ALERT_TO    = "ardavcioglu@gmail.com";
const CRON_SECRET = process.env.CRON_SECRET || "";

const LAUNCHD_JOBS = [
  "com.shipscout.intelligence",
  "com.shipscout.ownerscan",
  "com.shipscout.weeklyrefresh",
  "com.shipscout.shiplistings",
  "com.shipscout.updatepositions",
];

const LOG_DIR = path.join(process.env.HOME, "Library/Logs/shipscout");

const issues  = [];
const healthy = [];
const actions = [];

// ── Check launchd jobs ─────────────────────────────────────────────────────────
for (const job of LAUNCHD_JOBS) {
  const r = spawnSync("launchctl", ["list", job], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) {
    issues.push(`${job} not loaded`);
    const restart = spawnSync("launchctl", ["start", job], { encoding: "utf8" });
    actions.push(restart.status === 0 ? `Restarted ${job}` : `Could not restart ${job}`);
  } else {
    const match = r.stdout.match(/"LastExitStatus"\s*=\s*(-?\d+)/);
    const status = match ? parseInt(match[1]) : 0;
    if (status === 0) healthy.push(`${job} ok`);
    else issues.push(`${job} last exit: ${status}`);
  }
}

// ── Check recent log files for errors ─────────────────────────────────────────
const LOG_FILES = [
  { file: "intelligence_agent_err.log", name: "intelligence" },
  { file: "daily_scan.err.log",         name: "ownerscan" },
];

const oneHourAgo = Date.now() - 60 * 60 * 1000;

for (const { file, name } of LOG_FILES) {
  const logPath = path.join(LOG_DIR, file);
  if (!fs.existsSync(logPath)) continue;
  const stat = fs.statSync(logPath);
  if (stat.mtimeMs < oneHourAgo) continue;
  const tail = fs.readFileSync(logPath, "utf8").split("\n").slice(-20).join("\n");
  if (/error|crash|SIGABRT|ENOMEM|MODULE_NOT_FOUND|FATAL/i.test(tail)) {
    const errLine = tail.split("\n").find(l => /error|crash|FATAL|ENOMEM/i.test(l)) || "";
    issues.push(`${name}: recent error — ${errLine.slice(0, 120)}`);
  }
}

// ── Write heartbeat to agent_status table ─────────────────────────────────────
async function writeHeartbeat() {
  try {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const status = issues.length > 0 ? "degraded" : "ok";
    const errMsg = issues.length > 0 ? issues.slice(0, 3).join(" | ") : null;
    await pool.query(
      `INSERT INTO agent_status (agent_name, last_started_at, last_finished_at, last_status, last_error, run_count, updated_at)
       VALUES ('healthmonitor', NOW(), NOW(), $1, $2, 1, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         last_finished_at = NOW(),
         last_status      = $1,
         last_error       = $2,
         run_count        = agent_status.run_count + 1,
         updated_at       = NOW()`,
      [status, errMsg]
    );
    await pool.end();
  } catch (e) {
    console.error("DB heartbeat failed:", e.message);
  }
}

// ── Send alert email ───────────────────────────────────────────────────────────
function postJSON(url, payload, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers },
    }, res => { res.resume(); resolve(res.statusCode); });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

async function main() {
  await writeHeartbeat();

  const now = new Date().toISOString().slice(0, 16).replace("T", " ");

  if (issues.length > 0 && RESEND_KEY) {
    const lines = [
      `ShipScout Health Monitor — ${now}`, "",
      `ISSUES (${issues.length}):`, ...issues.map(i => `  • ${i}`),
      ...(actions.length ? ["", "ACTIONS:", ...actions.map(a => `  • ${a}`)] : []),
      ...(healthy.length ? ["", "HEALTHY:", ...healthy.map(h => `  • ${h}`)] : []),
    ];
    try {
      await postJSON("https://api.resend.com/emails", {
        from: `ShipScout Monitor <${ALERT_FROM}>`,
        to:   [ALERT_TO],
        subject: `[ShipScout] ${issues.length} issue(s) — ${now}`,
        text: lines.join("\n"),
      }, { Authorization: `Bearer ${RESEND_KEY}` });
    } catch (e) {
      console.error("Alert send failed:", e.message);
    }
  }

  if (CRON_SECRET) {
    try {
      await postJSON("https://shipscout.io/api/health", {
        agent_name: "local-healthmonitor",
        status: issues.length > 0 ? "degraded" : "ok",
        message: issues.length > 0 ? issues.slice(0, 3).join("; ") : "all clear",
      }, { "x-cron-secret": CRON_SECRET });
    } catch (e) {
      console.error("Heartbeat failed:", e.message);
    }
  }

  const label = issues.length > 0 ? "ISSUES" : "OK";
  console.log(`${now} [${label}] issues=${issues.length} healthy=${healthy.length}`);
  issues.forEach(i => console.log(`  ISSUE: ${i}`));
  process.exit(issues.length > 0 ? 1 : 0);
}

main();
