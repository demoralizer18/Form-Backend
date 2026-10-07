'use strict';

/**
 * POST /api/submit
 *
 * Accepts tier placements for all team members and atomically
 * increments the vote counters in vote_tally.
 *
 * Privacy guarantee:
 *   - vote_tally has NO id, NO timestamp, NO submitter_id.
 *   - A raw SELECT * FROM vote_tally returns only:
 *       member_id | top_votes | mid_votes | bottom_votes
 *   - It is structurally impossible to know who voted for whom.
 *
 * Rules enforced:
 *   - Valid JWT required (authenticate middleware)
 *   - Admin users cannot submit
 *   - User must belong to a team
 *   - One submission per user (has_submitted flag + row lock)
 *   - Every member of the team must be placed (no skipping)
 *   - All member IDs must belong to the caller's team
 *   - No duplicate member IDs in the payload
 *   - Top: max 2 members, Bottom: max 2 members
 *
 * Body: {
 *   placements: [
 *     { member_id: <number>, tier: "top" | "mid" | "bottom" },
 *     ...
 *   ]
 * }
 */

const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const VALID_TIERS = new Set(['top', 'mid', 'bottom']);
const TIER_CAPS   = { top: 2, bottom: 2 };

// Maps tier name to the vote_tally column to increment
const TIER_COLUMN = { top: 'top_votes', mid: 'mid_votes', bottom: 'bottom_votes' };

router.post('/', authenticate, async (req, res) => {
  if (req.user.is_admin) {
    return res.status(403).json({ error: 'Admin users cannot submit ratings.' });
  }
  if (!req.user.team_id) {
    return res.status(400).json({ error: 'You are not assigned to a team.' });
  }

  const { placements } = req.body ?? {};

  // ── Input shape validation ────────────────────────────────
  if (!Array.isArray(placements) || placements.length === 0) {
    return res.status(400).json({ error: 'placements must be a non-empty array.' });
  }
  for (const p of placements) {
    if (typeof p.member_id !== 'number' || !VALID_TIERS.has(p.tier)) {
      return res.status(400).json({
        error: 'Each placement needs a numeric member_id and a tier of top, mid, or bottom.',
      });
    }
  }

  // ── Tier cap validation ───────────────────────────────────
  const tierCounts = { top: 0, mid: 0, bottom: 0 };
  for (const p of placements) tierCounts[p.tier]++;
  for (const [tier, cap] of Object.entries(TIER_CAPS)) {
    if (tierCounts[tier] > cap) {
      return res.status(400).json({
        error: `Tier "${tier}" allows at most ${cap} member(s). You submitted ${tierCounts[tier]}.`,
      });
    }
  }

  // ── Duplicate member IDs ──────────────────────────────────
  const memberIds = placements.map((p) => p.member_id);
  if (new Set(memberIds).size !== memberIds.length) {
    return res.status(400).json({ error: 'Duplicate member IDs found in placements.' });
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    // ── One-time submission gate (row lock prevents race conditions) ──
    const userRow = await db.query(
      'SELECT has_submitted FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!userRow.rows[0]) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found.' });
    }
    if (userRow.rows[0].has_submitted) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'You have already submitted your ratings.' });
    }

    // ── All member IDs must belong to the caller's team ──────
    const membersResult = await db.query(
      `SELECT id FROM members WHERE id = ANY($1::int[]) AND team_id = $2`,
      [memberIds, req.user.team_id]
    );
    if (membersResult.rows.length !== memberIds.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'One or more member IDs are invalid or do not belong to your team.',
      });
    }

    // ── Every team member must be rated (no skipping) ────────
    const totalCount = await db.query(
      'SELECT COUNT(*)::int AS cnt FROM members WHERE team_id = $1',
      [req.user.team_id]
    );
    const expectedCount = totalCount.rows[0].cnt;
    if (memberIds.length !== expectedCount) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: `All ${expectedCount} team members must be rated. Received ${memberIds.length}.`,
      });
    }

    // ── Atomically increment vote counters — no rows written that
    //    link a submitter to their choices ─────────────────────
    for (const p of placements) {
      const col = TIER_COLUMN[p.tier];
      await db.query(
        `INSERT INTO vote_tally (member_id, top_votes, mid_votes, bottom_votes)
         VALUES ($1, 0, 0, 0)
         ON CONFLICT (member_id) DO UPDATE
           SET ${col} = vote_tally.${col} + 1`,
        [p.member_id]
      );
    }

    // ── Mark user as submitted ────────────────────────────────
    await db.query(
      'UPDATE users SET has_submitted = TRUE WHERE id = $1',
      [req.user.id]
    );

    await db.query('COMMIT');
    return res.status(201).json({ message: 'Ratings submitted successfully.' });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Submit error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    db.release();
  }
});

module.exports = router;
