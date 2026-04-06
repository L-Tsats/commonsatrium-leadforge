// Feature: leadforge-plesk-deployment, Property 8: Auth Session Lifecycle
// Feature: leadforge-plesk-deployment, Property 9: Unauthenticated API Rejection

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import fc from 'fast-check';
import request from 'supertest';
import bcrypt from 'bcrypt';
import express from 'express';
import session from 'express-session';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let app;
let pool;
let dbAvailable = false;

/**
 * Helper: extract session cookie from a supertest response
 */
function extractSessionCookie(res) {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return null;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sid = cookies.find((c) => c.startsWith('connect.sid='));
  return sid ? sid.split(';')[0] : null;
}

/**
 * Arbitrary for valid usernames: alphanumeric, 3-20 chars
 */
const usernameArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 3,
    maxLength: 20,
  })
  .filter((s) => /^[a-z0-9]{3,20}$/.test(s));

/**
 * Arbitrary for passwords: printable ASCII, 4-30 chars
 */
const passwordArb = fc
  .string({ minLength: 4, maxLength: 30 })
  .filter((s) => s.length >= 4 && !/[\x00-\x1f]/.test(s));

/**
 * Build a minimal Express app mirroring app.js config for testing,
 * without triggering start() / app.listen() side effects.
 */
function buildTestApp() {
  const testApp = express();
  const { requireAuth } = require('../server/auth');

  testApp.use(express.json({ limit: '10mb' }));
  testApp.use(express.urlencoded({ extended: true }));

  testApp.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  testApp.use('/api/auth', require('../server/routes/auth'));
  testApp.use('/api/leads', requireAuth, require('../server/routes/leads'));
  testApp.use('/api/templates', requireAuth, require('../server/routes/templates'));
  testApp.use('/api/assets', requireAuth, require('../server/routes/assets'));
  testApp.use('/api/email', requireAuth, require('../server/routes/email'));
  testApp.use('/api/backup', requireAuth, require('../server/routes/backup'));
  testApp.use('/api', requireAuth, require('../server/routes/proxy'));

  return testApp;
}

beforeAll(async () => {
  try {
    pool = require('../server/db');
    await pool.query('SELECT 1');
    // Run migrations to ensure tables exist
    const { runMigrations } = require('../server/migrate');
    await runMigrations();
    app = buildTestApp();
    dbAvailable = true;
  } catch (err) {
    console.warn('Database not available, skipping auth tests:', err.message);
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (pool && dbAvailable) {
    try {
      await pool.end();
    } catch (_) {
      // ignore
    }
  }
});

// ─── Property 8: Auth Session Lifecycle ──────────────────────────────────────
// **Validates: Requirements 3.1, 3.6, 3.7**
describe('Property 8: Auth Session Lifecycle', () => {
  it('login → me returns user → logout → me returns 401', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(usernameArb, passwordArb, async (username, password) => {
        const testUsername = `test_${username}_${Date.now()}`;
        const hash = await bcrypt.hash(password, 10);

        // Insert test user
        await pool.execute(
          'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
          [testUsername, hash, testUsername]
        );

        try {
          // Step 1: Login
          const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: testUsername, password })
            .expect(200);

          expect(loginRes.body).toHaveProperty('username', testUsername);
          const cookie = extractSessionCookie(loginRes);
          expect(cookie).toBeTruthy();

          // Step 2: GET /me with session cookie → 200 with user info
          const meRes = await request(app)
            .get('/api/auth/me')
            .set('Cookie', cookie)
            .expect(200);

          expect(meRes.body).toHaveProperty('username', testUsername);
          expect(meRes.body).toHaveProperty('displayName');

          // Step 3: Logout
          const logoutRes = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', cookie)
            .expect(200);

          expect(logoutRes.body).toHaveProperty('ok', true);

          // Step 4: GET /me after logout → 401
          const meAfterLogout = await request(app)
            .get('/api/auth/me')
            .set('Cookie', cookie)
            .expect(401);

          expect(meAfterLogout.body).toHaveProperty('error');
        } finally {
          // Cleanup: remove test user
          await pool.execute('DELETE FROM users WHERE username = ?', [testUsername]);
        }
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 9: Unauthenticated API Rejection ──────────────────────────────
// **Validates: Requirements 3.4**
describe('Property 9: Unauthenticated API Rejection', () => {
  it('all /api/* endpoints (except /api/auth/login) return 401 without session', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    // Protected endpoints that should return 401 without auth
    const protectedEndpoints = [
      { method: 'get', path: '/api/auth/me' },
      { method: 'post', path: '/api/auth/logout' },
      { method: 'get', path: '/api/leads' },
      { method: 'get', path: '/api/leads/stats' },
      { method: 'post', path: '/api/leads' },
      { method: 'get', path: '/api/templates' },
      { method: 'get', path: '/api/assets' },
      { method: 'get', path: '/api/email/queue' },
      { method: 'get', path: '/api/backup/export' },
    ];

    const endpointArb = fc.constantFrom(...protectedEndpoints);

    await fc.assert(
      fc.asyncProperty(endpointArb, async (endpoint) => {
        const res = await request(app)[endpoint.method](endpoint.path)
          .send(endpoint.method === 'post' ? {} : undefined);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('error');
      }),
      { numRuns: 30 }
    );
  });
});
