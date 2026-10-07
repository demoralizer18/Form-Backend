-- ============================================================
-- Migration: 004_replace_submissions_with_vote_tally.sql
--
-- Drops the old submissions table and all its migrations/views,
-- creates the new vote_tally table, and re-seeds zero counters
-- for all existing members.
-- ============================================================

-- Drop previous migration artifacts
DROP VIEW IF EXISTS member_vote_summary;
DROP TABLE IF EXISTS submissions CASCADE;

-- Create the new privacy-safe tally table
CREATE TABLE IF NOT EXISTS vote_tally (
  member_id     INTEGER NOT NULL PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  top_votes     INTEGER NOT NULL DEFAULT 0 CHECK (top_votes    >= 0),
  mid_votes     INTEGER NOT NULL DEFAULT 0 CHECK (mid_votes    >= 0),
  bottom_votes  INTEGER NOT NULL DEFAULT 0 CHECK (bottom_votes >= 0)
);

-- Pre-populate zero rows for every member so UPSERT works cleanly
INSERT INTO vote_tally (member_id, top_votes, mid_votes, bottom_votes)
SELECT id, 0, 0, 0 FROM members
ON CONFLICT (member_id) DO NOTHING;

-- Reset any users who may have submitted during testing
UPDATE users SET has_submitted = FALSE WHERE is_admin = FALSE;

-- Drop old unused indexes if they exist
DROP INDEX IF EXISTS idx_submissions_member_id;
DROP INDEX IF EXISTS idx_submissions_team_id;

-- Add member team index if missing
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);
