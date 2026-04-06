// Feature: leadforge-plesk-deployment, Property 2: Lead CRUD Round-Trip
// Feature: leadforge-plesk-deployment, Property 3: Bulk Merge Preserves Existing Leads
// Feature: leadforge-plesk-deployment, Property 4: Partial Update Preserves Unmodified Fields
// Feature: leadforge-plesk-deployment, Property 5: Stats Computation Correctness
// Feature: leadforge-plesk-deployment, Property 6: CSV Export Completeness

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
let sessionCookie = null;

const TEST_ADMIN = { username: 'leads_test_admin_' + Date.now(), password: 'testpass1234' };

// Track all test lead IDs for cleanup
const createdLeadIds = new Set();

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
 * Build a minimal Express app mirroring app.js config for testing.
 */
function buildTestApp() {
  const testApp = express();
  const { requireAuth } = require('../server/auth');

  testApp.use(express.json({ limit: '10mb' }));
  testApp.use(express.urlencoded({ extended: true }));

  testApp.use(
    session({
      secret: 'test-secret-leads',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  testApp.use('/api/auth', require('../server/routes/auth'));
  testApp.use('/api/leads', requireAuth, require('../server/routes/leads'));

  return testApp;
}

/**
 * Arbitrary: generate a valid lead object for testing.
 * Uses lead_test_ prefix + unique suffix to avoid collisions.
 */
let leadCounter = 0;
const leadArb = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
    category: fc.string({ maxLength: 80 }),
    stage: fc.constantFrom('new', 'emailed', 'in_progress', 'site_built', 'closed'),
    rating: fc.double({ min: 0, max: 5, noNaN: true, noDefaultInfinity: true }).map((v) =>
      parseFloat(v.toFixed(1))
    ),
    reviewCount: fc.nat({ max: 9999 }),
    email: fc.option(
      fc.tuple(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
        fc.constantFrom('test.com', 'example.org', 'mail.net')
      ).map(([local, domain]) => `${local}@${domain}`),
      { nil: null }
    ),
    phone: fc.option(
      fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 7, maxLength: 15 }).map(
        (s) => '+' + s
      ),
      { nil: null }
    ),
  })
  .map((lead) => ({
    ...lead,
    id: `lead_test_${Date.now()}_${++leadCounter}_${Math.random().toString(36).slice(2, 8)}`,
  }));

/**
 * Helper: authenticated request builder
 */
function authGet(path) {
  return request(app).get(path).set('Cookie', sessionCookie);
}
function authPost(path) {
  return request(app).post(path).set('Cookie', sessionCookie);
}
function authPatch(path) {
  return request(app).patch(path).set('Cookie', sessionCookie);
}
function authDelete(path) {
  return request(app).delete(path).set('Cookie', sessionCookie);
}

/**
 * Helper: insert a lead and track for cleanup
 */
async function insertLead(lead) {
  const res = await authPost('/api/leads').send(lead);
  createdLeadIds.add(lead.id);
  return res;
}

/**
 * Helper: cleanup a specific lead
 */
async function cleanupLead(id) {
  try {
    await authDelete(`/api/leads/${id}`);
  } catch (_) { /* ignore */ }
  createdLeadIds.delete(id);
}

/**
 * Helper: cleanup all tracked leads
 */
async function cleanupAllLeads() {
  for (const id of createdLeadIds) {
    try {
      await pool.execute('DELETE FROM leads WHERE id = ?', [id]);
    } catch (_) { /* ignore */ }
  }
  createdLeadIds.clear();
}

// ─── Setup & Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    pool = require('../server/db');
    await pool.query('SELECT 1');
    const { runMigrations } = require('../server/migrate');
    await runMigrations();
    app = buildTestApp();
    dbAvailable = true;

    // Create test admin user
    const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
    await pool.execute(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [TEST_ADMIN.username, hash, TEST_ADMIN.username]
    );

    // Login to get session cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN.username, password: TEST_ADMIN.password });
    sessionCookie = extractSessionCookie(loginRes);

    if (!sessionCookie) {
      throw new Error('Failed to obtain session cookie');
    }
  } catch (err) {
    console.warn('Database not available, skipping leads tests:', err.message);
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (pool && dbAvailable) {
    try {
      await cleanupAllLeads();
      await pool.execute('DELETE FROM users WHERE username = ?', [TEST_ADMIN.username]);
      await pool.end();
    } catch (_) { /* ignore */ }
  }
});

// ─── Property 2: Lead CRUD Round-Trip ────────────────────────────────────────
// **Validates: Requirements 1.8, 2.1, 2.2, 2.3, 2.6**
describe('Property 2: Lead CRUD Round-Trip', () => {
  it('inserting a lead via POST and retrieving via GET returns matching field values', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(leadArb, async (lead) => {
        // POST to create/upsert the lead
        const postRes = await insertLead(lead);
        expect(postRes.status).toBe(200);

        // GET the lead by id
        const getRes = await authGet(`/api/leads/${lead.id}`);
        expect(getRes.status).toBe(200);

        const retrieved = getRes.body;
        expect(retrieved.id).toBe(lead.id);
        expect(retrieved.name).toBe(lead.name);
        expect(retrieved.category).toBe(lead.category);
        expect(retrieved.stage).toBe(lead.stage);
        expect(parseFloat(retrieved.rating)).toBeCloseTo(lead.rating, 1);
        expect(retrieved.reviewCount).toBe(lead.reviewCount);
        expect(retrieved.email ?? null).toBe(lead.email ?? null);
        expect(retrieved.phone ?? null).toBe(lead.phone ?? null);

        // DELETE to clean up
        const delRes = await authDelete(`/api/leads/${lead.id}`);
        expect(delRes.status).toBe(200);
        createdLeadIds.delete(lead.id);

        // Verify deletion
        const getAfterDel = await authGet(`/api/leads/${lead.id}`);
        expect(getAfterDel.status).toBe(404);
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 3: Bulk Merge Preserves Existing Leads ─────────────────────────
// **Validates: Requirements 2.4, 10.1, 10.2**
describe('Property 3: Bulk Merge Preserves Existing Leads', () => {
  it('bulk merge does not overwrite existing leads and adds new ones', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(leadArb, { minLength: 1, maxLength: 3 }),
        fc.array(leadArb, { minLength: 1, maxLength: 3 }),
        async (existingLeads, newLeads) => {
          // Insert existing leads one by one
          for (const lead of existingLeads) {
            await insertLead(lead);
          }

          // Snapshot existing leads from DB before merge
          const snapshots = {};
          for (const lead of existingLeads) {
            const res = await authGet(`/api/leads/${lead.id}`);
            expect(res.status).toBe(200);
            snapshots[lead.id] = res.body;
          }

          // Build incoming array: mix of existing (should be skipped) + new
          const incoming = [
            ...existingLeads.map((l) => ({ ...l, name: l.name + '_MODIFIED' })),
            ...newLeads,
          ];
          // Track new lead IDs for cleanup
          for (const lead of newLeads) {
            createdLeadIds.add(lead.id);
          }

          // Bulk merge
          const bulkRes = await authPost('/api/leads/bulk').send(incoming);
          expect(bulkRes.status).toBe(200);

          // Verify existing leads are unchanged
          for (const lead of existingLeads) {
            const res = await authGet(`/api/leads/${lead.id}`);
            expect(res.status).toBe(200);
            expect(res.body.name).toBe(snapshots[lead.id].name);
          }

          // Verify new leads were added
          for (const lead of newLeads) {
            const res = await authGet(`/api/leads/${lead.id}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(lead.id);
          }

          // Cleanup
          for (const lead of [...existingLeads, ...newLeads]) {
            await cleanupLead(lead.id);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 4: Partial Update Preserves Unmodified Fields ──────────────────
// **Validates: Requirements 2.5**
describe('Property 4: Partial Update Preserves Unmodified Fields', () => {
  it('PATCH only changes specified fields, leaving others intact', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    const patchableFields = ['name', 'category', 'stage', 'email', 'phone', 'rating', 'reviewCount'];

    const patchArb = fc.record({
      name: fc.option(fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0), { nil: undefined }),
      category: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
      stage: fc.option(fc.constantFrom('new', 'emailed', 'in_progress', 'site_built', 'closed'), { nil: undefined }),
      email: fc.option(
        fc.tuple(
          fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }),
          fc.constantFrom('test.com', 'example.org')
        ).map(([local, domain]) => `${local}@${domain}`),
        { nil: undefined }
      ),
    }).filter((patch) => {
      // Ensure at least one field is defined
      return Object.values(patch).some((v) => v !== undefined);
    });

    await fc.assert(
      fc.asyncProperty(leadArb, patchArb, async (lead, patch) => {
        // Insert the lead
        await insertLead(lead);

        // Snapshot before patch
        const beforeRes = await authGet(`/api/leads/${lead.id}`);
        expect(beforeRes.status).toBe(200);
        const before = beforeRes.body;

        // Build patch body (only defined fields)
        const patchBody = {};
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) {
            patchBody[key] = value;
          }
        }

        // PATCH
        const patchRes = await authPatch(`/api/leads/${lead.id}`).send(patchBody);
        expect(patchRes.status).toBe(200);

        // GET after patch
        const afterRes = await authGet(`/api/leads/${lead.id}`);
        expect(afterRes.status).toBe(200);
        const after = afterRes.body;

        // Verify patched fields have new values
        for (const [key, value] of Object.entries(patchBody)) {
          if (key === 'rating') {
            expect(parseFloat(after[key])).toBeCloseTo(parseFloat(value), 1);
          } else {
            expect(after[key]).toBe(value);
          }
        }

        // Verify unmodified fields are unchanged
        const unmodifiedFields = patchableFields.filter((f) => !(f in patchBody));
        for (const field of unmodifiedFields) {
          if (field === 'rating') {
            if (before[field] != null && after[field] != null) {
              expect(parseFloat(after[field])).toBeCloseTo(parseFloat(before[field]), 1);
            }
          } else {
            expect(after[field]).toEqual(before[field]);
          }
        }

        // Cleanup
        await cleanupLead(lead.id);
      }),
      { numRuns: 10 }
    );
  });
});

// ─── Property 5: Stats Computation Correctness ──────────────────────────────
// **Validates: Requirements 2.7**
describe('Property 5: Stats Computation Correctness', () => {
  it('stats endpoint returns correct totals, stage counts, withEmail, withPhone, and avgRating', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(leadArb, { minLength: 1, maxLength: 5 }),
        async (leads) => {
          // Clean any pre-existing test leads to get accurate stats
          // First, delete all leads with our test prefix
          await pool.execute("DELETE FROM leads WHERE id LIKE 'lead_test_%'");
          createdLeadIds.clear();

          // Insert all leads
          for (const lead of leads) {
            await insertLead(lead);
          }

          // Compute expected stats
          const expectedTotal = leads.length;
          const expectedStages = {};
          let expectedWithEmail = 0;
          let expectedWithPhone = 0;
          let ratingSum = 0;
          let ratingCount = 0;

          for (const lead of leads) {
            const stage = lead.stage || 'unknown';
            expectedStages[stage] = (expectedStages[stage] || 0) + 1;
            if (lead.email != null) expectedWithEmail++;
            if (lead.phone != null) expectedWithPhone++;
            if (lead.rating != null) {
              ratingSum += lead.rating;
              ratingCount++;
            }
          }

          const expectedAvgRating =
            ratingCount > 0 ? parseFloat((ratingSum / ratingCount).toFixed(2)) : null;

          // GET stats
          const statsRes = await authGet('/api/leads/stats');
          expect(statsRes.status).toBe(200);

          const stats = statsRes.body;
          expect(stats.total).toBe(expectedTotal);
          expect(stats.withEmail).toBe(expectedWithEmail);
          expect(stats.withPhone).toBe(expectedWithPhone);

          // Verify stage counts
          for (const [stage, count] of Object.entries(expectedStages)) {
            expect(stats.stages[stage]).toBe(count);
          }

          // Verify avgRating
          if (expectedAvgRating !== null) {
            expect(parseFloat(stats.avgRating)).toBeCloseTo(expectedAvgRating, 1);
          }

          // Cleanup
          for (const lead of leads) {
            await cleanupLead(lead.id);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});

// ─── Property 6: CSV Export Completeness ─────────────────────────────────────
// **Validates: Requirements 2.8, 10.3**
describe('Property 6: CSV Export Completeness', () => {
  it('CSV export contains one row per lead with correct field values', async () => {
    if (!dbAvailable) {
      console.warn('Skipping: database not available');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(leadArb, { minLength: 1, maxLength: 5 }),
        async (leads) => {
          // Clean any pre-existing test leads
          await pool.execute("DELETE FROM leads WHERE id LIKE 'lead_test_%'");
          createdLeadIds.clear();

          // Insert all leads
          for (const lead of leads) {
            await insertLead(lead);
          }

          // GET CSV export
          const csvRes = await authGet('/api/leads/export/csv');
          expect(csvRes.status).toBe(200);
          expect(csvRes.headers['content-type']).toContain('text/csv');

          const csvText = csvRes.text;
          const lines = csvText.trim().split('\n');

          // First line is header
          const header = lines[0];
          expect(header).toContain('name');
          expect(header).toContain('category');
          expect(header).toContain('email');
          expect(header).toContain('phone');
          expect(header).toContain('stage');
          expect(header).toContain('rating');

          // Data rows: one per lead
          const dataLines = lines.slice(1);
          expect(dataLines.length).toBe(leads.length);

          // Verify each lead's name appears in the CSV
          for (const lead of leads) {
            const found = dataLines.some((line) => line.includes(lead.name) || line.includes('"' + lead.name.replace(/"/g, '""') + '"'));
            expect(found).toBe(true);
          }

          // Cleanup
          for (const lead of leads) {
            await cleanupLead(lead.id);
          }
        }
      ),
      { numRuns: 10 }
    );
  });
});
