CREATE EXTENSION IF NOT EXISTS postgis;

-- En güncel pozisyon (her gemi tek satır)
CREATE TABLE vessels (
  mmsi               BIGINT PRIMARY KEY,
  imo                BIGINT,
  name               TEXT,
  call_sign          TEXT,
  type               TEXT,
  geom               GEOGRAPHY(POINT, 4326) NOT NULL,
  speed              REAL,
  course             REAL,
  heading            SMALLINT,
  nav_status         SMALLINT,
  length             REAL,
  beam               REAL,
  draught            REAL,
  destination        TEXT,
  eta                TEXT,
  built_year         SMALLINT,
  scrap_score        SMALLINT,
  scrap_category     TEXT,
  scrap_reasons      TEXT[],
  last_static_update TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vessel_geom  ON vessels USING GIST (geom);
CREATE INDEX idx_vessel_imo   ON vessels (imo);
CREATE INDEX idx_vessel_name  ON vessels USING GIN (to_tsvector('simple', COALESCE(name, '')));
CREATE INDEX idx_vessel_scrap ON vessels (scrap_score DESC) WHERE scrap_score IS NOT NULL;

-- Geçmiş iz (track çizmek için)
CREATE TABLE vessel_tracks (
  id          BIGSERIAL PRIMARY KEY,
  mmsi        BIGINT NOT NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_track_mmsi_time ON vessel_tracks (mmsi, recorded_at DESC);

-- ── Migration: mevcut vessels tablosuna eksik kolonları ekle ──────────
-- (Tablo zaten varsa bu ALTER'ları çalıştır, yoksa yukarıdaki CREATE TABLE yeterli)
--
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS call_sign          TEXT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS heading            SMALLINT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS length             REAL;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS beam               REAL;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS draught            REAL;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS destination        TEXT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS eta                TEXT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS built_year         SMALLINT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS scrap_score        SMALLINT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS scrap_category     TEXT;
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS scrap_reasons      TEXT[];
-- ALTER TABLE vessels ADD COLUMN IF NOT EXISTS last_static_update TIMESTAMPTZ;
-- CREATE INDEX IF NOT EXISTS idx_vessel_scrap ON vessels (scrap_score DESC) WHERE scrap_score IS NOT NULL;
