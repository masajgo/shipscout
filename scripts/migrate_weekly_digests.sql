CREATE TABLE IF NOT EXISTS weekly_digests (
  id          BIGSERIAL PRIMARY KEY,
  week_start  DATE NOT NULL UNIQUE,
  week_end    DATE NOT NULL,
  week_label  TEXT NOT NULL,
  intro_text  TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  published   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_digests_week_start_idx ON weekly_digests(week_start DESC);
CREATE INDEX IF NOT EXISTS weekly_digests_published_idx  ON weekly_digests(published) WHERE published = true;
