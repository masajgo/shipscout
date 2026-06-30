-- ─── Safe Migration Template ────────────────────────────────────────────────
-- Kurallar:
--   1. Her CREATE TABLE → IF NOT EXISTS
--   2. Her ADD COLUMN → IF NOT EXISTS (PostgreSQL 9.6+)
--   3. Index'i CONCURRENTLY ekle → tablo kilitlenmiyor (NOT in transaction)
--   4. NOT NULL column ekleyince DEFAULT ver, sonra default'u kaldır (3 adım)
--   5. RENAME TABLE/COLUMN → uygulama deploy'undan SONRA yap

-- ─── Tablo oluşturma ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS example_table (
  id         SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Kolon ekleme (kilitlenmez) ──────────────────────────────────────────────

ALTER TABLE example_table
  ADD COLUMN IF NOT EXISTS new_col TEXT;

-- ─── NOT NULL kolon — 3 adımlı güvenli yöntem ───────────────────────────────
-- Adım 1: nullable olarak ekle
ALTER TABLE example_table
  ADD COLUMN IF NOT EXISTS required_col TEXT;

-- Adım 2: backfill (büyük tablolarda LIMIT + döngü)
UPDATE example_table SET required_col = 'default_value' WHERE required_col IS NULL;

-- Adım 3: constraint ekle (sadece tüm satırlar doluysa)
ALTER TABLE example_table
  ALTER COLUMN required_col SET NOT NULL;

-- ─── Index — CONCURRENTLY (transaction dışında çalıştır) ─────────────────────
-- Bu satırı BEGIN/COMMIT bloğu içine KOYMA.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example_col
  ON example_table (new_col);

-- ─── UNIQUE constraint — güvenli ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'example_unique'
  ) THEN
    ALTER TABLE example_table ADD CONSTRAINT example_unique UNIQUE (new_col);
  END IF;
END $$;

-- ─── Seed / upsert ───────────────────────────────────────────────────────────

INSERT INTO example_table (new_col) VALUES ('seed_value')
ON CONFLICT DO NOTHING;
