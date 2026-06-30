-- ─── vessel_photos — multi-photo per vessel ──────────────────────────────────
--
-- Mevcut tablo boş ve şeması yetersiz → DROP + yeniden oluştur.
-- Sonra vessels.photo_* sütunlarındaki ~2.4K fotoyu buraya migrate et.

-- 1. Eski tabloyu kaldır (boş, güvenli)
DROP TABLE IF EXISTS vessel_photos;

-- 2. Tam şema
CREATE TABLE vessel_photos (
  id               SERIAL PRIMARY KEY,
  imo              bigint NOT NULL,
  photo_url        text   NOT NULL,
  photo_thumb      text,
  artist           text,
  license          text,
  license_url      text,
  match_confidence text,                       -- 'high' | 'medium'
  source           text NOT NULL DEFAULT 'wikimedia',
  page_url         text,
  attribution      text,                       -- '© Artist / License' precomputed
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT vessel_photos_unique UNIQUE (imo, photo_url)
);

-- 3. Index'ler
CREATE INDEX idx_vessel_photos_imo     ON vessel_photos (imo);
CREATE INDEX idx_vessel_photos_primary ON vessel_photos (imo) WHERE is_primary = true;

-- 4. Mevcut vessels.photo_* sütunlarından migrate
--    (photo_thumb + photo_fetched_at dolu = scraper'ın bulduğu gerçek fotolar)
INSERT INTO vessel_photos
  (imo, photo_url, photo_thumb, artist, license, license_url,
   match_confidence, source, page_url, attribution, is_primary, created_at)
SELECT
  imo::bigint,
  photo_url,
  photo_thumb,
  photo_artist,
  photo_license,
  photo_license_url,
  photo_match_confidence,
  COALESCE(photo_source, 'wikimedia'),
  licensed_photo->>'pageUrl',
  CONCAT('© ', COALESCE(photo_artist, 'Unknown'), ' / ', COALESCE(photo_license, '')),
  true,                                        -- tek foto = primary
  COALESCE(photo_fetched_at, NOW())
FROM vessels
WHERE photo_url  IS NOT NULL
  AND photo_thumb IS NOT NULL
  AND photo_fetched_at IS NOT NULL
ON CONFLICT (imo, photo_url) DO NOTHING;

-- 5. Kontrol
SELECT
  COUNT(*)                                       AS toplam_foto,
  COUNT(*) FILTER (WHERE is_primary)             AS primary_foto,
  COUNT(*) FILTER (WHERE match_confidence='high') AS high_conf,
  COUNT(*) FILTER (WHERE match_confidence='medium') AS medium_conf,
  COUNT(DISTINCT imo)                             AS farkli_gemi
FROM vessel_photos;
