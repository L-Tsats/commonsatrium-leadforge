# Implementation Plan: Domain Price Checker

## Overview

Add a "Domains" tab to the LeadDrawer that auto-suggests domain names from the business name, checks availability and pricing via the GoDaddy API (server-side proxy), and persists results to the lead's MySQL record. Implementation follows the existing Express + React architecture with a new server route, client-side domain suggestion logic, and a new DomainsTab component.

## Tasks

- [x] 1. Database schema and lead field mapping
  - [x] 1.1 Add `domain_results` JSON and `domain_checked_at` TIMESTAMP columns to the leads table
    - Add ALTER TABLE statements in `server/migrate.js` for `domain_results` (JSON DEFAULT NULL) and `domain_checked_at` (TIMESTAMP NULL)
    - _Requirements: 6.1, 6.2_
  - [x] 1.2 Update field mappings in `server/routes/leads.js`
    - Add `domainResults: 'domain_results'` and `domainCheckedAt: 'domain_checked_at'` to `FIELD_MAP`
    - Add `'domain_results'` to `JSON_COLUMNS`
    - Add `'domain_results'` and `'domain_checked_at'` to `ALL_COLUMNS`
    - _Requirements: 6.3, 4.1_

- [ ] 2. Server-side domain check endpoint
  - [x] 2.1 Create `server/routes/domains.js` with `POST /check`
    - Validate `DOMAIN_API_KEY` and `DOMAIN_API_SECRET` env vars → 503 if missing
    - Validate `req.body.domains` is a non-empty array → 400 if empty
    - For each domain, call GoDaddy `GET /v1/domains/available?domain={domain}` with `Authorization: sso-key {KEY}:{SECRET}`
    - Convert price from micros (price / 1_000_000) and normalize currency
    - Sequential requests with 300ms delay for rate limiting
    - Isolate per-domain errors: failed domains get `{ available: null, error: "..." }`, others continue
    - Return `{ results: [{ domain, available, price, currency }] }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 3.1, 3.5, 3.6_
  - [x] 2.2 Mount the domains route in `app.js`
    - Add `app.use('/api/domains', requireAuth, require('./server/routes/domains'))` before the catch-all proxy route
    - _Requirements: 5.1_
  - [~] 2.3 Write property test for domain check endpoint contract (Property 3)
    - **Property 3: Domain check endpoint returns one result per input domain with required fields**
    - **Validates: Requirements 3.1, 5.1, 6.3**
  - [ ]* 2.4 Write property test for error isolation (Property 4)
    - **Property 4: Domain check error isolation — failed domains don't block others**
    - **Validates: Requirements 3.5**

- [x] 3. Checkpoint — Ensure server-side works
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Client-side domain suggestion logic
  - [x] 4.1 Create `src/lib/domains.js` with `generateDomainSuggestions` and `normalizeDomain`
    - `generateDomainSuggestions(name)`: strip location suffix after ` - ` or `, `, lowercase, remove non-alphanumeric (keep hyphens), generate variants (full, first-two-words, first-word), append `.gr` and `.com`, deduplicate
    - `normalizeDomain(input)`: trim, lowercase, append `.gr` if no dot present
    - _Requirements: 1.1, 1.2, 2.4_
  - [~] 4.2 Write property test for domain suggestion generation (Property 1)
    - **Property 1: Domain suggestion generation produces valid domains from cleaned business names**
    - **Validates: Requirements 1.1, 1.2**
  - [ ]* 4.3 Write property test for domain normalization (Property 2)
    - **Property 2: Domain normalization appends .gr when no TLD present**
    - **Validates: Requirements 2.4**

- [x] 5. API client and DomainsTab component
  - [x] 5.1 Add `checkDomains` function to `src/lib/api.js`
    - `export async function checkDomains(domains) { return post('/api/domains/check', { domains }) }`
    - _Requirements: 3.1_
  - [x] 5.2 Create `src/components/DomainsTab.jsx`
    - State: `domains` (editable list), `results` (check results or loaded from lead), `checking` (loading), `error`
    - Props: `{ lead, onSave, toast }`
    - Domain input list with add/remove buttons, pre-populated from `generateDomainSuggestions(lead.name)`
    - "Check" button triggers `checkDomains`, shows loading indicator per domain
    - Results display: color-coded cards (green=available, gray=taken, red=error) with domain name, availability, price in EUR
    - Summary line: "X available · cheapest: €Y.YY"
    - Load and display previous results from `lead.domainResults` with `lead.domainCheckedAt` timestamp
    - On check completion, save results via `onSave({ domainResults, domainCheckedAt })` to persist to lead
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 7.4_
  - [ ]* 5.3 Write property test for badge color logic (Property 6)
    - **Property 6: Badge color is determined by domain availability**
    - **Validates: Requirements 7.2, 7.3**
  - [ ]* 5.4 Write property test for summary computation (Property 7)
    - **Property 7: Summary computation returns correct available count and lowest price**
    - **Validates: Requirements 7.4**

- [ ] 6. LeadDrawer integration
  - [x] 6.1 Add "Domains" tab to `LeadDrawer.jsx`
    - Add `{ key: 'domains', label: 'Domains' }` to the `tabs` array
    - Render `<DomainsTab>` when `tab === 'domains'`
    - Add badge logic on the Domains tab: green badge if any `lead.domainResults` has `available: true`, red/gray if all taken, no badge if no results
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]* 6.2 Write property test for persistence round trip (Property 5)
    - **Property 5: Domain results persistence round trip — save and read back preserves all fields**
    - **Validates: Requirements 4.1, 4.3**

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use `fast-check` (already in devDependencies) with `vitest`
- The GoDaddy API key/secret go in `.env` as `DOMAIN_API_KEY` and `DOMAIN_API_SECRET`
