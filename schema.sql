-- =============================================================================
-- FashionVision — FULL DATABASE SCHEMA (ALL-IN-ONE)
-- Run this in Supabase SQL Editor
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1. USERS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. UPLOADS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path       text NOT NULL DEFAULT '',
  image_url        text NOT NULL DEFAULT '',
  clothing_type    text NOT NULL DEFAULT '',
  color            text NOT NULL DEFAULT '',
  pattern          text NOT NULL DEFAULT '',
  style            text NOT NULL DEFAULT '',
  season           text NOT NULL DEFAULT '',
  title            text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  hashtags         text[] NOT NULL DEFAULT '{}',
  suggested_boards text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user_id 
ON uploads(user_id);

CREATE INDEX IF NOT EXISTS idx_uploads_created_at 
ON uploads(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3. SCHEDULED PINS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_pins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path     text NOT NULL DEFAULT '',
  image_url      text NOT NULL DEFAULT '',
  title          text NOT NULL DEFAULT '',
  description    text NOT NULL DEFAULT '',
  hashtags       text NOT NULL DEFAULT '',
  board_id       text NOT NULL DEFAULT '',
  scheduled_time timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'published', 'cancelled')),
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_user 
ON scheduled_pins(user_id);

CREATE INDEX IF NOT EXISTS idx_sched_time 
ON scheduled_pins(user_id, scheduled_time DESC);

-- ---------------------------------------------------------------------
-- 4. FASHION HISTORY TABLE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fashion_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url     text NOT NULL DEFAULT '',
  clothing_type text NOT NULL DEFAULT '',
  color         text NOT NULL DEFAULT '',
  pattern       text NOT NULL DEFAULT '',
  style         text NOT NULL DEFAULT '',
  season        text NOT NULL DEFAULT '',
  title         text NOT NULL DEFAULT '',
  hashtags      text[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hist_user 
ON fashion_history(user_id);

CREATE INDEX IF NOT EXISTS idx_hist_time 
ON fashion_history(user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fashion_history ENABLE ROW LEVEL SECURITY;

-- Uploads policy
CREATE POLICY "uploads policy"
ON uploads
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Scheduled policy
CREATE POLICY "scheduled policy"
ON scheduled_pins
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- History policy
CREATE POLICY "history policy"
ON fashion_history
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 6. STORAGE POLICY (IMPORTANT FIX)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Service role full access" ON storage.objects;

CREATE POLICY "Service role full access"
ON storage.objects
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- END
-- =============================================================================