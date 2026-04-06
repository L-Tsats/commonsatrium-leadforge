# Design Document: LeadForge Plesk Deployment

## Overview

This design restructures LeadForge from a dual-process local development setup (Vite dev server + Express proxy on port 3001) into a single-process production Node.js application deployed on Plesk at `leadforge.commonsatrium.com`. The key changes are:

1. Replace browser localStorage with a MySQL database (`leadforge_db`)
2. Consolidate the proxy server (`proxy/index.js`) and new data API routes into a single Express app (`app.js`)
3. Add session-based authentication with bcrypt password hashing
4. Build the React frontend with Vite into `public/` and serve it as static files
5. Organize all server code under `server/`

The application will run as a single Node.js 21.7.3 process under Plesk, with `app.js` as the entry point. All existing proxy routes move from `/proxy/*` to `/api/*`, and new CRUD routes are added for leads, templates, assets, email queue, and backup.

## Architecture

```mermaid
graph TB
    subgraph Plesk Server
        APP[app.js - Entry Point]
        APP --> AUTH[Auth Middleware]
        AUTH --> STATIC[express.static - public/]
        AUTH --> API_ROUTES[/api/* Routes]
        
        subgraph "server/"
            DB[db.js - MySQL Pool]
            MIGRATE[migrate.js - Schema + Seeds]
            AUTH_MOD[auth.js - Session + bcrypt]
            ROUTES_LEADS[routes/leads.js]
            ROUTES_TEMPLATES[routes/templates.js]
            ROUTES_ASSETS[routes/assets.js]
            ROUTES_EMAIL[routes/email.js]
            ROUTES_BACKUP[routes/backup.js]
            ROUTES_PROXY[routes/proxy.js - Migrated proxy routes]
        end
        
        API_ROUTES --> ROUTES_LEADS
        API_ROUTES --> ROUTES_TEMPLATES
        API_ROUTES --> ROUTES_ASSETS
        API_ROUTES --> ROUTES_EMAIL
        API_ROUTES --> ROUTES_BACKUP
        API_ROUTES --> ROUTES_PROXY
        
        ROUTES_LEADS --> DB
        ROUTES_TEMPLATES --> DB
        ROUTES_ASSETS --> DB
        ROUTES_EMAIL --> DB
        AUTH_MOD --> DB
        
        DB --> MYSQL[(MySQL - leadforge_db)]
    end
    
    subgraph Client Browser
        REACT[React SPA - built to public/]
        REACT -->|fetch /api/*| API_ROUTES
        REACT -->|static files| STATIC
    end
```

### Request Flow

1. All requests hit `app.js`
2. Static files from `public/` are served without auth (CSS, JS, images)
3. `/api/auth/login` is the only unprotected API route
4. All other `/api/*` routes require a valid session (HTTP 401 otherwise)
5. Non-API, non-static requests get `public/index.html` (SPA fallback), but only if authenticated — otherwise they get the login page

### New Dependencies

| Package | Purpose |
|---------|---------|
| `mysql2` | MySQL client with promise support |
| `express-session` | Server-side session management |
| `bcrypt` | Password hashing (cost factor 10+) |

Existing dependencies (`express`, `cors`, `axios`, `nodemailer`, `dotenv`, `puppeteer`) remain unchanged.

## Components and Interfaces

### 1. `app.js` — Entry Point

The root entry point that Plesk starts. Responsibilities:
- Load `.env` via `dotenv`
- Initialize Express with JSON body parsing (10mb limit)
- Configure `express-session` with MySQL or memory store
- Run database migration on startup (`server/migrate.js`)
- Mount auth middleware
- Serve `public/` as static files
- Mount all `/api/*` route modules
- SPA fallback for client-side routing
- Listen on `PORT` env var (default 3000)
- Log startup message with port and Node.js version

### 2. `server/db.js` — Database Connection Pool

Exports a `mysql2/promise` connection pool configured from environment variables. All route handlers use this shared pool.

```javascript
// Interface
pool.query(sql, params)  // → [rows, fields]
pool.execute(sql, params) // → [rows, fields] (prepared statement)
```

### 3. `server/migrate.js` — Schema Migration & Seeds

Runs on every app startup. Creates tables if they don't exist, seeds default templates and admin user.

```javascript
// Interface
async function runMigrations(pool) // Creates tables, seeds data
```

### 4. `server/auth.js` — Authentication Middleware

Exports session configuration and the `requireAuth` middleware function.

```javascript
// Interface
function requireAuth(req, res, next) // Returns 401 if no session
```

### 5. Route Modules

Each module exports an Express Router:

| Module | Prefix | Description |
|--------|--------|-------------|
| `server/routes/auth.js` | `/api/auth` | Login, logout, me |
| `server/routes/leads.js` | `/api/leads` | CRUD, stats, CSV export |
| `server/routes/templates.js` | `/api/templates` | Read/save templates |
| `server/routes/assets.js` | `/api/assets` | CRUD for design assets |
| `server/routes/email.js` | `/api/email` | Send, queue, batch send |
| `server/routes/backup.js` | `/api/backup` | JSON export/import |
| `server/routes/proxy.js` | `/api` | Migrated proxy routes (places, hunter, screenshots, etc.) |

### 6. `src/lib/api.js` — Updated Frontend API Client

All fetch calls change from `/proxy/*` to `/api/*`. Adds 401 interception to redirect to login. No more hardcoded port 3001 — relative URLs work since the same server serves both static files and API.

### 7. `src/lib/store.js` — Replaced with API Calls

The localStorage-based store is replaced. Each page component calls `api.js` functions instead of `store.js` functions. The `store.js` file is kept only for client-side utilities that don't involve persistence (e.g., `scoreLead`, `toSlug`, `SOCIAL_META`, `fillTemplate`, `buildAssetsBlock`).

### 8. Login Page Component

New React component at `src/pages/LoginPage.jsx`. Simple form with username/password fields. On success, redirects to the main app. The `App.jsx` component checks auth state on mount via `GET /api/auth/me`.

## Data Models

### MySQL Schema

#### `leads` table
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(255) PRIMARY KEY | Google place_id |
| name | VARCHAR(255) NOT NULL | |
| category | VARCHAR(255) | |
| address | TEXT | |
| neighborhood | VARCHAR(255) | |
| phone | VARCHAR(50) | |
| website | VARCHAR(500) | |
| rating | DECIMAL(2,1) | |
| review_count | INT DEFAULT 0 | |
| top_reviews | JSON | Array of review objects |
| review_snippet | TEXT | |
| google_maps_url | VARCHAR(500) | |
| photo_refs | JSON | Array of photo reference strings |
| stage | VARCHAR(50) DEFAULT 'new' | new, emailed, in_progress, site_built, closed |
| email | VARCHAR(255) | |
| email_found | BOOLEAN DEFAULT FALSE | |
| screenshot_files | JSON | Array of filenames |
| demo_url | VARCHAR(500) | |
| notes | TEXT | |
| slug | VARCHAR(100) | |
| social | JSON | Social media links object |
| score | INT | Computed lead score |
| vision_analysis | TEXT | Claude vision output |
| custom_photos | JSON | Array of custom photo data |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

#### `templates` table
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PRIMARY KEY | |
| slug | VARCHAR(50) UNIQUE NOT NULL | cold, followup, short, local |
| name | VARCHAR(255) NOT NULL | |
| subject | VARCHAR(500) | |
| body | TEXT | |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | |

#### `assets` table
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(50) PRIMARY KEY | e.g. asset_1700000000 |
| type | VARCHAR(50) NOT NULL | snippet, palette, image, url |
| name | VARCHAR(255) NOT NULL | |
| content | TEXT | Code/text content |
| filename | VARCHAR(255) | For image assets |
| instructions | TEXT | Usage instructions |
| url | VARCHAR(500) | For URL-type assets |
| notes | TEXT | |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

#### `users` table
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PRIMARY KEY | |
| username | VARCHAR(100) UNIQUE NOT NULL | |
| password_hash | VARCHAR(255) NOT NULL | bcrypt hash |
| display_name | VARCHAR(255) | |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

#### `email_queue` table
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PRIMARY KEY | |
| lead_id | VARCHAR(255) | FK reference to leads.id |
| lead_name | VARCHAR(255) | Denormalized for display |
| recipient | VARCHAR(255) NOT NULL | |
| subject | VARCHAR(500) | |
| body | TEXT | |
| attachments | JSON | Array of attachment filenames |
| status | ENUM('pending','sent','failed') DEFAULT 'pending' | |
| error_message | TEXT | |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |
| sent_at | TIMESTAMP NULL | |

### Field Mapping: localStorage → MySQL

The frontend currently uses camelCase keys. The MySQL columns use snake_case. The data layer handles this mapping transparently — rows returned from queries are converted to camelCase objects before being sent as JSON responses. Incoming JSON bodies are converted to snake_case for SQL inserts/updates.



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Migration Idempotence

*For any* database state, running the migration function multiple times should produce the same result as running it once — all tables exist, no errors are thrown, and no data is duplicated or lost.

**Validates: Requirements 1.6**

### Property 2: Lead CRUD Round-Trip

*For any* valid lead object (with a non-empty id, name, and valid field types), inserting it via POST `/api/leads` and then retrieving it via GET `/api/leads/:id` should return an object with the same field values as the original.

**Validates: Requirements 1.8, 2.1, 2.2, 2.3, 2.6**

### Property 3: Bulk Merge Preserves Existing Leads

*For any* set of existing leads in the database and any set of incoming leads (via POST `/api/leads/bulk` or POST `/api/backup/import`), after the merge: (a) all previously existing leads retain their original field values, and (b) new leads (with ids not in the existing set) are added to the database.

**Validates: Requirements 2.4, 10.1, 10.2**

### Property 4: Partial Update Preserves Unmodified Fields

*For any* lead in the database and any subset of fields provided via PATCH `/api/leads/:id`, the fields not included in the patch should remain unchanged, and the patched fields should reflect the new values.

**Validates: Requirements 2.5**

### Property 5: Stats Computation Correctness

*For any* set of leads in the database, GET `/api/leads/stats` should return a `total` equal to the number of leads, stage counts that sum to the total, `withEmail` equal to the count of leads with a non-null email, and `avgRating` equal to the arithmetic mean of all lead ratings.

**Validates: Requirements 2.7**

### Property 6: CSV Export Completeness

*For any* set of leads in the database, the CSV returned by GET `/api/leads/export/csv` should contain exactly one data row per lead, and each row should contain the lead's name, category, address, and email.

**Validates: Requirements 2.8, 10.3**

### Property 7: Entity CRUD Round-Trip (Templates, Assets, Email Queue)

*For any* valid template object, asset object, or email queue entry, creating it via the respective POST endpoint and then retrieving it via the GET endpoint should return an object with matching field values. Deleting it should cause it to no longer appear in the list.

**Validates: Requirements 2.9, 2.10, 2.11**

### Property 8: Auth Session Lifecycle

*For any* valid username/password pair in the users table, POST `/api/auth/login` should return a session cookie, subsequent GET `/api/auth/me` with that cookie should return the user's info, and POST `/api/auth/logout` should invalidate the session such that further `/api/auth/me` calls return 401.

**Validates: Requirements 3.1, 3.6, 3.7**

### Property 9: Unauthenticated API Rejection

*For any* API endpoint path under `/api/*` (except `/api/auth/login`), a request without a valid session cookie should receive an HTTP 401 response with a JSON error body.

**Validates: Requirements 3.4**

### Property 10: Bcrypt Cost Factor

*For any* user created in the system (including the default admin), the stored `password_hash` should be a valid bcrypt hash with a cost factor of at least 10.

**Validates: Requirements 3.2**

### Property 11: Data Migration with Deduplication

*For any* set of leads in a JSON backup file and any set of leads already in the database, running the migration script should insert only leads whose ids are not already present, skip duplicates without error, and report accurate imported/skipped counts.

**Validates: Requirements 9.1, 9.2, 9.3**

## Error Handling

### API Error Responses

All API endpoints follow a consistent error response format:

```json
{
  "error": "Human-readable error message"
}
```

| Scenario | HTTP Status | Example |
|----------|-------------|---------|
| Invalid request body / missing fields | 400 | `{"error": "Lead id is required"}` |
| Not authenticated | 401 | `{"error": "Authentication required"}` |
| Resource not found | 404 | `{"error": "Lead not found"}` |
| Database error / server error | 500 | `{"error": "Database connection failed"}` |

### Database Connection Failures

- The MySQL pool is configured with `waitForConnections: true` and a connection limit of 10
- If the database is unreachable on startup, the migration logs the error and the process exits with code 1 (Plesk will restart it)
- Transient query failures return 500 to the client with the error message

### Authentication Errors

- Invalid credentials on login return 401 with `{"error": "Invalid username or password"}`
- Expired or invalid sessions return 401 — the frontend intercepts this and redirects to login
- The session secret must be set via `SESSION_SECRET` env var; if missing, the app logs a warning and uses a fallback (development only)

### External API Failures (Google, Hunter, Anthropic, Perplexity)

- All proxy routes wrap external calls in try/catch
- Failures return 500 with the upstream error message
- Rate limiting from external APIs (e.g., Anthropic 429) is retried up to 3 times with backoff (existing behavior preserved from proxy/index.js)

### Frontend Error Handling

- All `api.js` functions check `r.ok` and throw on non-2xx responses
- A global fetch wrapper intercepts 401 responses and triggers redirect to login
- Network errors display a toast/notification to the user

## Testing Strategy

### Testing Framework

- **Unit/Integration tests**: [Vitest](https://vitest.dev/) (already compatible with the Vite setup)
- **Property-based testing**: [fast-check](https://github.com/dubzzz/fast-check) (JavaScript PBT library)
- **HTTP testing**: [supertest](https://github.com/ladakh/supertest) for Express route testing

### Unit Tests

Unit tests cover specific examples, edge cases, and error conditions:

- Migration creates all 5 tables with correct columns
- Default templates are seeded when templates table is empty
- Default admin user is created from env vars when users table is empty
- Login with wrong password returns 401
- SPA fallback serves index.html for unknown routes
- CSV export produces valid CSV with correct headers
- camelCase ↔ snake_case field mapping is correct
- Empty database returns empty arrays for list endpoints

### Property-Based Tests

Each correctness property from the design is implemented as a single property-based test using fast-check. Configuration:

- Minimum 100 iterations per property test
- Each test is tagged with a comment: `// Feature: leadforge-plesk-deployment, Property {N}: {title}`
- Tests use an in-memory or test MySQL database to avoid polluting production data
- Generators produce random lead objects, template objects, asset objects, and user credentials

Property tests to implement:

1. **Feature: leadforge-plesk-deployment, Property 1: Migration Idempotence** — Run migration N times, verify tables exist and no errors
2. **Feature: leadforge-plesk-deployment, Property 2: Lead CRUD Round-Trip** — Generate random leads, insert, retrieve, compare
3. **Feature: leadforge-plesk-deployment, Property 3: Bulk Merge Preserves Existing** — Generate existing + incoming leads, merge, verify existing unchanged
4. **Feature: leadforge-plesk-deployment, Property 4: Partial Update Preserves Unmodified** — Generate lead + random field subset, patch, verify
5. **Feature: leadforge-plesk-deployment, Property 5: Stats Computation** — Generate random leads, compute expected stats, compare with endpoint
6. **Feature: leadforge-plesk-deployment, Property 6: CSV Export Completeness** — Generate leads, export CSV, parse and verify row count
7. **Feature: leadforge-plesk-deployment, Property 7: Entity CRUD Round-Trip** — Generate templates/assets/queue entries, CRUD cycle
8. **Feature: leadforge-plesk-deployment, Property 8: Auth Session Lifecycle** — Generate credentials, login → me → logout → verify 401
9. **Feature: leadforge-plesk-deployment, Property 9: Unauthenticated Rejection** — Generate random API paths, verify 401 without session
10. **Feature: leadforge-plesk-deployment, Property 10: Bcrypt Cost Factor** — Generate passwords, create users, verify hash cost
11. **Feature: leadforge-plesk-deployment, Property 11: Data Migration Dedup** — Generate backup + existing leads, run migration, verify counts

### Test Data Generators (fast-check)

```javascript
// Lead generator
fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  category: fc.string({ maxLength: 100 }),
  stage: fc.constantFrom('new', 'emailed', 'in_progress', 'site_built', 'closed'),
  rating: fc.float({ min: 0, max: 5, noNaN: true }),
  reviewCount: fc.nat({ max: 10000 }),
  email: fc.option(fc.emailAddress()),
  phone: fc.option(fc.string({ maxLength: 20 }))
})
```
