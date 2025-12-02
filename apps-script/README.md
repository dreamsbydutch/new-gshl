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

📖 See [PROJECT_GOALS.md](PROJECT_GOALS.md) for the complete architecture vision.

## What This Does

1. **Yahoo Roster Scraping**: Fetches daily roster data from Yahoo Fantasy Hockey
2. **Data Writing**: Writes PlayerDay records to Google Sheets
3. **Schema Understanding**: Reads from the Google Sheets schema (Team, Season, Week, Player tables)

## Files

- **Config.js** - Configuration (Spreadsheet ID, Yahoo League ID)
- **YahooScraper.js** - Complete scraper with schema reading and console logging
- **PlayerAgeUpdater.js** - Updates player ages based on birth dates
- **PROJECT_GOALS.md** - Architecture vision and principles

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
   cd src/server/apps-script
   clasp create --type standalone --title "GSHL Cron Jobs"
   ```

2. This will create a `.clasp.json` file with your script ID.

3. Update the `Config.ts` file with your configuration.

4. Deploy the code (clasp automatically transpiles TypeScript to JavaScript):

   ```bash
   clasp push
   ```

5. Open the project in the Apps Script editor:

   ```bash
   clasp open
   ```

6. In the Apps Script editor, set up time-based triggers for each function.

### TypeScript Support

✅ **Yes, we use TypeScript!**

Clasp automatically transpiles `.ts` files to JavaScript when you run `clasp push`. This gives us:

- Type safety during development
- Better IDE support
- Cleaner code with modern syntax
- Automatic conversion to Apps Script-compatible JavaScript

The Apps Script editor will show the transpiled JavaScript, which is normal.

## Configuration

Edit `Config.ts` to configure:

- **API_BASE_URL** - Your production API endpoint (e.g., `https://your-app.vercel.app`)
- **CRON_AUTH_KEY** - Secret key for authenticating cron requests (set in your .env as `CRON_SECRET_KEY`)

### Initial Setup

1. Navigate to the apps-script directory:

   ```bash
   cd src/server/apps-script
   ```

2. Create a new Apps Script project:

   ```bash
   clasp create --title "GSHL Yahoo Scraper" --type standalone
   ```

3. Update `Config.ts` with your IDs:

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
3. Set up trigger for `scrapeYahooRosters`:
   - Function: `scrapeYahooRosters`
   - Deployment: `Head`
   - Event source: `Time-driven`
   - Type: Choose based on your needs:
     - **Every 15 minutes** (during game times)
     - **Hourly** (pre-game)
     - **Day timer** (morning updates)

### Testing

Run the test function from the Apps Script editor:

1. Open the script in the editor (`clasp open`)
2. Select `testYahooScraper` from the function dropdown
3. Click **Run**
4. Check the logs for results

## Usage

## Usage

### Running the Scraper

From the Apps Script editor:

1. Open the script: `clasp open`
2. Select `scrapeYahooRosters` from the function dropdown
3. Click **Run**
4. View **Execution log** to see:
   - Teams and season/week info read from Sheets
   - Yahoo roster fetch progress
   - All PlayerDay records that would be written
   - Summary of scraped data

The scraper currently **logs data only** - it does not write to Sheets yet. This lets you review the data structure before implementing the write logic.

### Viewing Logs

```bash
clasp logs
```

Or view in the Apps Script editor under **Executions**.

## Files

- `.clasp.json` - Clasp configuration (created after `clasp create`)
- `.claspignore` - Exclude files from deployment
- `appsscript.json` - Apps Script manifest (runtime settings)
- `Config.ts` - Configuration (Spreadsheet ID, League ID)
- `CronJobs.ts` - Cron trigger function
- `YahooScraper.ts` - Main scraper logic
- `PROJECT_GOALS.md` - Architecture documentation
- `package.json` - NPM scripts for convenience

## TypeScript Support

Yes, clasp supports TypeScript! The `.ts` files are automatically transpiled to JavaScript when you run `clasp push`.

## Troubleshooting

**"Script not found" error:**

- Make sure you've run `clasp create` first
- Check that `.clasp.json` has a valid `scriptId`

**Scraper not finding data:**

- Verify `SPREADSHEET_ID` in Config.ts is correct
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
