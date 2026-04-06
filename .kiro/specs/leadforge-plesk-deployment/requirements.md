# Requirements Document

## Introduction

LeadForge is a local-only React + Express lead generation tool that currently runs on localhost with data stored in browser localStorage. This spec covers restructuring the application for production deployment on a Plesk-managed Node.js server at `leadforge.commonsatrium.com`, replacing localStorage with a MySQL backend, adding login authentication, and serving the React frontend as static files from the Express server.

## Glossary

- **LeadForge_App**: The full-stack Node.js application consisting of the Express API server and the React frontend built as static files
- **API_Server**: The Express.js backend that serves the REST API, handles authentication, and serves the static React build from `/public`
- **React_Frontend**: The React single-page application, built via Vite into static files and placed in the `/public` directory
- **MySQL_Database**: The `leadforge_db` MySQL database on localhost, accessed by user `leadforger`, storing all application data (leads, templates, assets, users, email queue)
- **Auth_System**: The session-based login authentication system that protects all API routes and the frontend
- **Plesk_Server**: The Plesk hosting environment at `leadforge.commonsatrium.com` running Node.js 21.7.3 with application root `/leadforge.commonsatrium.com/` and document root `/leadforge.commonsatrium.com/public`
- **Data_Layer**: The server-side module that replaces the browser localStorage store with MySQL queries
- **Lead**: A business record containing name, category, address, contact info, reviews, photos, stage, and other metadata
- **Template**: An email template with variable placeholders (e.g. `{{business_name}}`) used for outreach
- **Asset**: A reusable design resource (code snippet, color palette, image reference, or URL) used in Kiro briefs
- **Email_Queue**: A server-side queue of emails scheduled for sending, with status tracking

## Requirements

### Requirement 1: MySQL Database Schema and Data Layer

**User Story:** As a developer, I want all application data stored in MySQL instead of localStorage, so that data persists across sessions, browsers, and devices.

#### Acceptance Criteria

1. THE Data_Layer SHALL store leads in a `leads` MySQL table with columns matching the current lead object fields: id (VARCHAR primary key from Google place_id), name, category, address, neighborhood, phone, website, rating, review_count, top_reviews (JSON), review_snippet, google_maps_url, photo_refs (JSON), stage, email, email_found, screenshot_files (JSON), demo_url, notes, slug, social (JSON), score, vision_analysis (TEXT), custom_photos (JSON), and created_at
2. THE Data_Layer SHALL store email templates in a `templates` table with columns: id (auto-increment), slug (unique key like 'cold', 'followup'), name, subject, body, and updated_at
3. THE Data_Layer SHALL store assets in an `assets` table with columns: id (VARCHAR), type, name, content (TEXT), filename, instructions, url, notes, and created_at
4. THE Data_Layer SHALL store user accounts in a `users` table with columns: id (auto-increment), username (unique), password_hash, display_name, and created_at
5. THE Data_Layer SHALL store queued emails in an `email_queue` table with columns: id (auto-increment), lead_id, lead_name, recipient, subject, body, attachments (JSON), status (pending/sent/failed), error_message, created_at, and sent_at
6. WHEN the application starts for the first time, THE Data_Layer SHALL run a migration that creates all required tables if they do not exist
7. WHEN the application starts with an empty templates table, THE Data_Layer SHALL seed the four default email templates (cold, followup, short, local) matching the current DEFAULT_TEMPLATES content
8. THE Data_Layer SHALL expose the same CRUD operations currently provided by `store.js`: getLeads, getLead, upsertLead, upsertLeads, updateLead, deleteLead, getStats, getTemplates, saveTemplates, fillTemplate, getAssets, addAsset, updateAsset, deleteAsset, and scoreLead

### Requirement 2: REST API Endpoints

**User Story:** As a developer, I want the Express server to expose REST API endpoints for all data operations, so that the React frontend can fetch and mutate data via HTTP instead of localStorage.

#### Acceptance Criteria

1. THE API_Server SHALL expose GET `/api/leads` returning all leads as a JSON array
2. THE API_Server SHALL expose GET `/api/leads/:id` returning a single lead by id
3. THE API_Server SHALL expose POST `/api/leads` accepting a lead object and inserting or updating the lead in the database
4. THE API_Server SHALL expose POST `/api/leads/bulk` accepting an array of leads and merging them into the database without overwriting existing leads
5. THE API_Server SHALL expose PATCH `/api/leads/:id` accepting partial fields and updating the specified lead
6. THE API_Server SHALL expose DELETE `/api/leads/:id` removing the specified lead from the database
7. THE API_Server SHALL expose GET `/api/leads/stats` returning aggregate lead statistics (total, counts by stage, with email, with phone, average rating)
8. THE API_Server SHALL expose GET `/api/leads/export/csv` returning a CSV file download of all leads
9. THE API_Server SHALL expose GET `/api/templates` and PUT `/api/templates` for reading and saving email templates
10. THE API_Server SHALL expose CRUD endpoints for assets: GET `/api/assets`, POST `/api/assets`, PATCH `/api/assets/:id`, DELETE `/api/assets/:id`
11. THE API_Server SHALL expose email queue endpoints: POST `/api/email/queue` to add an email, GET `/api/email/queue` to list queued emails, DELETE `/api/email/queue/:id` to remove one, and POST `/api/email/queue/clear-sent` to remove sent entries
12. WHEN any API endpoint encounters a database error, THE API_Server SHALL return an appropriate HTTP status code (400, 404, or 500) with a JSON error message

### Requirement 3: Authentication System

**User Story:** As the application owner, I want login authentication protecting the application, so that only authorized users can access LeadForge.

#### Acceptance Criteria

1. THE Auth_System SHALL provide a POST `/api/auth/login` endpoint accepting username and password, returning a session cookie on success
2. THE Auth_System SHALL hash passwords using bcrypt with a minimum cost factor of 10
3. THE Auth_System SHALL use express-session with a server-side session store for session management
4. WHEN an unauthenticated request is made to any `/api/*` endpoint (except `/api/auth/login`), THE Auth_System SHALL return HTTP 401 with a JSON error message
5. WHEN an unauthenticated request is made to the React frontend routes, THE Auth_System SHALL serve the login page instead of the application
6. THE Auth_System SHALL provide a POST `/api/auth/logout` endpoint that destroys the session
7. THE Auth_System SHALL provide a GET `/api/auth/me` endpoint returning the current user's display_name and username if authenticated
8. WHEN the application starts with an empty users table, THE Auth_System SHALL create a default admin user with credentials read from environment variables `ADMIN_USER` and `ADMIN_PASS`

### Requirement 4: React Frontend Restructuring

**User Story:** As a developer, I want the React frontend to call the API server instead of localStorage, so that the app works as a proper client-server application.

#### Acceptance Criteria

1. THE React_Frontend SHALL replace all `store.js` localStorage calls with HTTP fetch calls to the corresponding `/api/*` endpoints
2. THE React_Frontend SHALL include a login page that appears when the user is not authenticated
3. WHEN the login page receives valid credentials, THE React_Frontend SHALL redirect to the main application view
4. WHEN any API call returns HTTP 401, THE React_Frontend SHALL redirect the user to the login page
5. THE React_Frontend SHALL be built using `vite build` with the output directory set to `public/`
6. THE React_Frontend SHALL retain all existing UI pages and functionality: Lead Search, Lead List, Email Templates, Kiro Brief, Assets Library, and Settings

### Requirement 5: Express Server as Plesk Node.js App

**User Story:** As a developer, I want the Express server configured as a Plesk-compatible Node.js application, so that it runs correctly under Plesk's Node.js hosting.

#### Acceptance Criteria

1. THE API_Server SHALL use `app.js` as the startup file in the application root `/leadforge.commonsatrium.com/`
2. THE API_Server SHALL serve the built React static files from the `public/` directory using `express.static`
3. THE API_Server SHALL handle client-side routing by serving `public/index.html` for any non-API, non-static request (SPA fallback)
4. THE API_Server SHALL read all configuration (database credentials, API keys, SMTP settings, session secret) from environment variables or a `.env` file
5. THE API_Server SHALL listen on the port provided by the `PORT` environment variable, falling back to 3000
6. THE API_Server SHALL consolidate the current `proxy/index.js` routes under the `/api/` prefix alongside the new data endpoints
7. WHEN the API_Server starts, THE API_Server SHALL log a startup message including the port number and Node.js version

### Requirement 6: Proxy Routes Migration

**User Story:** As a developer, I want the existing proxy routes (Google Places, Hunter.io, email, screenshots, photo analysis, lead folders, common assets) migrated into the main Express server, so that a single Node.js process handles everything.

#### Acceptance Criteria

1. THE API_Server SHALL serve Google Places search, details, and photo proxy routes under `/api/places/*`
2. THE API_Server SHALL serve Hunter.io domain search and email finder routes under `/api/hunter/*`
3. THE API_Server SHALL serve email sending and SMTP test routes under `/api/email/*`
4. THE API_Server SHALL serve screenshot and video capture routes under `/api/screenshot` and `/api/video`
5. THE API_Server SHALL serve photo analysis (Claude Vision) routes under `/api/analyze/*`
6. THE API_Server SHALL serve lead folder management routes (create, delete, list images, download photos, save brief) under `/api/lead-folder/*`
7. THE API_Server SHALL serve common asset management routes (inbox listing, manifest, sort-inbox) under `/api/common-assets/*`
8. THE API_Server SHALL serve static files from the `sites/` directory for lead images under `/api/lead-images/*`
9. THE API_Server SHALL serve static files from the `common-assets/` directory under `/api/common-assets-files/*`
10. THE API_Server SHALL serve the social enrichment route under `/api/enrich/social`
11. THE API_Server SHALL serve the config endpoint under `/api/config`

### Requirement 7: Environment Configuration

**User Story:** As a developer, I want all secrets and configuration managed through environment variables, so that the application is secure and configurable per environment.

#### Acceptance Criteria

1. THE LeadForge_App SHALL read database connection details from environment variables: `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`
2. THE LeadForge_App SHALL read API keys from environment variables: `GOOGLE_PLACES_API_KEY`, `HUNTER_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`
3. THE LeadForge_App SHALL read SMTP configuration from environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_NAME`
4. THE LeadForge_App SHALL read authentication configuration from environment variables: `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASS`
5. THE LeadForge_App SHALL include a `.env.example` file documenting all required and optional environment variables
6. THE LeadForge_App SHALL NOT commit the `.env` file to the Git repository

### Requirement 8: Git Repository and Deployment Structure

**User Story:** As a developer, I want the repository structured for Plesk auto-deployment, so that pushing to the GitHub repo triggers a working deployment.

#### Acceptance Criteria

1. THE LeadForge_App SHALL have `app.js` at the repository root as the Node.js entry point
2. THE LeadForge_App SHALL include a `build` script in `package.json` that runs `vite build` to generate the `public/` directory
3. THE LeadForge_App SHALL include `public/` in `.gitignore` so that built files are not committed
4. WHEN Plesk pulls from the Git repository, THE Plesk_Server SHALL run `npm install` and `npm run build` to prepare the application
5. THE LeadForge_App SHALL include a `.gitignore` that excludes `node_modules/`, `.env`, `public/`, `screenshots/`, and `sites/` lead data
6. THE LeadForge_App SHALL organize server-side code in a `server/` directory containing the database module, route handlers, and middleware

### Requirement 9: Data Migration from localStorage

**User Story:** As the application owner, I want to migrate existing lead data from the local JSON backup into MySQL, so that no data is lost during the transition.

#### Acceptance Criteria

1. THE LeadForge_App SHALL include a migration script (`scripts/migrate-data.js`) that reads `data/leads-backup.json` and inserts all leads into the MySQL `leads` table
2. WHEN a lead in the backup file already exists in the database (matching id), THE migration script SHALL skip the duplicate lead without error
3. WHEN the migration script completes, THE migration script SHALL print the count of leads imported and skipped

### Requirement 10: Backup and Data Persistence

**User Story:** As the application owner, I want server-side data backup capabilities, so that lead data is protected against loss.

#### Acceptance Criteria

1. THE API_Server SHALL expose a GET `/api/backup/export` endpoint that returns all leads as a JSON file download
2. THE API_Server SHALL expose a POST `/api/backup/import` endpoint that accepts a JSON array of leads and merges them into the database
3. THE API_Server SHALL continue to support CSV export via the `/api/leads/export/csv` endpoint
