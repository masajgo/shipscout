/**
 * Thin wrapper for writing agent run status to the agent_status table.
 * Usage:
 *   const { agentStart, agentFinish } = require("./agentLog");
 *   const runId = await agentStart("intelligence");
 *   ...
 *   await agentFinish("intelligence", "success", { rows: 42 });
 *   await agentFinish("intelligence", "error",   { error: err.message });
 */

const path = require("path");
const fs   = require("fs");

function loadEnv() {
  const envPath = path.join(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8").split("\n").forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key.trim()]) process.env[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  });
}

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  loadEnv();
  const { Pool } = require("pg");
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

async function agentStart(name) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO agent_status (agent_name, last_started_at, last_status, run_count, updated_at)
       VALUES ($1, NOW(), 'running', 1, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         last_started_at = NOW(),
         last_status     = 'running',
         run_count       = agent_status.run_count + 1,
         updated_at      = NOW()`,
      [name]
    );
  } catch (e) {
    // non-fatal — don't break the agent
    console.error(`[agentLog] agentStart failed: ${e.message}`);
  }
}

async function agentFinish(name, status, { rows = null, error = null } = {}) {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE agent_status SET
         last_finished_at = NOW(),
         last_status      = $2,
         last_rows        = $3,
         last_error       = $4,
         updated_at       = NOW()
       WHERE agent_name = $1`,
      [name, status, rows, error ? error.slice(0, 1000) : null]
    );
  } catch (e) {
    console.error(`[agentLog] agentFinish failed: ${e.message}`);
  }
}

module.exports = { agentStart, agentFinish };
