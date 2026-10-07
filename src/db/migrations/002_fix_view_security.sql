-- ============================================================
-- Migration: 002_fix_view_security.sql
--
-- The view needs SECURITY DEFINER so it runs as the table owner
-- (avnadmin/postgres superuser) even though SELECT on the raw
-- submissions table has been revoked from avnadmin.
-- This means the VIEW itself reads the table, but the app user
-- cannot — they can only read the pre-aggregated view output.
-- ============================================================

DROP VIEW IF EXISTS member_vote_summary;

CREATE VIEW member_vote_summary
WITH (security_barrier = true)
AS
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

-- Grant SELECT on the view to avnadmin
GRANT SELECT ON member_vote_summary TO avnadmin;
