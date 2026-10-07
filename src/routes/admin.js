'use strict';

/**
 * GET /api/admin/rankings
 *
 * Access: saurabh.agrawal7@ibm.com only (is_admin=true + hard email check).
 *
 * Returns for every team:
 *   - Per-member vote counts (top / mid / bottom) from vote_tally
 *   - Ranked list (score = top×3 + mid×2 + bottom×1, ties alphabetical)
 *   - Who has voted (has_submitted=true) and who has NOT yet voted
 *   - Total voters vs total team size
 *
 * Privacy:
 *   - vote_tally has no submitter_id, no timestamp, no row id.
 *   - This endpoint returns only aggregated counts — it is impossible
 *     to know who voted for whom even from this response.
 *
 * Response shape:
 * {
 *   teams: [
 *     {
 *       team: "Artemis",
 *       total_members: 7,
 *       voted_count: 5,
 *       pending_count: 2,
 *       non_voters: ["Vimal Suthar", "Krish Parikh"],
 *       rankings: [
 *         { rank: 1, name: "...", top_votes: 4, mid_votes: 1, bottom_votes: 0, score: 14 },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */

const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate, requireAdmin } = require('../middleware/auth');

const ADMIN_EMAIL = 'saurabh.agrawal7@ibm.com';
const TIER_SCORE  = { top: 3, mid: 2, bottom: 1 };

router.get('/rankings', authenticate, requireAdmin, async (req, res) => {
  // Triple gate: JWT valid + is_admin flag + exact email match
  if (req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  try {
    // One query: all teams, all members, their tallies, and whether each USER voted.
    // vote_tally joined LEFT so members with zero votes still appear.
    // users joined to get voter names for the non_voters list.
    const result = await pool.query(`
      SELECT
        t.id                              AS team_id,
        t.name                            AS team_name,

        -- Member being rated
        m.id                              AS member_id,
        m.name                            AS member_name,
        COALESCE(vt.top_votes,    0)::int AS top_votes,
        COALESCE(vt.mid_votes,    0)::int AS mid_votes,
        COALESCE(vt.bottom_votes, 0)::int AS bottom_votes,

        -- Voter roster for this team (aggregated per team row)
        (
          SELECT json_agg(json_build_object(
            'name',          u2.name,
            'has_submitted', u2.has_submitted
          ) ORDER BY u2.name)
          FROM users u2
          WHERE u2.team_id = t.id
            AND u2.is_admin = FALSE
        ) AS voters

      FROM teams t
      JOIN members m      ON m.team_id = t.id
      LEFT JOIN vote_tally vt ON vt.member_id = m.id
      ORDER BY t.name, m.name
    `);

    // Group rows by team
    const teamMap = {};
    for (const row of result.rows) {
      if (!teamMap[row.team_id]) {
        // Build voter/non-voter lists from the voters JSON (same for every row in this team)
        const voters     = row.voters ?? [];
        const voted      = voters.filter((v) => v.has_submitted).map((v) => v.name);
        const notVoted   = voters.filter((v) => !v.has_submitted).map((v) => v.name);

        teamMap[row.team_id] = {
          team:          row.team_name,
          total_members: voters.length,
          voted_count:   voted.length,
          pending_count: notVoted.length,
          non_voters:    notVoted,     // names of people who have NOT submitted
          members:       {},           // keyed by member_id for aggregation
        };
      }

      const score =
        row.top_votes    * TIER_SCORE.top +
        row.mid_votes    * TIER_SCORE.mid +
        row.bottom_votes * TIER_SCORE.bottom;

      teamMap[row.team_id].members[row.member_id] = {
        name:         row.member_name,
        top_votes:    row.top_votes,
        mid_votes:    row.mid_votes,
        bottom_votes: row.bottom_votes,
        score,
      };
    }

    // Build final response — sort rankings by score desc, name asc
    // Rankings are ONLY revealed once every member of the team has voted.
    // Until then, rankings is null so no partial results are exposed.
    const teams = Object.values(teamMap).map((team) => {
      const votingComplete = team.pending_count === 0 && team.total_members > 0;

      const rankings = votingComplete
        ? Object.values(team.members)
            .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
            .map((m, i) => ({ rank: i + 1, ...m }))
        : null;   // null = voting still in progress — don't reveal partial data

      return {
        team:             team.team,
        total_members:    team.total_members,
        voted_count:      team.voted_count,
        pending_count:    team.pending_count,
        non_voters:       team.non_voters,
        voting_complete:  votingComplete,
        rankings,         // null until every member has voted
      };
    });

    // Sort teams alphabetically
    teams.sort((a, b) => a.team.localeCompare(b.team));

    return res.json({ teams });

  } catch (err) {
    console.error('Rankings error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
