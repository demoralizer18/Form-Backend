'use strict';

/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 *
 * Security:
 *  - Email must exist in the users table (whitelist)
 *  - Password verified via bcrypt
 *  - Only @ibm.com addresses accepted
 *  - Rate-limited at the app level (5 req/min per IP)
 *
 * Returns: { token, user: { name, email, team, is_admin, has_submitted } }
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');

const IBM_DOMAIN = '@ibm.com';

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  // --- Input validation ---
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail.endsWith(IBM_DOMAIN)) {
    return res.status(401).json({ error: 'Only IBM accounts are permitted.' });
  }

  if (password.length < 6) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  try {
    // Fetch user — include team name via join
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash,
              u.team_id, u.is_admin, u.has_submitted,
              t.name AS team_name
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id
       WHERE u.email = $1`,
      [normalizedEmail]
    );

    const user = result.rows[0];

    // Constant-time rejection even when user not found
    const dummyHash = '$2a$12$invalidsaltinvalidsaltinvalid00000000000000000000000000';
    const hashToCheck = user ? user.password_hash : dummyHash;
    const passwordMatch = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Issue JWT
    const payload = {
      id:       user.id,
      email:    user.email,
      team_id:  user.team_id,
      is_admin: user.is_admin,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer:    'anonymous-rating-form',
    });

    return res.json({
      token,
      user: {
        name:          user.name,
        email:         user.email,
        team:          user.team_name ?? null,
        is_admin:      user.is_admin,
        has_submitted: user.has_submitted,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
