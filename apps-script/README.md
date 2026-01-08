# GSHL Apps Script - Yahoo Roster Scraper

> **Core Purpose:**  
> This Apps Script project scrapes Yahoo Fantasy Hockey rosters and writes PlayerDay records to Google Sheets.
>
> It serves as the **primary data writer** for GSHL. The Next.js app only reads from Sheets - all data writes happen here.

## Architecture

```
Yahoo Fantasy → Apps Script (scrape & write) → Google Sheets → Next.js (read only)
```

**Key Principle:** Apps Script is the data manipulation layer. Next.js is the display layer.

## What This Does

1. **Yahoo Roster Scraping**: Fetches daily roster data from Yahoo Fantasy Hockey
2. **Data Writing**: Writes PlayerDay records to Google Sheets
3. **Schema Understanding**: Reads from the Google Sheets schema (Team, Season, Week, Player tables)

## File Layout

```
apps-script/
   config/Config.js                 # Spreadsheet + league/config constants
   core/constants.js                # Shared constants
   core/environment.js              # Script Properties flags (verbose/dry-run)
   core/sheetSchemas.js             # Schema + coercion metadata
   core/utils.js                    # Shared helpers + sheet read/write
   features/
      scrapers/YahooScraper.js       # Yahoo roster ingestion + PlayerDay writes
      lineup/LineupBuilder.js        # Hybrid optimizer powering best/full lineups
      ranking/                       # Ranking engine + config + generated models
         RankingConfig.js
         RankingEngine.js
         RankingModels.js
      aggregation/StatsAggregator.js # Player/team/week aggregation + matchup math
      validation/IntegrityChecks.js  # Automated integrity checks + ValidationLog writes
   maintenance/
      PlayerAgeUpdater.js            # Player master data refresh
   README.md
```

## Google Sheets Schema

The scraper reads from and writes to these tables:

**Read From:**

- **Team** - GSHL franchises and their Yahoo team IDs
- **Season** - Current season info
- **Week** - Week start/end dates
- **Player** - Player master data (Yahoo IDs, names, positions)

**Write To:**

- **PlayerDay** - Daily player roster records (positions, stats, IR status, opponent, etc.)

## Setup

### Prerequisites

1. Install `clasp` globally:

   ```bash
   npm install -g @google/clasp
   ```

2. Login to clasp:
   ```bash
   clasp login
   ```

### Initial Deployment

1. Create a new Apps Script project:

   ```bash
   cd apps-script
   clasp create --type standalone --title "GSHL Cron Jobs"
   ```

2. This will create a `.clasp.json` file with your script ID.

3. Update the `config/Config.js` file with your configuration.

4. Deploy the code:

   ```bash
   clasp push
   ```

5. Open the project in the Apps Script editor:

   ```bash
   clasp open
   ```

6. In the Apps Script editor, set up time-based triggers for each function.

### Language & Runtime

This project is **JavaScript-first** and targets the Google Apps Script runtime.

- Avoid Node-only APIs (`fs`, `process.env`, etc.)
- Use `@types/google-apps-script` for editor IntelliSense

## Configuration

Edit `config/Config.js` to configure:

- `SPREADSHEET_ID` (general workbook)
- `PLAYERDAY_WORKBOOKS` + `CURRENT_PLAYERDAY_SPREADSHEET_ID`
- `PLAYERSTATS_SPREADSHEET_ID` + `TEAMSTATS_SPREADSHEET_ID`
- `YAHOO_LEAGUE_ID`
- Defaults for `ENABLE_VERBOSE_LOGGING` + `ENABLE_DRY_RUN_MODE`

### Environment Flags

You can toggle diagnostic behavior without redeploying by setting **Script Properties** inside the Apps Script editor (Project Settings → Script properties). Two flags are available:

| Property          | Description                                                                        | Default |
| ----------------- | ---------------------------------------------------------------------------------- | ------- |
| `VERBOSE_LOGGING` | Enables verbose per-row log statements (`true` / `false`).                         | `true`  |
| `DRY_RUN_MODE`    | Skips sheet mutations while still computing changes and logging what would happen. | `false` |

If a property is unset, the default defined in `config/Config.js` (`ENABLE_VERBOSE_LOGGING`, `ENABLE_DRY_RUN_MODE`) is used.

### Validation Checks

Run automated integrity checks directly within Apps Script (or via clasp) to verify PlayerDay, TeamWeek, and Matchup health:

```javascript
runIntegrityChecks(); // defaults to today + active week
runIntegrityChecks({ targetDate: "2025-11-17" });
runIntegrityChecks({ seasonId: "12" });
```

Results are logged to the console and appended to the `ValidationLog` sheet (unless `DRY_RUN_MODE` is enabled). Each row captures the timestamp, target date, check key, outcome, and sample issues to aid debugging.

### Sheet Schemas

Lightweight schema metadata now lives alongside the shared utilities (`core/utils.js`). Each sheet exposes:

- `description` and `category` (core vs stat tables)
- `keyColumns` used for upserts
- Field-type groupings (numeric/date/datetime/boolean)

Use `getSheetSchema("PlayerDayStatLine")` or `getSheetKeyColumns("TeamWeekStatLine")` inside Apps Script to introspect the definitions, and the reader/serializer helpers automatically lean on these schemas when coercing sheet values.

### Initial Setup

1. Navigate to the apps-script directory:

   ```bash
   cd apps-script
   ```

2. Create a new Apps Script project:

   ```bash
   clasp create --title "GSHL Yahoo Scraper" --type standalone
   ```

3. Update `config/Config.js` with your IDs:

   - `SPREADSHEET_ID` - Your Google Sheets spreadsheet ID
   - `YAHOO_LEAGUE_ID` - Your Yahoo Fantasy Hockey league ID

4. Deploy the code:

   ```bash
   clasp push
   ```

5. Open the Apps Script editor:
   ```bash
   clasp open
   ```

### Setting Up Time-Based Triggers

In the Apps Script editor:

1. Click **Triggers** (clock icon on left sidebar)
2. Click **+ Add Trigger**
3. Set up trigger for `updatePlayerDays`:
   - Function: `updatePlayerDays`
   - Deployment: `Head`
   - Event source: `Time-driven`
   - Type: Choose based on your needs:
     - **Every 15 minutes** (during game times)
     - **Hourly** (pre-game)
     - **Day timer** (morning updates)

## Usage

### Running the Scraper

From the Apps Script editor:

1. Open the script: `clasp open`
2. Select `updatePlayerDays` from the function dropdown
3. Click **Run**
4. View **Execution log** to see:
   - Teams and season/week info read from Sheets
   - Yahoo roster fetch progress
   - All PlayerDay records that would be written
   - Summary of scraped data

The scraper upserts into Sheets using `upsertSheetByKeys`.
To run safely without mutations, enable `DRY_RUN_MODE` in Script Properties.

### Viewing Logs

```bash
clasp logs
```

Or view in the Apps Script editor under **Executions**.

## Files

- `.clasp.json` - Clasp configuration (created after `clasp create`)
- `.claspignore` - Exclude files from deployment
- `appsscript.json` - Apps Script manifest (runtime settings)
- `config/Config.js` - Configuration (Spreadsheet ID, League ID)
- `core/environment.js` - Script Properties flags (verbose/dry-run)
- `core/sheetSchemas.js` - Schema definitions used for coercion/upserts
- `core/utils.js` - Shared sheet/date/helpers + upsert utilities
- `features/scrapers/YahooScraper.js` - Main scraper logic
- `features/lineup/LineupBuilder.js` - Lineup optimizer
- `features/ranking/` - Ranking engine, config, and generated models
- `features/aggregation/StatsAggregator.js` - Aggregation + matchup logic
- `maintenance/PlayerAgeUpdater.js` - Player metadata upkeep
- `package.json` - NPM scripts for convenience

## Troubleshooting

**"Script not found" error:**

- Make sure you've run `clasp create` first
- Check that `.clasp.json` has a valid `scriptId`

**Scraper not finding data:**

- Verify `SPREADSHEET_ID` in `config/Config.js` is correct
- Check that the Team sheet has Yahoo team IDs populated
- View execution logs with `clasp logs`

**Triggers not firing:**

- Check trigger configuration in the Apps Script editor
- Ensure timezone is set to `America/New_York` in `appsscript.json`
- View execution history in the Apps Script editor

## Player Age Updater

The **PlayerAgeUpdater.js** script provides automated age calculation for all players in the Player table.

### Features

- Calculates player age to **one decimal place** based on birth date
- Accounts for leap years (uses 365.25 days per year)
- Handles missing or invalid birth dates gracefully
- Batch updates all players or individual players by ID
- Detailed logging of all updates

### Main Functions

#### `updateAllPlayerAges()`

Updates ages for all players in the Player table.

```javascript
// Run manually or set up a trigger
updateAllPlayerAges();
```

**Returns:**

```javascript
{
  success: true,
  updated: 1234,    // Number of players updated
  skipped: 56,      // Number of players without birthdays
  timestamp: Date
}
```

#### `updatePlayerAgeById(playerId)`

Updates a single player's age.

```javascript
updatePlayerAgeById("player_123");
```

**Returns:**

```javascript
{
  success: true,
  playerId: "player_123",
  age: 27.3
}
```

#### `testAgeCalculation()`

Tests the age calculation logic with sample dates.

```javascript
testAgeCalculation();
```

### Age Calculation Method

The script calculates age using precise date arithmetic:

1. Gets the difference between current date and birth date in milliseconds
2. Converts to years using `365.25 days/year` (accounts for leap years)
3. Rounds to one decimal place

**Example:**

- Birth date: June 15, 1995
- Current date: November 5, 2025
- Age: 30.4 years

### Setting Up Automated Updates

To keep player ages current, set up a time-based trigger:

1. Open the Apps Script editor: `clasp open`
2. Click **Triggers** (clock icon in left sidebar)
3. Click **+ Add Trigger**
4. Configure:
   - Function: `updateAllPlayerAges`
   - Event source: Time-driven
   - Type: Day timer
   - Time of day: Choose preferred time (e.g., 3am)
5. Save

**Recommended Schedule:** Daily at 3am ET

### Required Columns

The script requires these columns in the **Player** sheet:

- `id` - Player identifier
- `birthday` - Birth date (Date format or YYYY-MM-DD string)
- `age` - Where the calculated age will be stored (number)

---

## 🚫 What Apps Script Does NOT Do

- ❌ Does NOT handle user authentication
- ❌ Does NOT serve web pages
- ❌ Does NOT respond to user requests
- ❌ Does NOT display data (that's Next.js's job)

Apps Script is **backend-only** - it manipulates data and writes to Google Sheets.

## 🔗 Integration with Next.js

The Next.js application:

- **Reads** data from Google Sheets (via Sheets API)
- **Displays** data to users
- **Does NOT write** to Google Sheets
- **Does NOT calculate** aggregations or ratings

This creates a clean separation:

- Apps Script = Data processing & persistence
- Next.js = Data presentation & user interface

## 💡 Why This Architecture?

1. **Separation of Concerns**: Data logic separate from display logic
2. **Single Source of Truth**: All writes go through Apps Script
3. **Data Integrity**: No conflicting writes from multiple sources
4. **Cost Efficiency**: Free data processing on Google infrastructure
5. **Reliability**: Google Sheets as the database
6. **Simplicity**: Next.js doesn't need complex data write logic
7. **Debugging**: All data issues traced to one codebase
