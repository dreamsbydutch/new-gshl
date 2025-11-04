/**
 * Update All Team Stats Script
 * =============================
 * Aggregates PlayerDay records through the complete stats hierarchy and updates matchups.
 *
 * @description
 * This script performs a complete aggregation pipeline:
 * - PlayerDay → TeamDay (by date)
 * - TeamDay → TeamWeek (by week)
 * - TeamWeek → TeamSeason (by season + season type)
 * - Updates Matchup scores based on TeamWeek performance
 *
 * @usage
 * ```sh
 * npm run team:update-all                    # Update all seasons
 * npm run team:update-all -- --season=7      # Update specific season
 * npm run team:update-all -- --week=7-01     # Update specific week
 * npm run team:update-all -- --dry-run       # Preview without saving
 * ```
 *
 * @output
 * - Creates/updates TeamDay records in Google Sheets
 * - Creates/updates TeamWeek records in Google Sheets
 * - Creates/updates TeamSeason records in Google Sheets
 * - Updates Matchup win/loss records
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Dynamic imports to ensure env vars are loaded first
const [{ optimizedSheetsAdapter }, types] = await Promise.all([
  import("@gshl-sheets"),
  import("@gshl-types"),
]);

import type { Week } from "@gshl-types";

// ============================================================================
// Configuration
// ============================================================================

/** Rate limiting delay between processing weeks (ms) */
const DELAY_BETWEEN_WEEKS_MS = 500;

/** Rate limiting delay between processing seasons (ms) */
const DELAY_BETWEEN_SEASONS_MS = 500;

// ============================================================================
// Type Definitions
// ============================================================================

interface ScriptOptions {
  seasonId?: string;
  weekId?: string;
  dryRun?: boolean;
}

interface ProcessingStats {
  teamDaysCreated: number;
  teamDaysUpdated: number;
  teamWeeksCreated: number;
  teamWeeksUpdated: number;
  teamSeasonsCreated: number;
  teamSeasonsUpdated: number;
  matchupsUpdated: number;
  skippedWeeks: string[];
  weekErrors: Array<{ weekId: string; error: string }>;
}

interface WeekProcessingResult {
  teamDaysCreated: number;
  teamDaysUpdated: number;
  teamWeeksCreated: number;
  teamWeeksUpdated: number;
  matchupsUpdated: number;
  hasData: boolean;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  displayConfiguration(options);

  try {
    // Step 1: Fetch weeks to process
    const weeks = await fetchWeeks(options);

    if (weeks.length === 0) {
      console.log("⚠️  No weeks found matching the filters");
      return;
    }

    // Step 2: Initialize tRPC caller
    const caller = await initializeTRPCCaller();

    // Step 3: Process all weeks
    const stats = await processAllWeeks(weeks, caller, options);

    // Step 4: Aggregate to seasons
    await processSeasons(weeks, options, stats);

    // Step 5: Display final summary
    displayFinalSummary(stats, weeks.length, startTime, options);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exitCode = 1;
  }
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

/**
 * Parses command-line arguments into script options.
 */
function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--season=")) {
      options.seasonId = arg.split("=")[1];
    } else if (arg.startsWith("--week=")) {
      options.weekId = arg.split("=")[1];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

/**
 * Displays the script configuration.
 */
function displayConfiguration(options: ScriptOptions): void {
  console.log("🚀 Team Stats Update Script");
  console.log("===========================\n");
  console.log("Configuration:");
  console.log(`  Season filter: ${options.seasonId ?? "All seasons"}`);
  console.log(`  Week filter: ${options.weekId ?? "All weeks"}`);
  console.log(`  Dry run: ${options.dryRun ? "Yes" : "No"}\n`);
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Fetches weeks to process based on filter options.
 */
async function fetchWeeks(options: ScriptOptions): Promise<Week[]> {
  console.log("📅 Fetching weeks...");

  const whereClause: Record<string, any> = {};

  if (options.seasonId) {
    whereClause.seasonId = options.seasonId;
  }
  if (options.weekId) {
    whereClause.id = options.weekId;
  }

  const weeks = (await optimizedSheetsAdapter.findMany("Week", {
    where: whereClause,
  })) as unknown as Week[];

  // Sort weeks by ID for sequential processing
  weeks.sort((a, b) => a.id.localeCompare(b.id));

  console.log(`   ✓ Found ${weeks.length} weeks to process\n`);

  return weeks;
}

/**
 * Initializes the tRPC caller for API operations.
 */
async function initializeTRPCCaller(): Promise<any> {
  console.log("⚙️  Initializing tRPC caller...");

  const { appRouter } = await import("@gshl-api");
  const { createTRPCContext } = await import("@gshl-api");

  const ctx = await createTRPCContext({
    headers: new Headers(),
  } as any);

  const caller = appRouter.createCaller(ctx);

  console.log("   ✓ Ready\n");

  return caller;
}

// ============================================================================
// Week Processing
// ============================================================================

/**
 * Processes all weeks and aggregates stats.
 */
async function processAllWeeks(
  weeks: Week[],
  caller: any,
  options: ScriptOptions,
): Promise<ProcessingStats> {
  const stats: ProcessingStats = {
    teamDaysCreated: 0,
    teamDaysUpdated: 0,
    teamWeeksCreated: 0,
    teamWeeksUpdated: 0,
    teamSeasonsCreated: 0,
    teamSeasonsUpdated: 0,
    matchupsUpdated: 0,
    skippedWeeks: [],
    weekErrors: [],
  };

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i]!;

    console.log(
      `\n[${i + 1}/${weeks.length}] Processing Week ${week.id} (${week.weekType})`,
    );

    try {
      const result = await processWeek(week, caller, options);

      stats.teamDaysCreated += result.teamDaysCreated;
      stats.teamDaysUpdated += result.teamDaysUpdated;
      stats.teamWeeksCreated += result.teamWeeksCreated;
      stats.teamWeeksUpdated += result.teamWeeksUpdated;
      stats.matchupsUpdated += result.matchupsUpdated;

      if (!result.hasData) {
        console.log(
          `      ⚠️  WARNING: No PlayerDay data found for this week!`,
        );
        stats.skippedWeeks.push(week.id);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Error processing week ${week.id}:`, errorMsg);
      stats.weekErrors.push({ weekId: week.id, error: errorMsg });
      stats.skippedWeeks.push(week.id);
      continue;
    }

    // Rate limiting delay (except for last week)
    if (i < weeks.length - 1) {
      await delay(DELAY_BETWEEN_WEEKS_MS);
    }
  }

  return stats;
}

/**
 * Processes a single week's aggregations.
 */
async function processWeek(
  week: Week,
  caller: any,
  options: ScriptOptions,
): Promise<WeekProcessingResult> {
  const weekStartTime = Date.now();

  // Step 1: Aggregate PlayerDays → TeamDays
  console.log(`   📊 Aggregating PlayerDays → TeamDays...`);

  const teamDaysResult =
    await caller.teamStats.daily.aggregateAndCreateFromPlayerDays({
      weekId: week.id,
      dryRun: options.dryRun ?? false,
    });

  const hasData = teamDaysResult.summary.input.totalPlayerDays > 0;

  console.log(
    `      ✓ TeamDays: ${teamDaysResult.created ?? 0} created, ${teamDaysResult.updated ?? 0} updated (${teamDaysResult.summary.input.totalPlayerDays} player-days)`,
  );

  // Step 2: Aggregate TeamDays → TeamWeeks + Update Matchups
  console.log(`   📊 Aggregating TeamDays → TeamWeeks...`);

  const teamWeeksResult =
    await caller.teamStats.weekly.aggregateAndCreateFromDays({
      weekId: week.id,
      dryRun: options.dryRun ?? false,
    });

  console.log(
    `      ✓ TeamWeeks: ${teamWeeksResult.created ?? 0} created, ${teamWeeksResult.updated ?? 0} updated`,
  );

  // Step 3: Process matchup updates
  let matchupsUpdated = 0;

  if (teamWeeksResult.matchups) {
    matchupsUpdated = teamWeeksResult.matchups.updated;
    console.log(`      ✓ Matchups: ${matchupsUpdated} updated`);

    if (teamWeeksResult.matchups.errors.length > 0) {
      console.log(
        `      ⚠️  Matchup errors: ${teamWeeksResult.matchups.errors.length}`,
      );
      teamWeeksResult.matchups.errors.forEach(
        (err: { id: string; error: string }) => {
          console.log(`         - ${err.id}: ${err.error}`);
        },
      );
    }
  }

  const weekElapsed = ((Date.now() - weekStartTime) / 1000).toFixed(1);
  console.log(`      ⏱️  Week processed in ${weekElapsed}s`);

  return {
    teamDaysCreated: teamDaysResult.created ?? 0,
    teamDaysUpdated: teamDaysResult.updated ?? 0,
    teamWeeksCreated: teamWeeksResult.created ?? 0,
    teamWeeksUpdated: teamWeeksResult.updated ?? 0,
    matchupsUpdated,
    hasData,
  };
}

// ============================================================================
// Season Processing
// ============================================================================

/**
 * Processes season aggregations for all unique seasons in the weeks.
 */
async function processSeasons(
  weeks: Week[],
  options: ScriptOptions,
  stats: ProcessingStats,
): Promise<void> {
  console.log("\n\n📊 Aggregating TeamWeeks → TeamSeasons...");

  const seasonIds = [...new Set(weeks.map((w) => w.seasonId))];
  console.log(`   Processing ${seasonIds.length} seasons`);

  for (let i = 0; i < seasonIds.length; i++) {
    const seasonId = seasonIds[i]!;
    console.log(`\n   [${i + 1}/${seasonIds.length}] Season ${seasonId}`);

    try {
      const result = await processSeason(seasonId, options);

      stats.teamSeasonsCreated += result.created;
      stats.teamSeasonsUpdated += result.updated;

      console.log(
        `      ✓ TeamSeasons: ${result.created} created, ${result.updated} updated`,
      );
      console.log(
        `      Summary: ${result.total} team seasons (RS: ${result.regularSeasons}, PO: ${result.playoffs})`,
      );
    } catch (error) {
      console.error(`   ❌ Error processing season ${seasonId}:`, error);
      continue;
    }

    // Rate limiting delay (except for last season)
    if (i < seasonIds.length - 1) {
      await delay(DELAY_BETWEEN_SEASONS_MS);
    }
  }
}

/**
 * Processes aggregations for a single season.
 */
async function processSeason(
  seasonId: string,
  options: ScriptOptions,
): Promise<{
  created: number;
  updated: number;
  total: number;
  regularSeasons: number;
  playoffs: number;
}> {
  const { appRouter } = await import("@gshl-api");
  const { createTRPCContext } = await import("@gshl-api");

  const ctx = await createTRPCContext({
    headers: new Headers(),
  } as any);

  const caller = appRouter.createCaller(ctx);

  const result = await caller.teamStats.season.aggregateAndCreateFromWeeks({
    seasonId,
    dryRun: options.dryRun ?? false,
  });

  return {
    created: result.created ?? 0,
    updated: result.updated ?? 0,
    total: result.summary.output.totalTeamSeasons,
    regularSeasons: result.summary.output.regularSeasons,
    playoffs: result.summary.output.playoffs,
  };
}

// ============================================================================
// Output & Display
// ============================================================================

/**
 * Displays the final summary of all processing.
 */
function displayFinalSummary(
  stats: ProcessingStats,
  totalWeeks: number,
  startTime: number,
  options: ScriptOptions,
): void {
  const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n\n✅ Team Stats Update Complete!\n");
  console.log("Summary:");
  console.log(
    `  Weeks processed: ${totalWeeks - stats.skippedWeeks.length}/${totalWeeks}`,
  );
  console.log(
    `  TeamDays: ${stats.teamDaysCreated} created, ${stats.teamDaysUpdated} updated`,
  );
  console.log(
    `  TeamWeeks: ${stats.teamWeeksCreated} created, ${stats.teamWeeksUpdated} updated`,
  );
  console.log(
    `  TeamSeasons: ${stats.teamSeasonsCreated} created, ${stats.teamSeasonsUpdated} updated`,
  );
  console.log(`  Matchups updated: ${stats.matchupsUpdated}`);
  console.log(`  Total time: ${elapsedTime}s`);

  if (stats.skippedWeeks.length > 0) {
    displaySkippedWeeks(stats);
  }

  if (options.dryRun) {
    console.log("\n⚠️  DRY RUN - No changes were made to Google Sheets");
  }
}

/**
 * Displays information about skipped weeks.
 */
function displaySkippedWeeks(stats: ProcessingStats): void {
  console.log(
    `\n⚠️  WARNING: ${stats.skippedWeeks.length} weeks skipped due to missing data or errors:`,
  );

  stats.skippedWeeks.forEach((weekId) => {
    const error = stats.weekErrors.find((e) => e.weekId === weekId);
    if (error) {
      console.log(`  - ${weekId}: ${error.error}`);
    } else {
      console.log(`  - ${weekId}: No PlayerDay data found`);
    }
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Delays execution for rate limiting.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Script Entry Point
// ============================================================================

main()
  .then(() => {
    console.log("\n✓ Script completed successfully");
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exitCode = 1;
  });
