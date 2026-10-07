/**
 * seed.js — Seeds the database with teams, members, and users.
 * Generates random passwords for all users.
 * Run: node src/db/seed.js
 *
 * Outputs generated credentials to: generated_credentials.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const pg   = require('pg');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// ── Postgres client ─────────────────────────────────────────────────────────
const client = new pg.Client({
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA,
  },
});

// ── Source data (from Book.xlsx) ─────────────────────────────────────────────
const TEAMS = ['Artemis', 'Trishul', 'E2E'];

const MEMBERS = [
  { name: 'Jatin Mamtora',      team: 'Artemis' },
  { name: 'Shrenik Patel',      team: 'Artemis' },
  { name: 'Piyush Bhadiyadra', team: 'Artemis' },
  { name: 'Piyush Mungalpara', team: 'Artemis' },
  { name: 'Vimal Suthar',       team: 'Artemis' },
  { name: 'Krish Parikh',       team: 'Artemis' },
  { name: 'Krunal Pandit',      team: 'Artemis' },
  { name: 'Shailly Mistry',     team: 'Trishul' },
  { name: 'Sarth Patel',        team: 'Trishul' },
  { name: 'Harsha Singh',       team: 'E2E'     },
  { name: 'Zeel Vyas',          team: 'E2E'     },
  { name: 'Dhru Soni',          team: 'E2E'     },
  { name: 'Barkha Jha',         team: 'E2E'     },
  { name: 'Drashti Shukla',     team: 'E2E'     },
  { name: 'Vimal Hirpara',      team: 'E2E'     },
];

// Users (raters). Admin has no team.
const USERS_RAW = [
  { name: 'Jatin Mamtora',      email: 'jatin.mamtora1@ibm.com',                team: 'Artemis', is_admin: false },
  { name: 'Shrenik Patel',      email: 'Shrenik.Patel@ibm.com',                 team: 'Artemis', is_admin: false },
  { name: 'Piyush Bhadiyadra', email: 'piyushkumar.bhadiyadra@ibm.com',        team: 'Artemis', is_admin: false },
  { name: 'Piyush Mungalpara', email: 'mungalpara.piyush@ibm.com',             team: 'Artemis', is_admin: false },
  { name: 'Vimal Suthar',       email: 'Vimal.Suthar@ibm.com',                  team: 'Artemis', is_admin: false },
  { name: 'Krish Parikh',       email: 'Krishkumar.Parikh1@ibm.com',            team: 'Artemis', is_admin: false },
  { name: 'Krunal Pandit',      email: 'pandit.krunal@ibm.com',                 team: 'Artemis', is_admin: false },
  { name: 'Shailly Mistry',     email: 'Shailly.Mistry@ibm.com',                team: 'Trishul', is_admin: false },
  { name: 'Sarth Patel',        email: 'Sarth.Patel@ibm.com',                   team: 'Trishul', is_admin: false },
  { name: 'Harsha Singh',       email: 'Singh.Harsha.Suryabahadur@ibm.com',     team: 'E2E',     is_admin: false },
  { name: 'Zeel Vyas',          email: 'zeel.vyas@ibm.com',                     team: 'E2E',     is_admin: false },
  { name: 'Dhru Soni',          email: 'dhru.soni@ibm.com',                     team: 'E2E',     is_admin: false },
  { name: 'Barkha Jha',         email: 'Barkha.Jha@ibm.com',                    team: 'E2E',     is_admin: false },
  { name: 'Drashti Shukla',     email: 'Drashti.Shukla1@ibm.com',               team: 'E2E',     is_admin: false },
  { name: 'Vimal Hirpara',      email: 'Vimal.Hirpara@ibm.com',                  team: 'E2E',     is_admin: false },
  // Admin — no team
  { name: 'Saurabh Agrawal',   email: 'Saurabh.Agrawal7@ibm.com',              team: null,      is_admin: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function generatePassword(length = 12) {
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '@#$!';
  const all    = upper + lower + digits + special;

  // Guarantee at least one of each class
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const rest = Array.from({ length: length - 4 }, () => pick(all));
  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  await client.connect();
  console.log('Connected to database.');

  // Apply schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await client.query(schema);
  console.log('Schema applied.');

  // --- Teams ---
  const teamIdMap = {};
  for (const teamName of TEAMS) {
    const res = await client.query(
      `INSERT INTO teams (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [teamName]
    );
    teamIdMap[teamName] = res.rows[0].id;
  }
  console.log('Teams seeded:', teamIdMap);

  // --- Members ---
  for (const m of MEMBERS) {
    await client.query(
      `INSERT INTO members (name, team_id) VALUES ($1, $2)
       ON CONFLICT (name, team_id) DO NOTHING`,
      [m.name, teamIdMap[m.team]]
    );
  }
  console.log(`${MEMBERS.length} members seeded.`);

  // --- Users ---
  const credentials = [];
  for (const u of USERS_RAW) {
    const plainPassword = generatePassword();
    const hash = await bcrypt.hash(plainPassword, 12);
    const teamId = u.team ? teamIdMap[u.team] : null;

    await client.query(
      `INSERT INTO users (name, email, password_hash, team_id, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
         SET name          = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             team_id       = EXCLUDED.team_id,
             is_admin      = EXCLUDED.is_admin`,
      [u.name, u.email.toLowerCase(), hash, teamId, u.is_admin]
    );

    credentials.push({
      name:     u.name,
      email:    u.email.toLowerCase(),
      password: plainPassword,
      team:     u.team ?? 'ADMIN',
      is_admin: u.is_admin,
    });
  }

  // Write credentials JSON
  const outPath = path.join(__dirname, '../../generated_credentials.json');
  fs.writeFileSync(outPath, JSON.stringify(credentials, null, 2), 'utf8');
  console.log(`\nCredentials written to: ${outPath}`);
  console.log('\n=== GENERATED CREDENTIALS ===');
  console.table(credentials.map((c) => ({ name: c.name, email: c.email, password: c.password, team: c.team })));

  await client.end();
  console.log('\nSeed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
