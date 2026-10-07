'use strict';

/**
 * GET  /api/me           → current user info + submission status
 * GET  /api/me/team      → members of the user's team (for the rating board)
 */

const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// All /me routes require a valid JWT
router.use(authenticate);

// GET /api/me — who am I?
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.is_admin, u.has_submitted,
              t.name AS team_name
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    return res.json({
      id:            user.id,
      name:          user.name,
      email:         user.email,
      team:          user.team_name ?? null,
      is_admin:      user.is_admin,
      has_submitted: user.has_submitted,
    });
  } catch (err) {
    console.error('GET /me error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/me/team — all members of the authenticated user's team
// (only used by non-admin raters)
router.get('/team', async (req, res) => {
  if (req.user.is_admin) {
    return res.status(403).json({ error: 'Admin users do not have a rating team.' });
  }

  if (!req.user.team_id) {
    return res.status(400).json({ error: 'You are not assigned to a team.' });
  }

  try {
    const result = await pool.query(
      `SELECT m.id, m.name, t.name AS team_name
       FROM members m
       JOIN teams t ON t.id = m.team_id
       WHERE m.team_id = $1
       ORDER BY m.name ASC`,
      [req.user.team_id]
    );

    return res.json({
      team:    result.rows[0]?.team_name ?? null,
      members: result.rows.map((r) => ({ id: r.id, name: r.name })),
    });
  } catch (err) {
    console.error('GET /me/team error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
