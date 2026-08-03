-- Weekly digest magazine format migration
-- Adds lead_story_id to weekly_digests and editorial_summary to radar_events

ALTER TABLE weekly_digests
  ADD COLUMN IF NOT EXISTS lead_story_id BIGINT REFERENCES radar_events(id);

ALTER TABLE radar_events
  ADD COLUMN IF NOT EXISTS editorial_summary TEXT;

CREATE INDEX IF NOT EXISTS radar_events_editorial_idx
  ON radar_events(id) WHERE editorial_summary IS NOT NULL;
