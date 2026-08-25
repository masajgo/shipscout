-- Distressed Fleet Watch — event_type expansion
-- Adds judicial_auction, bankruptcy, layup to the CHECK constraint.
-- Keeps legacy 'auction' value so existing rows remain valid.

ALTER TABLE radar_events DROP CONSTRAINT IF EXISTS radar_events_event_type_check;

ALTER TABLE radar_events
  ADD CONSTRAINT radar_events_event_type_check
  CHECK (event_type IN (
    'arrest',
    'detention',
    'bank_seizure',
    'judicial_auction',
    'auction',          -- legacy alias, kept for backward-compat
    'sanction',
    'bankruptcy',
    'scrap_sale',
    'layup',
    -- Legacy types still present in radar_events from earlier scanner versions
    'incident',
    'attack',
    'casualty'
  ));

-- Index for the new types so the Distressed Fleet Watch query is fast
CREATE INDEX IF NOT EXISTS radar_events_distressed_idx
  ON radar_events (event_type, event_date DESC NULLS LAST)
  WHERE event_type IN ('arrest','bank_seizure','judicial_auction','bankruptcy','layup');
