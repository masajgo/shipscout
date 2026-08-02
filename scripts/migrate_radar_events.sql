CREATE TABLE IF NOT EXISTS radar_events (
  id              BIGSERIAL PRIMARY KEY,
  imo             TEXT,
  vessel_name     TEXT,
  event_type      TEXT NOT NULL CHECK (event_type IN ('arrest','detention','auction','bank_seizure','sanction','scrap_sale')),
  event_date      DATE,
  location        TEXT,
  source_name     TEXT NOT NULL,
  summary         TEXT NOT NULL,
  matched_vessel_id BIGINT REFERENCES vessels(mmsi),
  raw_headline    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS radar_events_imo_idx        ON radar_events(imo);
CREATE INDEX IF NOT EXISTS radar_events_event_type_idx ON radar_events(event_type);
CREATE INDEX IF NOT EXISTS radar_events_created_at_idx ON radar_events(created_at DESC);
CREATE INDEX IF NOT EXISTS radar_events_matched_idx    ON radar_events(matched_vessel_id) WHERE matched_vessel_id IS NOT NULL;
