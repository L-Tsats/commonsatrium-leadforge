# Implementation Plan: LeadForge Plesk Deployment

## Overview

Restructure LeadForge from a dual-process localhost setup into a single-process production Node.js app with MySQL, session auth, and Plesk deployment. Tasks are ordered so each step builds on the previous — starting with the data layer, then API routes, auth, frontend migration, proxy consolidation, and finally wiring everything together.

## Tasks

- [x] 1. Set up project dependencies and server entry point
  - [x] 1.1 Install new dependencies (`mysql2`, `express-session`, `bcrypt`) and dev dependencies (`vitest`, `fast-check`, `supertest`)
    - Add to `package.json` and update scripts: add `"server": "node app.js"`, update `"build": "vite build --outDir public"`
    - _Requirements: 1.6, 5.1, 5.5, 8.2_

  - [x] 1.2 Create `app.js` entry point
    - Load dotenv, initialize Express with JSON body parsing (10mb limit)
    - Configure express-session
    - Run migrations on startup via `server/migrate.js`
    - Mount auth middleware, static file serving from `public/`, SPA fallback
    - Listen on `PORT` env var (default 3000), log startup message with port and Node.js version
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [x] 1.3 Create `server/db.js` database connection pool
    - Export a `mysql2/promise` pool configured from `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` env vars
    - Set `waitForConnections: true`, `connectionLimit: 10`
    - _Requirements: 1.1, 7.1_

  - [x] 1.4 Create `server/migrate.js` schema migration
    - Create all 5 tables (`leads`, `templates`, `assets`, `users`, `email_queue`) with `CREATE TABLE IF NOT EXISTS`
    - Seed default templates when templates table is empty
    - Seed default admin user from `ADMIN_USER`/`ADMIN_PASS` env vars when users table is empty (bcrypt hash, cost 10+)
    - Exit process with code 1 if database is unreachable
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 3.2, 3.8_

  - [ ]* 1.5 Write property test for migration idempotence
    - **Property 1: Migration Idempotence**
    - Run migration N times, verify all tables exist and no errors or duplicate data
    - **Validates: Requirements 1.6**

  - [ ]* 1.6 Write property test for bcrypt cost factor
    - **Property 10: Bcrypt Cost Factor**
    - Create users, verify stored password_hash is valid bcrypt with cost factor >= 10
    - **Validates: Requirements 3.2**

- [x] 2. Checkpoint — Verify database layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement authentication system
  - [x] 3.1 Create `server/auth.js` with session config and `requireAuth` middleware
    - Export session middleware configuration
    - Export `requireAuth(req, res, next)` that returns 401 JSON if no valid session
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 3.2 Create `server/routes/auth.js` route module
    - POST `/api/auth/login` — validate credentials with bcrypt, create session, return user info
    - POST `/api/auth/logout` — destroy session
    - GET `/api/auth/me` — return current user info or 401
    - _Requirements: 3.1, 3.6, 3.7_

  - [x] 3.3 Write property test for auth session lifecycle
    - **Property 8: Auth Session Lifecycle**
    - Login → me returns user → logout → me returns 401
    - **Validates: Requirements 3.1, 3.6, 3.7**

  - [x] 3.4 Write property test for unauthenticated API rejection
    - **Property 9: Unauthenticated API Rejection**
    - All `/api/*` endpoints (except `/api/auth/login`) return 401 without session
    - **Validates: Requirements 3.4**

- [x] 4. Implement leads API routes
  - [x] 4.1 Create `server/routes/leads.js` with CRUD endpoints
    - GET `/api/leads` — return all leads as JSON array
    - GET `/api/leads/:id` — return single lead by id (404 if not found)
    - POST `/api/leads` — upsert a lead
    - POST `/api/leads/bulk` — merge array of leads without overwriting existing
    - PATCH `/api/leads/:id` — partial update
    - DELETE `/api/leads/:id` — remove lead
    - Implement camelCase ↔ snake_case field mapping for all queries/responses
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.12_

  - [x] 4.2 Add stats and CSV export endpoints to leads routes
    - GET `/api/leads/stats` — return total, stage counts, withEmail, withPhone, avgRating
    - GET `/api/leads/export/csv` — return CSV file download with all leads
    - _Requirements: 2.7, 2.8, 10.3_

  - [x] 4.3 Write property test for lead CRUD round-trip
    - **Property 2: Lead CRUD Round-Trip**
    - Generate random leads, insert via POST, retrieve via GET, compare field values
    - **Validates: Requirements 1.8, 2.1, 2.2, 2.3, 2.6**

  - [x] 4.4 Write property test for bulk merge preserving existing leads
    - **Property 3: Bulk Merge Preserves Existing Leads**
    - Generate existing + incoming leads, merge, verify existing unchanged and new added
    - **Validates: Requirements 2.4, 10.1, 10.2**

  - [x] 4.5 Write property test for partial update
    - **Property 4: Partial Update Preserves Unmodified Fields**
    - Generate lead + random field subset, patch, verify unmodified fields unchanged
    - **Validates: Requirements 2.5**

  - [x] 4.6 Write property test for stats computation
    - **Property 5: Stats Computation Correctness**
    - Generate random leads, compute expected stats, compare with endpoint response
    - **Validates: Requirements 2.7**

  - [x] 4.7 Write property test for CSV export completeness
    - **Property 6: CSV Export Completeness**
    - Generate leads, export CSV, parse and verify one row per lead with correct fields
    - **Validates: Requirements 2.8, 10.3**

- [x] 5. Implement templates, assets, and email queue routes
  - [x] 5.1 Create `server/routes/templates.js`
    - GET `/api/templates` — return all templates
    - PUT `/api/templates` — save/update templates
    - _Requirements: 2.9_

  - [x] 5.2 Create `server/routes/assets.js`
    - GET `/api/assets` — list all assets
    - POST `/api/assets` — create asset
    - PATCH `/api/assets/:id` — update asset
    - DELETE `/api/assets/:id` — delete asset
    - _Requirements: 2.10_

  - [x] 5.3 Create `server/routes/email.js`
    - POST `/api/email/queue` — add email to queue
    - GET `/api/email/queue` — list queued emails
    - DELETE `/api/email/queue/:id` — remove entry
    - POST `/api/email/queue/clear-sent` — remove sent entries
    - Migrate existing email send/test routes from proxy
    - _Requirements: 2.11_

  - [ ]* 5.4 Write property test for entity CRUD round-trip
    - **Property 7: Entity CRUD Round-Trip (Templates, Assets, Email Queue)**
    - Generate templates/assets/queue entries, create → read → delete cycle, verify consistency
    - **Validates: Requirements 2.9, 2.10, 2.11**

- [x] 6. Checkpoint — Verify all API routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement backup and data migration
  - [x] 7.1 Create `server/routes/backup.js`
    - GET `/api/backup/export` — return all leads as JSON file download
    - POST `/api/backup/import` — accept JSON array of leads, merge into database with deduplication
    - _Requirements: 10.1, 10.2_

  - [x] 7.2 Create `scripts/migrate-data.js`
    - Read `data/leads-backup.json`, insert leads into MySQL, skip duplicates
    - Print count of imported and skipped leads on completion
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.3 Write property test for data migration deduplication
    - **Property 11: Data Migration with Deduplication**
    - Generate backup + existing leads, run migration logic, verify counts and no duplicates
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 8. Migrate proxy routes into server
  - [x] 8.1 Create `server/routes/proxy.js` with migrated proxy routes
    - Move Google Places routes to `/api/places/*`
    - Move Hunter.io routes to `/api/hunter/*`
    - Move screenshot/video routes to `/api/screenshot`, `/api/video`
    - Move photo analysis route to `/api/analyze/photos`
    - Move lead folder routes to `/api/lead-folder/*`
    - Move common assets routes to `/api/common-assets/*`
    - Move social enrichment to `/api/enrich/social`
    - Move config endpoint to `/api/config`
    - Serve static files: `sites/` under `/api/lead-images`, `common-assets/` under `/api/common-assets-files`, `screenshots/` under `/api/screenshots`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [x] 8.2 Mount all route modules in `app.js`
    - Wire auth, leads, templates, assets, email, backup, and proxy route modules
    - Apply `requireAuth` middleware to all `/api/*` routes except `/api/auth/login`
    - _Requirements: 3.4, 5.6_

- [x] 9. Restructure React frontend for API calls
  - [x] 9.1 Create `src/lib/api.js` replacing localStorage calls
    - Implement fetch wrappers for all `/api/*` endpoints (leads, templates, assets, email, backup, proxy)
    - Add global 401 interceptor that redirects to login page
    - Use relative URLs (no hardcoded port)
    - _Requirements: 4.1, 4.4_

  - [x] 9.2 Create `src/pages/LoginPage.jsx`
    - Username/password form, POST to `/api/auth/login`
    - On success redirect to main app, on failure show error
    - _Requirements: 4.2, 4.3_

  - [x] 9.3 Update `App.jsx` to check auth state and show login
    - On mount, call GET `/api/auth/me` to check session
    - If unauthenticated, render LoginPage
    - If authenticated, render existing app
    - _Requirements: 4.2, 4.4_

  - [x] 9.4 Update all page components to use `api.js` instead of `store.js`
    - Replace `store.js` imports with `api.js` calls in every page component
    - Keep `store.js` only for client-side utilities (scoreLead, toSlug, fillTemplate, etc.)
    - _Requirements: 4.1, 4.6_

- [x] 10. Update configuration and deployment files
  - [x] 10.1 Update `.env.example` with all required variables
    - Add `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`, `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`
    - Document all existing and new env vars
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 10.2 Update `.gitignore` for production
    - Add `public/`, `screenshots/`, `sites/` to gitignore
    - Ensure `.env` and `node_modules/` are excluded
    - _Requirements: 7.6, 8.3, 8.5_

  - [x] 10.3 Update `package.json` scripts for production
    - Update `build` script to `vite build --outDir public`
    - Add `start` script pointing to `node app.js`
    - _Requirements: 8.2, 8.4_

  - [x] 10.4 Update Vite config for `public/` output
    - Set `build.outDir` to `public` in `vite.config.js`
    - _Requirements: 4.5, 8.2_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The proxy migration (task 8) preserves all existing functionality from `proxy/index.js`
- Frontend restructuring (task 9) keeps all existing UI pages intact
