-- ============================================================
-- Anonymous Rating Form — Database Schema (v2)
--
-- PRIVACY DESIGN:
--   The vote_tally table stores ONLY aggregated counters.
--   There is no id column (no insertion order), no timestamp
--   (no time-based traceability), and no submitter_id column.
--   Even a superuser running SELECT * FROM vote_tally sees only:
--     member_id | top_votes | mid_votes | bottom_votes
--   There is no way — at any layer — to know who voted for whom.
-- ============================================================

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE
);

-- Members (the people being rated)
CREATE TABLE IF NOT EXISTS members (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(150) NOT NULL,
  team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE (name, team_id)
);

-- Users (the raters — login whitelist)
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  team_id        INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  is_admin       BOOLEAN      NOT NULL DEFAULT FALSE,
  has_submitted  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Vote Tally ────────────────────────────────────────────────
-- One row per member. Counters are atomically incremented on
-- each submission via INSERT ... ON CONFLICT DO UPDATE.
--
-- What is NOT here (by design):
--   ✗ No row id          → no insertion order
--   ✗ No submitted_at    → no timestamp cross-reference
--   ✗ No submitter_id    → no link to who voted
--   ✗ No per-vote rows   → no enumeration of individual ballots
--
-- What IS here:
--   ✓ member_id          → which member received votes
--   ✓ top_votes          → how many placed them in Top
--   ✓ mid_votes          → how many placed them in Mid
--   ✓ bottom_votes       → how many placed them in Bottom
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vote_tally (
  member_id     INTEGER NOT NULL PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  top_votes     INTEGER NOT NULL DEFAULT 0 CHECK (top_votes    >= 0),
  mid_votes     INTEGER NOT NULL DEFAULT 0 CHECK (mid_votes    >= 0),
  bottom_votes  INTEGER NOT NULL DEFAULT 0 CHECK (bottom_votes >= 0)
);

-- Supporting indexes
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_members_team  ON members(team_id);
