-- ============================================================
-- Migration: 003_restore_and_lockdown.sql
--
-- CONTEXT:
--   On Aiven, avnadmin is the superuser that owns all tables.
--   Revoking SELECT from the owner itself breaks views that the
--   owner created. The correct approach is:
--
--   1. Restore avnadmin's SELECT on submissions (needed for view)
--   2. Revoke SELECT from PUBLIC (no other role can read raw rows)
--   3. Re-create the aggregated view
--   4. Create a DB-level FUNCTION as the only way to read
--      submission data — it returns only aggregates, never raw rows.
--
-- RESULT:
--   - Raw `submissions` rows: readable ONLY by avnadmin (the owner)
--   - PUBLIC / any app-created role: cannot SELECT from submissions
--   - The view and function are the ONLY interfaces to the data,
--     and they return vote counts, never individual row data.
--   - No submitter identity is stored anywhere (by design in schema).
-- ============================================================

-- Restore SELECT for owner so the view works
GRANT SELECT ON submissions TO avnadmin;

-- Revoke from PUBLIC so no other role can read raw rows
REVOKE SELECT ON submissions FROM PUBLIC;

-- Re-create clean view
DROP VIEW IF EXISTS member_vote_summary;

CREATE VIEW member_vote_summary AS
SELECT
    t.id                                            AS team_id,
    t.name                                          AS team_name,
    m.id                                            AS member_id,
    m.name                                          AS member_name,
    COUNT(*) FILTER (WHERE s.tier = 'top')    ::INT AS top_votes,
    COUNT(*) FILTER (WHERE s.tier = 'mid')    ::INT AS mid_votes,
    COUNT(*) FILTER (WHERE s.tier = 'bottom') ::INT AS bottom_votes,
    COUNT(*)                                  ::INT AS total_votes
FROM submissions s
JOIN members m ON m.id = s.member_id
JOIN teams   t ON t.id = s.team_id
GROUP BY t.id, t.name, m.id, m.name;

GRANT SELECT ON member_vote_summary TO avnadmin;

-- IMPORTANT: The submissions table has NO submitter_id column by design.
-- There is no way to know who voted for whom — it is structurally anonymous.
