# Scripts & Utilities

Complete reference for GSHL maintenance scripts, data processing tools, and utility commands.

---

## Table of Contents

- [Overview](#overview)
- [Script Structure Guidelines](#script-structure-guidelines)
- [Ranking Scripts](#ranking-scripts)
- [Lineup Optimizer Scripts](#lineup-optimizer-scripts)
- [Team Stats Aggregation](#team-stats-aggregation)
- [Test/Debug Scripts](#testdebug-scripts)
- [Running Scripts](#running-scripts)
- [Best Practices](#best-practices)

---

## Overview

GSHL includes several utility scripts in `src/scripts/` for data maintenance and processing:

| Script                    | Purpose                                       | Frequency          |
| ------------------------- | --------------------------------------------- | ------------------ |
| **train-ranking-model**   | Train player ranking model                    | On-demand / Season |
| **visualize-rankings**    | Show ranking distribution visualizations      | On-demand          |
| **update-all-lineups**    | Optimize lineups for all team-days            | On-demand          |
| **update-all-team-stats** | Aggregate PlayerDays → TeamDays/Weeks/Seasons | On-demand          |
| **test-lineup-count**     | Debug lineup optimization data                | On-demand          |
| **test-team-date-sizes**  | Debug roster size patterns                    | On-demand          |

---

## Script Structure Guidelines

All scripts in `src/scripts/` follow a standardized organization pattern for consistency, maintainability, and readability.

### File Organization Pattern

Scripts should be organized into clearly marked sections using comment banners:

````typescript
/**
 * Script Title
 * =============
 * Brief description of what the script does.
 *
 * @description
 * More detailed explanation of the script's purpose, what data it processes,
 * and what outputs it generates.
 *
 * @usage
 * ```sh
 * npm run script:name
 * tsx src/scripts/script-name.ts
 * ```
 *
 * @output
 * - Description of files/data created
 * - Any side effects or database updates
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

// Dynamic imports for dependencies that need env vars
const [{ dependency1 }, { dependency2 }] = await Promise.all([
  import("../lib/module1.js"),
  import("../lib/module2.js"),
]);

// ============================================================================
// Configuration
// ============================================================================

/** Centralize all constants, IDs, paths, and config values */
const CONFIG_CONSTANT = "value";
const WORKBOOK_IDS = { ... } as const;

// ============================================================================
// Type Definitions
// ============================================================================

/** All interfaces and types used in the script */
interface ScriptData {
  field: string;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Main entry point - orchestrates the high-level workflow.
 * Should be clean and readable, delegating to helper functions.
 */
async function main() {
  console.log("🚀 Script Starting\n");

  try {
    const data = await fetchData();
    const processed = processData(data);
    await saveResults(processed);

    console.log("✅ Complete!\n");
    displayNextSteps();
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exitCode = 1;
  }
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Functions for fetching data from external sources.
 * Group related fetching logic together.
 */
async function fetchData(): Promise<ScriptData[]> {
  // Implementation
}

// ============================================================================
// Data Processing
// ============================================================================

/**
 * Core business logic and data transformations.
 * Keep functions focused and single-purpose.
 */
function processData(data: ScriptData[]): ProcessedData {
  // Implementation
}

// ============================================================================
// Output & Display
// ============================================================================

/**
 * Functions for writing results and displaying output.
 * Separate I/O from business logic.
 */
async function saveResults(data: ProcessedData): Promise<void> {
  // Implementation
}

function displayNextSteps(): void {
  console.log("Next steps:");
  console.log("  1. Action one");
  console.log("  2. Action two");
}

// ============================================================================
// Utilities & Helpers
// ============================================================================

/**
 * Reusable utility functions.
 * Consider extracting to shared utils if used across scripts.
 */
function helperFunction(): void {
  // Implementation
}

// ============================================================================
// Script Entry Point
// ============================================================================

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exitCode = 1;
});
````

### Key Principles

1. **Clear Sections**: Use `// ============` banners to visually separate concerns
2. **Top-Down Flow**: Configuration → Types → Main → Implementations → Utilities
3. **JSDoc Comments**: Every exported function should have a JSDoc comment explaining its purpose
4. **Single Responsibility**: Each function should do one thing well
5. **Error Handling**: Use try/catch in main, set `process.exitCode` for failures
6. **Progress Logging**: Use emoji prefixes for visual clarity (🚀 ⚠️ ✅ ❌ 📥 💾)
7. **Configuration First**: All constants at the top, no magic numbers/strings in code

### Example Sections

#### Configuration Section

```typescript
// ============================================================================
// Configuration
// ============================================================================

/** PlayerDay workbook IDs partitioned by season ranges */
const PLAYERDAY_WORKBOOKS = {
  PLAYERDAYS_1_5: "1ny8gEOotQCbG3uvr29JgX5iRjCS_2Pt44eF4f4l3f1g",
  PLAYERDAYS_6_10: "14XZoxMbcmWh0-XmYOu16Ur0HNOFP9UttHbiMMut_PJ0",
  PLAYERDAYS_11_15: "18IqgstBaBIAfM08w7ddzjF2JTrAqZUjAvsbyZxgHiag",
} as const;

/** Batch size for processing operations */
const BATCH_SIZE = 1000;

/** Output file path */
const OUTPUT_PATH = "./output/results.json";
```

#### Main Execution Pattern

```typescript
// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log("🚀 Script Name");
  console.log("==============\n");

  try {
    // Step 1: Fetch
    const data = await fetchAllData();

    // Step 2: Process
    const results = await processInBatches(data);

    // Step 3: Save
    await saveToFile(results);

    // Step 4: Display summary
    displaySummary(results);

    console.log("🎉 Complete!\n");
  } catch (error) {
    console.error("\n❌ Failed:");
    console.error(error);
    process.exitCode = 1;
  }
}
```

### Common Patterns

#### Batch Processing

```typescript
/**
 * Processes data in batches to avoid memory issues.
 */
async function processInBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
    console.log(
      `   Processed ${Math.min(i + batchSize, items.length)}/${items.length}`,
    );
  }
}
```

#### Retry Logic

```typescript
/**
 * Retries a function with exponential backoff.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) throw error;

      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.log(
        `   ⚠️ Retry ${attempt + 1}/${maxRetries} in ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}
```

### References

For complete examples, see:

- `src/scripts/train-ranking-model.ts` - Model training with validation
- `src/scripts/test-lineup-count.ts` - Analysis and statistics
- `src/scripts/sync-yahoo-team-day.ts` - API integration with OAuth

---

## Ranking Scripts

### train-ranking-model.ts

**Purpose**: Train the player ranking model using historical PlayerDay data from Google Sheets.

**Command**:

```bash
npm run ranking:train
```

**Process**:

1. Fetch all PlayerDay records from Google Sheets (all seasons)
2. Calculate stat distributions (percentiles) per season & position
3. Train position-specific weights for F, D, G
4. Generate season-specific models (e.g., "7:F", "7:D", "7:G")
5. Save complete model to `ranking-model.json`

**Output**:

```
🏒 Training Player Ranking Model
================================================================================

📥 Fetching PlayerDay data from Google Sheets...

   ✓ PLAYERDAYS_6_10: 89,432 records
   ✓ PLAYERDAYS_11_15: 112,876 records
   ✓ Total: 202,308 player-days loaded

📊 Calculating distributions for Season 7...

   Position: F (Forwards)
   ✓ Goals (G): p50=0.0, p90=1.0, p99=2.0
   ✓ Assists (A): p50=0.0, p90=1.0, p99=2.0
   ✓ Points (P): p50=0.0, p90=2.0, p99=3.0
   ...

   Position: D (Defense)
   ✓ Goals (G): p50=0.0, p90=0.0, p99=1.0
   ✓ Assists (A): p50=0.0, p90=1.0, p99=2.0
   ...

   Position: G (Goalies)
   ✓ Wins (W): p50=0.0, p90=1.0, p99=1.0
   ✓ Save % (SVP): p50=0.0, p90=0.925, p99=0.965
   ...

💾 Saving model to ranking-model.json...

✅ Ranking model training complete!

📋 Next Steps:
  1. Review the model file: ranking-model.json
  2. Run visualizations: npm run ranking:visualize
```

**Runtime**: ~15-30 minutes (depends on data volume)

**Requirements**:

- `GOOGLE_SERVICE_ACCOUNT_KEY` in `.env.local`
- Access to PlayerDay Google Sheets workbooks

**Output File**: `ranking-model.json`

- Contains season-specific distributions and weights
- Consumed by the Apps Script ranking engine and Yahoo scraper tooling

---

### visualize-rankings.ts

**Purpose**: Generate console visualizations of ranking distributions.

**Command**:

```bash
npm run ranking:visualize
```

**Process**:

1. Load `ranking-model.json`
2. Display stat distributions by position
3. Show sample player rankings
4. Display model statistics

**Output**:

```
🏒 Ranking Model Visualization
================================================================================

📊 Season 7 - Forward (F) Distributions:

   Goals (G):
   ├─ Min: 0.0, Max: 5.0
   ├─ p50: 0.0, p75: 1.0, p90: 1.0
   └─ p95: 2.0, p99: 3.0

   Assists (A):
   ├─ Min: 0.0, Max: 4.0
   ├─ p50: 0.0, p75: 1.0, p90: 1.0
   └─ p95: 2.0, p99: 2.0

   ... [more stats]

📊 Season 7 - Defense (D) Distributions:
   ...

📊 Season 7 - Goalie (G) Distributions:
   ...

✅ Model contains 9 season-position combinations
```

**Runtime**: ~5 seconds

**Requirements**:

- `ranking-model.json` must exist (run `ranking:train` first)

---

### Apps Script Ranking Updates

Player-day and team-day ratings are now updated exclusively inside the Apps Script project (`apps-script/`). Once a new `ranking-model.json` is trained and exported via `npm run ranking:export-to-apps-script`, the Sheets automations call `rankPerformance` directly while ingesting Yahoo data. No Node.js script is required for production updates.

---

## Lineup Optimizer Scripts

### update-all-lineups.ts

**Purpose**: Optimize lineups for all team-days, calculating fullPos, bestPos, MS, BS, and ADD.

**Command**:

```bash
npm run lineup:update-all
```

**Process**:

1. Fetch all PlayerDay records from Google Sheets
2. Group by team-week (gshlTeamId + weekId)
3. For each team-day:
   - Run hybrid lineup optimizer (greedy + exhaustive fallback)
   - Calculate **fullPos**: Optimal lineup from players who played
   - Calculate **bestPos**: Theoretical best lineup (all roster)
   - Calculate **MS**: Missed Starts (bench → should have started)
   - Calculate **BS**: Bad Starts (started → should have benched)
   - Track **ADD**: New roster additions
4. Batch update Google Sheets (fullPos, bestPos, MS, BS, ADD columns)

**Output**:

```
🔄 Update All Lineup Positions (fullPos, bestPos, MS, BS, ADD)
================================================================================

📥 Fetching all PlayerDay data from Google Sheets...

   Fetching from PLAYERDAYS_6_10...
   ✓ PLAYERDAYS_6_10: 89,432 records loaded

🎯 Optimizing lineups for all team-days...

   ⏳ Processed 100/2,772 team-days...
   ⏳ Processed 200/2,772 team-days...
   ...
   ✓ Processed: 2,772 team-days in 25.3s
   ✓ Optimized: 2,772 lineups (44,309 players)
   ⚠️  Errors: 0

💾 Updating fullPos, bestPos, MS, BS & ADD in Google Sheets...

   Processing PLAYERDAYS_6_10...
   ⏳ Updated 10000/89748 cells...
   ⏳ Updated 20000/89748 cells...
   ...
   ✓ PLAYERDAYS_6_10: Updated 44,309 rows across 89,748 cells

✓ All lineup position & start tracking updates complete!
```

**Runtime**:

- Season 6: ~25 seconds (2,544 team-days)
- Season 7: ~16 seconds (1,654 team-days)
- **Average**: ~10ms per lineup

**Algorithm**:

- **Hybrid approach**: Greedy (fast) + Exhaustive (accurate)
- **95% of lineups**: Greedy algorithm completes in 1-5ms
- **5% of lineups**: Exhaustive search used for complex cases (50-500ms)
- **Validation**: Checks if greedy = optimal, falls back if needed

**Node Flags**:

- `--expose-gc`: Manual garbage collection
- `--max-old-space-size=4096`: 4GB heap limit

**Rate Limiting**:

- 500ms delay between batches
- Exponential backoff retry on quota errors

**See**: [Lineup Optimizer Documentation](../backend/LINEUP_OPTIMIZER.md)

---

## Team Stats Aggregation

### update-all-team-stats.ts

**Purpose**: Aggregate PlayerDay records through the complete team stats hierarchy.

**Command**:

```bash
npm run team:update-all                # Update all seasons
npm run team:update-all -- --season=7  # Update specific season
npm run team:update-all -- --week=7-01 # Update specific week
npm run team:update-all -- --dry-run   # Preview without changes
```

**Aggregation Flow**:

1. **PlayerDay → TeamDay** (by date)

   - Aggregate all player stats for each team-date
   - Calculate team totals: G, A, P, SOG, HIT, BLK, etc.
   - Sum goalie stats: W, GA, SV, SA, SO

2. **TeamDay → TeamWeek** (by week)

   - Aggregate team-days into weekly summaries
   - Calculate weekly team performance metrics
   - Update Matchup scores based on team performance

3. **TeamWeek → TeamSeason** (by season + season type)
   - Split into Regular Season, Playoffs, Losers Tournament
   - Calculate season-wide stats and rankings
   - Determine standings (overallRk, conferenceRk, wildcardRk)
   - Compute team records (W, L, Tie, home/away splits)
   - Calculate streak and power rankings

**Example Output**:

```bash
🚀 Starting Team Stats Update Script

Configuration:
  Season filter: 7
  Week filter: All weeks
  Dry run: No

📅 Fetching weeks...
   ✓ Found 23 weeks to process

[1/23] Processing Week 7-01 (REGULAR_SEASON)
   📊 Aggregating PlayerDays → TeamDays...
      ✓ TeamDays: 12 created, 0 updated
      Summary: 12 team-days from 247 player-days
   📊 Aggregating TeamDays → TeamWeeks...
      ✓ TeamWeeks: 12 created, 0 updated
      ✓ Matchups: 6 updated

[2/23] Processing Week 7-02 (REGULAR_SEASON)
   ...

📊 Aggregating TeamWeeks → TeamSeasons...
   Processing 1 seasons

   [1/1] Season 7
      ✓ TeamSeasons: 24 created, 0 updated
      Summary: 24 team seasons (RS: 12, PO: 12)

✅ Team Stats Update Complete!

Summary:
  Weeks processed: 23
  TeamDays: 276 created, 0 updated
  TeamWeeks: 276 created, 0 updated
  TeamSeasons: 24 created, 0 updated
  Matchups updated: 138
  Total time: 18.4s
```

**Runtime**:

- ~0.8 seconds per week
- ~18-25 seconds for full season (23 weeks)
- Rate limited to avoid API quotas

**What Gets Updated**:

- **TeamDayStatLine**: Daily team performance aggregates
- **TeamWeekStatLine**: Weekly team performance summaries
- **TeamSeasonStatLine**: Season-wide stats and rankings
- **Matchup**: Scores updated based on TeamWeek performance

**Use Cases**:

- After scraping new Yahoo roster data
- After updating PlayerDay ratings
- After lineup optimization changes
- When rebuilding full season stats

**Filters**:

```bash
# Update only Season 7
npm run team:update-all -- --season=7

# Update only a specific week
npm run team:update-all -- --week=7-15

# Preview changes without writing to Sheets
npm run team:update-all -- --dry-run

# Combine filters
npm run team:update-all -- --season=7 --dry-run
```

**Rate Limiting**:

- 500ms delay between weeks
- Exponential backoff on quota errors
- Safe for bulk updates

---

## Test/Debug Scripts

### test-lineup-count.ts

**Purpose**: Analyze and count lineup configurations for debugging.

**Command**:

```bash
npm run test:lineup-count
```

**Use Case**: Verify lineup optimization produced expected results

**Runtime**: ~1 minute

---

### test-team-date-sizes.ts

**Purpose**: Analyze team roster sizes by date.

**Command**:

```bash
npm run test:team-sizes
```

**Use Case**: Debug roster size patterns, identify anomalies

**Runtime**: ~1 minute

---

## Running Scripts

### Basic Execution

All scripts use `tsx` for TypeScript execution without pre-compilation:

```bash
# Via npm scripts (recommended)
npm run ranking:train
npm run lineup:update-all

# Direct execution
npx tsx src/scripts/train-ranking-model.ts
```

### With Environment Variables

Scripts automatically load `.env.local` via `dotenv`:

```typescript
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
```

**Required Environment Variables**:

- `GOOGLE_SERVICE_ACCOUNT_KEY`: Service account credentials (JSON string)
- `USE_GOOGLE_SHEETS`: Set to `"true"` to enable Sheets API

### Background Execution

For long-running scripts on Windows:

```bash
# Run in background (PowerShell)
Start-Process npm -ArgumentList "run", "lineup:update-all" -NoNewWindow

# View logs
Get-Content lineup.log -Wait -Tail 50
```

On Unix/Linux:

```bash
# Run in background with nohup
nohup npm run lineup:update-all > lineup.log 2>&1 &

# View progress
tail -f lineup.log
```

### Monitoring Progress

Scripts provide real-time progress updates:

```
⏳ Processed 100/2,772 team-days...
⏳ Processed 200/2,772 team-days...
✓ Processed: 2,772 team-days in 25.3s
```

### Error Handling

All scripts include:

- **Retry logic**: Exponential backoff for API quota errors
- **Rate limiting**: Delays between batches to avoid quotas
- **Error logging**: Clear error messages with context
- **Graceful failures**: Continue processing on individual errors

---

## Best Practices

### Before Running Scripts

1. **Verify environment**: Ensure `.env.local` has required credentials
2. **Check disk space**: Large datasets may require significant space
3. **Test on small dataset**: Filter to single season first if testing
4. **Backup data**: Take Sheets backup before bulk updates

### During Execution

1. **Monitor progress**: Watch console output for errors
2. **Check quotas**: Google Sheets has rate limits (300 writes/min)
3. **Don't interrupt**: Let scripts complete or data may be inconsistent
4. **Save logs**: Redirect output to file for debugging

### After Execution

1. **Verify results**: Spot-check updated data in Google Sheets
2. **Check error count**: Review any errors logged during execution
3. **Update documentation**: Note any configuration changes
4. **Commit model changes**: If `ranking-model.json` updated, commit it

### Troubleshooting

**"Quota exceeded" errors**:

- Scripts now include 500ms delays between batches
- Exponential backoff retries (10s, 20s, 40s, 80s, 160s)
- If still hitting quotas, increase delay in script

**Memory issues**:

- Use `--max-old-space-size=4096` flag (already in lineup script)
- Enable garbage collection with `--expose-gc`
- Process in smaller batches by filtering to specific season

**TypeScript errors**:

- Run `npm run typecheck` before executing scripts
- Update dependencies: `npm install`
- Clear node_modules if persistent: `rm -rf node_modules && npm install`

**Google Sheets access denied**:

- Verify service account key in `.env.local`
- Check service account has Editor access to spreadsheets
- Confirm `USE_GOOGLE_SHEETS="true"` in environment

---

## Related Documentation

- [NPM Scripts Reference](NPM_SCRIPTS.md) - All available npm commands
- [Ranking Engine](../backend/RANKING_ENGINE.md) - Rating algorithm details
- [Lineup Optimizer](../backend/LINEUP_OPTIMIZER.md) - Lineup optimization algorithm
- [Environment Setup](ENVIRONMENT.md) - Configuration and credentials
- [Troubleshooting](../reference/TROUBLESHOOTING.md) - Common issues and solutions
