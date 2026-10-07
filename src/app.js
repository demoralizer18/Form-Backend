'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const authRouter   = require('./routes/auth');
const meRouter     = require('./routes/me');
const submitRouter = require('./routes/submit');
const adminRouter  = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow only the frontend origin ─────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g., curl, Postman) only in dev
    if (!origin) {
      if (process.env.NODE_ENV === 'production') return cb(null, false);
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  methods:        ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
};

app.use(cors(corsOptions));
// Handle preflight requests before rate limiting
app.options('*', cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limit on login endpoint
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max:      5,
  message:  { error: 'Too many login attempts. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      60,
  message:  { error: 'Rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',   authRouter);
app.use('/api/me',     meRouter);
app.use('/api/submit', submitRouter);
app.use('/api/admin',  adminRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Anonymous Rating Form API running on port ${PORT}`);
});

module.exports = app;
