# Requirements Document

## Introduction

The Domain Price Checker adds a domain availability and pricing lookup to the LeadForge lead workflow. Before pitching a business, the user needs to know whether a good domain is available and what it costs — this directly affects whether a lead is worth pursuing. The feature auto-suggests domain names from the business name, lets the user edit them freely (since Google Maps names like "ManoleaGouskos - NEO Psychiko" rarely make good domains), checks availability and pricing via a domain API, and saves results to the lead record in MySQL.

## Glossary

- **Domain_Checker**: The subsystem responsible for generating domain suggestions, querying availability/pricing from external APIs, and persisting results to the lead record.
- **Lead**: A business without a website, stored in the `leads` MySQL table, identified by a Google Place ID.
- **Domain_Suggestion**: An auto-generated domain name derived from the business name, presented as an editable text field (e.g. `manoleagouskos.gr`).
- **Domain_Result**: A record containing a domain name, its availability status (available, taken, or error), and its registration price if available.
- **Domain_API**: An external domain registrar API (e.g. GoDaddy, Namecheap) used to check availability and retrieve pricing.
- **LeadDrawer**: The existing slide-out panel component that displays lead details and actions in tabs.

## Requirements

### Requirement 1: Auto-suggest Domain Names from Business Name

**User Story:** As a user, I want to see auto-generated domain suggestions when I open the domain checker for a lead, so that I have a starting point without manual typing.

#### Acceptance Criteria

1. WHEN the user opens the Domain_Checker for a Lead, THE Domain_Checker SHALL generate at least one Domain_Suggestion using the Lead business name by lowercasing it, removing non-alphanumeric characters (preserving hyphens), and appending `.gr` and `.com` TLDs.
2. WHEN the Lead business name contains a location suffix separated by a dash or comma (e.g. "BusinessName - Neighborhood"), THE Domain_Checker SHALL strip the location suffix before generating Domain_Suggestions.
3. THE Domain_Checker SHALL display all generated Domain_Suggestions in an editable text input so the user can modify them before checking.

### Requirement 2: Edit and Add Custom Domain Names

**User Story:** As a user, I want to freely edit suggested domains or type my own, so that I can check domains that make sense for the pitch rather than being locked to the auto-generated name.

#### Acceptance Criteria

1. THE Domain_Checker SHALL allow the user to edit any Domain_Suggestion text before performing an availability check.
2. THE Domain_Checker SHALL allow the user to add additional domain names to the check list manually.
3. THE Domain_Checker SHALL allow the user to remove any domain name from the check list.
4. WHEN the user enters a domain name without a TLD, THE Domain_Checker SHALL append `.gr` as the default TLD.

### Requirement 3: Check Domain Availability and Pricing

**User Story:** As a user, I want to check whether a domain is available and see its price, so that I can decide if this lead is worth pursuing from a cost perspective.

#### Acceptance Criteria

1. WHEN the user triggers a domain check, THE Domain_Checker SHALL query the Domain_API for each domain in the check list and return availability status and registration price.
2. WHILE a domain check is in progress, THE Domain_Checker SHALL display a loading indicator for each domain being checked.
3. THE Domain_Checker SHALL display each Domain_Result with the domain name, availability status (available or taken), and price in EUR when available.
4. THE Domain_Checker SHALL visually distinguish available domains from taken domains using color coding (green for available, red/gray for taken).
5. IF the Domain_API returns an error for a specific domain, THEN THE Domain_Checker SHALL display an error status for that domain and continue checking the remaining domains.
6. IF the Domain_API is unreachable or the API key is not configured, THEN THE Domain_Checker SHALL display a clear error message to the user.

### Requirement 4: Save Domain Check Results to Lead Record

**User Story:** As a user, I want domain check results saved to the lead, so that I can reference them later when deciding which leads to pitch.

#### Acceptance Criteria

1. WHEN domain check results are returned, THE Domain_Checker SHALL persist all Domain_Results (domain name, availability, price, checked timestamp) to the Lead record in the database.
2. WHEN the user opens the Domain_Checker for a Lead that has previous Domain_Results, THE Domain_Checker SHALL display the saved results alongside the option to run a new check.
3. THE Domain_Checker SHALL store the timestamp of the most recent domain check on the Lead record.

### Requirement 5: Domain Checker API Endpoint

**User Story:** As a developer, I want a server-side endpoint that proxies domain availability requests, so that API keys stay on the server and the frontend never exposes them.

#### Acceptance Criteria

1. THE Domain_Checker SHALL expose a `POST /api/domains/check` endpoint that accepts an array of domain names and returns availability and pricing for each.
2. THE Domain_Checker SHALL read the Domain_API credentials from environment variables (`DOMAIN_API_KEY`, `DOMAIN_API_SECRET`).
3. THE Domain_Checker SHALL rate-limit outbound requests to the Domain_API to stay within the registrar's usage limits.
4. IF the Domain_API credentials are missing, THEN THE Domain_Checker SHALL return HTTP 503 with a descriptive error message.

### Requirement 6: Database Schema for Domain Results

**User Story:** As a developer, I want domain results stored in a structured column on the leads table, so that results are queryable and persist across sessions.

#### Acceptance Criteria

1. THE Domain_Checker SHALL add a `domain_results` JSON column to the `leads` table via a migration.
2. THE Domain_Checker SHALL add a `domain_checked_at` TIMESTAMP column to the `leads` table via the same migration.
3. THE Domain_Checker SHALL store Domain_Results as a JSON array where each entry contains: `domain` (string), `available` (boolean), `price` (number or null), and `currency` (string or null).

### Requirement 7: Integration into Lead Workflow UI

**User Story:** As a user, I want the domain checker accessible from the lead detail view, so that it fits naturally into my workflow of evaluating leads.

#### Acceptance Criteria

1. THE Domain_Checker SHALL be accessible as a new tab labeled "Domains" in the LeadDrawer component.
2. WHEN a Lead has at least one available domain in its saved Domain_Results, THE LeadDrawer SHALL display a green badge indicator on the "Domains" tab.
3. WHEN a Lead has domain results where all domains are taken, THE LeadDrawer SHALL display a red/gray badge indicator on the "Domains" tab.
4. THE Domain_Checker tab SHALL display a summary line showing the count of available domains and the lowest price found.
