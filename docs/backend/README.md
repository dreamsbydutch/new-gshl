# Apps Script Backend

Authoritative runbook for the Google Apps Script workers that power every backend data mutation for GSHL. Apps Script owns the full data pipeline—scraping, calculations, aggregations, validation, and persistence to Google Sheets. Everything else in the stack (Next.js app, cron lambdas, TRPC API) is read-only.

```
Yahoo Fantasy → Apps Script jobs → Google Sheets → Next.js (read-only UI)
```

## Mission & Principles

- Apps Script is the **sole data manipulation layer**: it fetches, computes, and writes.
- Google Sheets is the **database**: single source of truth for every stat table.
- Next.js is the **display layer**: it never writes to Sheets.
- Data flows in one direction only: `Yahoo → Apps Script → Sheets → Next.js → Users`.
- New data sources or analytics always land in Sheets first, keeping downstream consumers decoupled.

## System Architecture

```
┌─────────────┐
│  Yahoo API  │  External data source
└──────┬──────┘
       │
       ↓
┌────────────────────────────────────────────┐
│            APPS SCRIPT (Data Engine)       │
│  - Fetch from Yahoo & other providers      │
│  - Calculate ratings, lineups, aggregates  │
│  - Run validations + maintenance           │
│  - Write results to Google Sheets          │
└──────────────┬─────────────────────────────┘
               │
               ↓
┌────────────────────────────────────────────┐
│            GOOGLE SHEETS (Database)        │
│  - Master schema for player/team data      │
│  - Read by every consumer                  │
└──────────────┬─────────────────────────────┘
               │
               ↓
┌────────────────────────────────────────────┐
│            NEXT.JS (Display Layer)         │
│  - Reads Sheets via API / caching          │
│  - Presents data to users                  │
└────────────────────────────────────────────┘
```

## Data Pipeline (End-to-End)

| Phase                           | Goal                                                          | Primary Writes                                         |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 1. Yahoo Scraping               | Capture raw roster + stat snapshots                           | `PlayerDayStatLine`, `TeamDayStatLine`                 |
| 2. Lineup & Rating Calc         | Compute best/full lineups, MS/BS/ADD, ranking scores          | Updates `PlayerDay` & `TeamDay` rows                   |
| 3. Player Aggregations          | Roll day data into week/split/season totals with ratings      | `PlayerWeek`, `PlayerSplit`, `PlayerTotal`             |
| 4. Team Aggregations & Matchups | Build team summaries, matchup outcomes, standings deltas      | `TeamWeek`, `TeamSeason`, `Matchup`, `Standings`       |
| 5. Validation & Maintenance     | Catch missing data, rerun corrections, refresh derived fields | `ValidationLog`, `ProcessingLog`, targeted sheet fixes |

## Directory Layout (`apps-script/`)

```
├── config/Config.js             # Spreadsheet ids, league metadata, feature flags
├── core/
│   ├── environment.js           # Script-property cache + verbose/dry-run helpers
│   ├── formatting.js            # Date, numeric, string, age helpers
│   ├── sheets/sheetSchemas.js   # Sheet metadata + type coercion utilities
│   └── utils.js                 # Legacy helpers awaiting extraction
├── features/
│   ├── aggregation/             # Player/team/day/week aggregations + matchups
│   ├── lineup/LineupBuilder.js  # Hybrid optimizer powering best/full lineups
│   ├── ranking/                 # Ranking runtime, config, generated models
│   ├── scrapers/YahooScraper.js # Primary Yahoo roster ingestion + writes
│   └── validation/IntegrityChecks.js # Automated integrity sweeps
├── maintenance/
│   ├── PlayerAgeUpdater.js      # Age recalcs using shared formatting helpers
│   └── RatingRecalculator.js    # Historical rating replays
└── package.json                 # clasp + lint scripts
```

### Config Layer

`config/Config.js` centralizes workbook IDs (current PlayerDay archive, Team stats, etc.), Yahoo metadata, and default feature flags. Add new constants here so the same knobs exist for local scripts, Apps Script runtime, and CI secrets.

### Core Layer

| File                          | Purpose                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/environment.js`         | Wraps Script Properties, exposing `isVerboseLoggingEnabled`, `isDryRunModeEnabled`, and `logVerbose`. Use these helpers instead of touching `PropertiesService`.      |
| `core/formatting.js`          | Shared date + string utilities (`formatDateOnly`, Yahoo date parsing, name normalization, numeric coercion, `calculateAgeWithDecimal`).                               |
| `core/sheets/sheetSchemas.js` | Declares sheet schemas (key columns, numeric/date/boolean buckets) and helpers like `getSheetSchema`, `coerceSheetValue`, `stringifySheetValue`, `matchupHasOutcome`. |
| `core/utils.js`               | Transitional home for legacy helpers (`fetchSheetAsObjects`, `upsertSheetByKeys`, etc.). Extract functionality into targeted files when refactoring.                  |

### Feature Modules

- **Scrapers (`features/scrapers/YahooScraper.js`)** – `updatePlayerDays` ingests Yahoo rosters, enriches with rankings/lineups, and upserts PlayerDay + TeamDay sheets (with delete-on-missing for drops).
- **Lineup Optimizer (`features/lineup/LineupBuilder.js`)** – greedy + exhaustive fallback algorithm that emits `fullPos`, `bestPos`, `MS`, `BS`, `ADD`. Details: `docs/backend/LINEUP_OPTIMIZER.md`.
- **Ranking (`features/ranking/`)** – `RankingEngine.js`, `RankingConfig.js`, and generated `RankingModels.js` supply percentile-based scores used everywhere. Details: `docs/backend/RANKING_ENGINE.md`.
- **Aggregation (`features/aggregation/`)** – `playerStats.js`, `teamStats.js`, `matchups.js`, plus supporting helpers/constants compose the season/week/day rollups. `StatsAggregator.js` now only proxies legacy triggers to these modules.
- **Validation (`features/validation/IntegrityChecks.js`)** – `runIntegrityChecks` and friends scan PlayerDay/TeamWeek/Matchup windows for anomalies, logging to `ValidationLog` unless dry-run mode skips writes.

### Maintenance Jobs

| File                    | Summary                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `PlayerAgeUpdater.js`   | Batch or single-player age recalculation fed by `calculateAgeWithDecimal`. Recommended nightly trigger after roster sync. |
| `RatingRecalculator.js` | Replays ranking calculations across historical slices when models change; logs per-row diffs for auditability.            |

## Operations & Triggers

Set these inside the Apps Script UI (`clasp open` → Triggers). Use environment flags to toggle verbosity or dry-run mode without redeploying.

| Function                                             | Typical Trigger                                                      | Notes                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `updatePlayerDays`                                   | Multiple time-driven windows (15 min during games, hourly otherwise) | Primary Yahoo roster ingest and PlayerDay/TeamDay writer.              |
| `updateTeamStatsForSeason`, `updateMatchupsForWeek`  | Manual or scheduled batch windows                                    | Player/team aggregation and matchup generation.                        |
| `runIntegrityChecks`                                 | Nightly or on-demand                                                 | Accepts filters (`targetDate`, `seasonId`) and honors dry-run setting. |
| `updateAllPlayerAges`                                | Nightly                                                              | Keeps Player sheet ages current.                                       |
| `recalculateRatingsForDateRange` (or similar helper) | Manual                                                               | Rebuilds cached ratings when ranking models change.                    |

## Setup & Deployment

1. `cd apps-script`
2. `npm install` (installs `@google/clasp` locally)
3. `clasp login`
4. (First time) `clasp create --type standalone --title "GSHL Cron Jobs"`
5. Update `config/Config.js` with the correct spreadsheet + league IDs.
6. `clasp push` to deploy the transpiled bundle.
7. `clasp open` to configure triggers or run jobs manually.
8. `clasp logs --watch` for streaming execution logs during long batches.

## Environment Flags

Managed via Script Properties (Project Settings → Script properties) and surfaced through `core/environment.js`.

| Property          | Default | Effect                                                    |
| ----------------- | ------- | --------------------------------------------------------- |
| `VERBOSE_LOGGING` | `true`  | Enables `logVerbose` calls for per-row diagnostics.       |
| `DRY_RUN_MODE`    | `false` | Skips sheet mutations but still runs the logic + logging. |

Unset properties fall back to defaults defined in `config/Config.js` (e.g., `ENABLE_VERBOSE_LOGGING`). Always query the helpers, not `PropertiesService` directly, to guarantee consistent caching behavior.

## Working With Sheets

- Read data through `fetchSheetAsObjects` so column headers map predictably.
- Use `getSheetSchema`, `coerceSheetValue`, and `stringifySheetValue` for type-safe serialization.
- `upsertSheetByKeys` remains the primary writer; pass `deleteMissing` when a sheet should mirror a full slice (e.g., all PlayerDay rows for a date).
- `matchupHasOutcome` and related helpers live alongside schemas to keep business logic next to field metadata.

## Testing & Observability

- Prefer `logVerbose` for noisy output so the flag can mute chatter in production.
- Run scrapers in dry-run mode when vetting new logic—logs will show the pending writes without touching Sheets.
- Aggregation helpers accept explicit ranges (`seasonId`, `weekId`, `startDate`, `endDate`) for controlled replays.
- Use `clasp logs --watch` while long-running jobs execute to catch failures quickly.

## Troubleshooting

- **"Script not found"**: ensure `.clasp.json` contains the target `scriptId` and that you ran `clasp create` from the `apps-script` directory.
- **Scraper missing data**: verify spreadsheet IDs in `config/Config.js`, confirm Team sheet has Yahoo IDs, and check `updatePlayerDays` logs.
- **Triggers idle**: confirm time-driven trigger windows in the Apps Script UI and verify timezone via `appsscript.json` (should be `America/New_York`).
- **Yahoo auth errors**: confirm environment variables for the Next.js server (for training/export workflows) and re-run token generation if needed.

## Extending the Backend

1. Decide if the feature belongs to an existing module (scraper, aggregation, etc.) or warrants a new folder under `features/`.
2. Add configuration knobs to `config/Config.js` and document them inline.
3. Rely on `core/environment.js` and `core/formatting.js` helpers to avoid inconsistent flag/date handling.
4. Update `core/sheets/sheetSchemas.js` whenever a sheet gains new fields or type overrides.
5. Document the new entry point + trigger expectations in this README so operations has a single reference.

## Related Backend Documents

- `docs/backend/LINEUP_OPTIMIZER.md` – deep dive on lineup optimization.
- `docs/backend/RANKING_ENGINE.md` – ranking model training + runtime details.
- `docs/backend/YAHOO_SCRAPER.md` – Yahoo API client + endpoint reference.

> 🛈 There is intentionally **no documentation inside `apps-script/`** anymore. All backend runbooks now live under `docs/backend/` to keep the repo’s knowledge base centralized.
