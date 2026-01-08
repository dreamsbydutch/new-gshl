# Copilot instructions (GSHL - Apps Script)

## Scope

- This document applies only to `apps-script/**`.
- Do not assume runtime coupling with the Next.js app; this code runs in Google Apps Script and writes directly to Google Sheets.

## Big picture (data engine)

- `apps-script/` is the primary data manipulation layer: scrape/compute/aggregate/validate → persist to Sheets.
- Entry-point trigger functions live at repo root of this folder (e.g. `AggregationJobs.js`) and should stay thin wrappers around feature modules.

## Project layout (where to add code)

- Configuration: `apps-script/config/Config.js` (spreadsheet IDs, league constants, feature flags).
- Shared runtime helpers:
  - `apps-script/core/environment.js` (Script Properties flags, verbose/dry-run helpers)
  - `apps-script/core/utils.js` (date/name/number helpers, sheet read/write, upserts)
  - `apps-script/core/sheetSchemas.js` (schema metadata used for coercion/upserts)
- Feature modules:
  - Scraper: `apps-script/features/scrapers/YahooScraper.js`
  - Ranking runtime: `apps-script/features/ranking/*`
  - Aggregations/matchups: `apps-script/features/aggregation/*`
  - Validation: `apps-script/features/validation/IntegrityChecks.js`
  - Maintenance jobs: `apps-script/maintenance/*`

## Coding conventions (GAS-specific)

- This codebase is **JavaScript-first** (mostly `.js`). Avoid introducing TypeScript files/build steps unless the repo explicitly adds them later.
- Prefer plain JS compatible with Apps Script runtime (no Node APIs, no filesystem, no `process.env`, no fetch polyfills).
- Keep trigger functions small and delegate to feature modules (see `apps-script/AggregationJobs.js`).
- Use the schema helpers when reading/writing Sheets; avoid ad-hoc coercion.

## Operations (clasp)

- From `apps-script/`:
  - Install deps: `npm install`
  - Login: `npm run login`
  - Push: `npm run push`
  - Open editor: `npm run open`
  - Tail logs: `npm run logs`

## Flags & safety

- Use `core/environment.js` helpers instead of calling `PropertiesService` directly.
- Honor dry-run / verbose logging flags when implementing write-heavy workflows.
