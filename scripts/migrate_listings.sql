-- ─── sp_listings: user-submitted listings support ──────────────────────────
-- Run once in Supabase SQL editor.
-- Safe to re-run (all IF NOT EXISTS).

-- 1. Primary key — GRS listings use grs_id as text key; add a UUID for user listings
ALTER TABLE sp_listings
  ADD COLUMN IF NOT EXISTS listing_id     UUID    DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS imo            TEXT,
  ADD COLUMN IF NOT EXISTS listing_type   TEXT    CHECK (listing_type IN ('sale','charter','scrap')),
  ADD COLUMN IF NOT EXISTS status         TEXT    NOT NULL DEFAULT 'pending'
                                          CHECK (status IN ('pending','approved','rejected','withdrawn')),
  ADD COLUMN IF NOT EXISTS currency       TEXT    DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS price_usd      NUMERIC,
  ADD COLUMN IF NOT EXISTS broker_user_id UUID,   -- Supabase auth.users.id
  ADD COLUMN IF NOT EXISTS broker_name    TEXT,
  ADD COLUMN IF NOT EXISTS broker_email   TEXT,
  ADD COLUMN IF NOT EXISTS broker_phone   TEXT,
  ADD COLUMN IF NOT EXISTS broker_company TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS edit_token     TEXT    UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex');

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_sp_listings_status      ON sp_listings (status);
CREATE INDEX IF NOT EXISTS idx_sp_listings_imo         ON sp_listings (imo);
CREATE INDEX IF NOT EXISTS idx_sp_listings_broker      ON sp_listings (broker_user_id);
CREATE INDEX IF NOT EXISTS idx_sp_listings_submitted   ON sp_listings (submitted_at DESC);

-- 3. Existing GRS/scraped rows: mark as approved + set listing_type
UPDATE sp_listings
SET    status       = 'approved',
       listing_type = 'sale'
WHERE  scraped_at IS NOT NULL
  AND  status = 'pending';

-- 4. Vessel name cache for listings (populated from vessels table on submit)
ALTER TABLE sp_listings
  ADD COLUMN IF NOT EXISTS vessel_name TEXT;

-- Verify
SELECT column_name, data_type, column_default
FROM   information_schema.columns
WHERE  table_name = 'sp_listings'
ORDER  BY ordinal_position;
