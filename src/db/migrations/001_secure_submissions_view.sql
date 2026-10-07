-- ============================================================
-- Migration: secure_submissions_view.sql
--
-- PURPOSE:
--   Make raw submission rows unreadable to anyone browsing the DB
--   directly (pgAdmin, psql, etc.). Only Saurabh's admin API can
--   see data, and only in aggregated form through the view below.
--
-- WHAT THIS DOES:
--   1. Creates a VIEW `member_vote_summary` that shows ONLY the
--      aggregated vote counts per member per tier — no raw rows,
--      no timestamps, no ordering that could reveal who voted when.
--
--   2. Revokes SELECT on the raw `submissions` table from the
--      application user (avnadmin). After this, even if someone
--      opens the DB in pgAdmin and runs SELECT * FROM submissions,
--      they get: ERROR: permission denied for table submissions
--
--   3. Grants SELECT only on the view, not the table.
--
-- NOTE: The INSERT in submit.js still works because INSERT does
--       not require SELECT privilege on the target table.
-- ============================================================

-- 1. Drop the view if it already exists (idempotent re-run)
DROP VIEW IF EXISTS member_vote_summary;

-- 2. Create the aggregated view — this is ALL that is queryable
CREATE VIEW member_vote_summary AS
SELECT
    t.name                                          AS team_name,
    m.id                                            AS member_id,
    m.name                                          AS member_name,
    COUNT(*) FILTER (WHERE s.tier = 'top')          AS top_votes,
    COUNT(*) FILTER (WHERE s.tier = 'mid')          AS mid_votes,
    COUNT(*) FILTER (WHERE s.tier = 'bottom')       AS bottom_votes,
    COUNT(*)                                        AS total_votes
FROM submissions s
JOIN members m ON m.id = s.member_id
JOIN teams   t ON t.id = s.team_id
GROUP BY t.name, m.id, m.name;

-- 3. Revoke direct SELECT on the raw table from the app user
--    This makes SELECT * FROM submissions return a permission error
--    for anyone who opens the DB directly.
REVOKE SELECT ON submissions FROM avnadmin;

-- 4. Grant SELECT only on the safe aggregated view
GRANT SELECT ON member_vote_summary TO avnadmin;

-- 5. Also lock down members and users tables from being browsed
--    by non-superuser connections (belt-and-suspenders)
--    avnadmin already owns the tables so we revoke from PUBLIC.
REVOKE SELECT ON submissions FROM PUBLIC;
REVOKE SELECT ON users        FROM PUBLIC;
