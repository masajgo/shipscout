CREATE TABLE IF NOT EXISTS agent_status (
  agent_name       TEXT PRIMARY KEY,
  last_started_at  TIMESTAMPTZ,
  last_finished_at TIMESTAMPTZ,
  last_status      TEXT,        -- 'running' | 'success' | 'error'
  last_rows        INTEGER,
  last_error       TEXT,
  run_count        INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
