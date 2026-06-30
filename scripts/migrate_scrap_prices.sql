-- ─── scrap_prices tablosu ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scrap_prices (
  id           SERIAL PRIMARY KEY,
  country      text NOT NULL,                   -- India, Bangladesh, Pakistan, Turkey
  yard         text NOT NULL,                   -- Alang, Chittagong, Gadani, Aliaga
  vessel_type  text NOT NULL,                   -- bulker, tanker, container
  price_usd_ldt int  NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  source       text NOT NULL DEFAULT '',        -- 'GMS Week 3 2026' vb.

  CONSTRAINT scrap_prices_unique UNIQUE (yard, vessel_type)
);

-- ─── Seed — GMS Week 3 2026 ──────────────────────────────────────────────────
-- Kaynak: GMS Weekly Market Report (Jun 2026)

INSERT INTO scrap_prices (country, yard, vessel_type, price_usd_ldt, source) VALUES
  -- Bangladesh / Chittagong
  ('Bangladesh', 'Chittagong', 'bulker',    400, 'GMS Week 3 2026'),
  ('Bangladesh', 'Chittagong', 'tanker',    420, 'GMS Week 3 2026'),
  ('Bangladesh', 'Chittagong', 'container', 430, 'GMS Week 3 2026'),

  -- Pakistan / Gadani
  ('Pakistan',   'Gadani',     'bulker',    390, 'GMS Week 3 2026'),
  ('Pakistan',   'Gadani',     'tanker',    410, 'GMS Week 3 2026'),
  ('Pakistan',   'Gadani',     'container', 420, 'GMS Week 3 2026'),

  -- India / Alang
  ('India',      'Alang',      'bulker',    380, 'GMS Week 3 2026'),
  ('India',      'Alang',      'tanker',    400, 'GMS Week 3 2026'),
  ('India',      'Alang',      'container', 410, 'GMS Week 3 2026'),

  -- Turkey / Aliaga
  ('Turkey',     'Aliaga',     'bulker',    270, 'GMS Week 3 2026'),
  ('Turkey',     'Aliaga',     'tanker',    280, 'GMS Week 3 2026'),
  ('Turkey',     'Aliaga',     'container', 290, 'GMS Week 3 2026')

ON CONFLICT (yard, vessel_type) DO UPDATE SET
  price_usd_ldt = EXCLUDED.price_usd_ldt,
  source        = EXCLUDED.source,
  updated_at    = NOW();

-- ─── vessels.scrap_value_usd'yi yeni fiyatlarla güncelle ─────────────────────
-- vessel type → scrap_prices tip eşleşmesi:
--   Bulk Carrier / Bulk → bulker
--   Tanker / Oil Tanker → tanker
--   Container → container
--   Diğer → bulker (varsayılan)

UPDATE vessels v
SET
  scrap_value_usd = (
    SELECT sp.price_usd_ldt * v.ldt
    FROM scrap_prices sp
    WHERE sp.yard = 'Chittagong'   -- en yüksek → varsayılan referans fiyat
      AND sp.vessel_type = CASE
        WHEN lower(v.type_specific) LIKE '%tank%'      THEN 'tanker'
        WHEN lower(v.type_specific) LIKE '%container%' THEN 'container'
        WHEN lower(v.type_specific) LIKE '%bulk%'      THEN 'bulker'
        ELSE 'bulker'
      END
    LIMIT 1
  ),
  scrap_value_estimated = v.ldt_estimated
WHERE v.ldt IS NOT NULL AND v.ldt > 0;

-- ─── Kontrol ─────────────────────────────────────────────────────────────────

SELECT yard, vessel_type, price_usd_ldt, source, updated_at
FROM scrap_prices
ORDER BY yard, vessel_type;
