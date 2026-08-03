-- Article fields for per-event magazine articles
-- Generated on-demand by Haiku, cached in DB

ALTER TABLE radar_events
  ADD COLUMN IF NOT EXISTS article_headline TEXT,
  ADD COLUMN IF NOT EXISTS article_body     TEXT;

CREATE INDEX IF NOT EXISTS radar_events_article_idx
  ON radar_events(id) WHERE article_headline IS NOT NULL;
