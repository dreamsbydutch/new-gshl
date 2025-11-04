/**
 * @fileoverview Stat Aggregation Orchestrator
 *
 * This module provides a high-level orchestration function that rebuilds
 * all stat aggregations for a given date across the entire hierarchy.
 *
 * **Aggregation Flow:**
 * 1. Identify week and season from date
 * 2. Fetch all player days for that date
 * 3. Aggregate player days → player weeks
 * 4. Aggregate player weeks → player splits & totals
 * 5. Aggregate player days → team days
 * 6. Aggregate team days → team weeks
 * 7. Aggregate team weeks → team seasons
 *
 * **Usage:**
 * ```typescript
 * const result = await rebuildStatsForDate(new Date('2025-01-15'));
 * console.log(`Updated ${result.totalRecordsUpdated} records`);
 * ```
 *
 * @module stat-orchestrator
 */

import type {
  Week,
  StatOrchestrationResult,
  StatOrchestrationDeps,
  AggregationConfig,
} from "@gshl-types";
import { aggregate, convertToSheets } from "./stat-aggregation";
import {
  playerDayToWeekConfig,
  playerWeekToSplitConfig,
  playerWeekToTotalConfig,
  playerDayToTeamDayConfig,
  teamDayToWeekConfig,
  teamWeekToSeasonConfig,
} from "./aggregation-configs";

/* ============================================================================
 * TYPE UTILITIES
 * ========================================================================= */

/**
 * Helper to cast stat line arrays to the format expected by aggregate/convertToSheets
 * This is safe because all stat lines are objects with string-indexable properties
 */
function asRecords<T>(arr: T[]): Record<string, unknown>[] {
  return arr as unknown as Record<string, unknown>[];
}

/**
 * Helper to cast aggregation configs to the format expected by aggregate
 * This is safe because the configs work with the underlying record structure
 */
function asConfig<TOutput>(
  config: unknown,
): AggregationConfig<Record<string, unknown>, TOutput> {
  return config as AggregationConfig<Record<string, unknown>, TOutput>;
}

/**
 * Helper to cast metadata maps to the format expected by aggregate
 */
function asMetadata<T>(
  map: Map<string, T>,
): Map<string, { weekType?: string; [key: string]: unknown }> {
  return map as unknown as Map<
    string,
    { weekType?: string; [key: string]: unknown }
  >;
}

/* ============================================================================
 * ORCHESTRATION FUNCTION
 * ========================================================================= */

/**
 * Rebuilds all stat aggregations for a given date
 *
 * This function orchestrates the complete stat aggregation pipeline:
 * 1. Identifies the week and season for the date
 * 2. Fetches all raw player day data
 * 3. Aggregates through the entire hierarchy (days → weeks → splits/totals → seasons)
 * 4. Updates both player and team stats at all levels
 * 5. Returns a detailed summary of what was updated
 *
 * **Important Notes:**
 * - This function is idempotent - safe to run multiple times for the same date
 * - Uses upsert operations (create new or update existing records)
 * - Processes the entire week, not just the single date (for consistency)
 * - Non-fatal errors are collected in the result's errors array
 *
 * @param date - The date to rebuild stats for
 * @param deps - Database operation dependencies
 * @returns Summary of all updates performed
 *
 * @example
 * ```typescript
 * const result = await rebuildStatsForDate(
 *   new Date('2025-01-15'),
 *   {
 *     fetchPlayerDaysByDate: async (date) => { ... },
 *     fetchPlayerWeeksByWeek: async (weekId) => { ... },
 *     // ... other deps
 *   }
 * );
 *
 * console.log(`Updated ${result.totalRecordsUpdated} records in ${result.elapsedMs}ms`);
 * ```
 */
export async function rebuildStatsForDate(
  date: Date,
  deps: StatOrchestrationDeps,
): Promise<StatOrchestrationResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  console.log(`🔄 Starting stat rebuild for date: ${date.toISOString()}`);

  // Step 1: Identify week and season
  const week = await deps.fetchWeekByDate(date);
  if (!week) {
    throw new Error(
      `No week found for date ${date.toISOString()}. Cannot rebuild stats.`,
    );
  }

  const { id: weekId, seasonId } = week;
  console.log(`📅 Week: ${weekId}, Season: ${seasonId}`);

  const result: StatOrchestrationResult = {
    date,
    weekId,
    seasonId,
    totalRecordsUpdated: 0,
    breakdown: {
      playerWeeks: { created: 0, updated: 0 },
      playerSplits: { created: 0, updated: 0 },
      playerTotals: { created: 0, updated: 0 },
      teamDays: { created: 0, updated: 0 },
      teamWeeks: { created: 0, updated: 0 },
      teamSeasons: { created: 0, updated: 0 },
    },
    elapsedMs: 0,
    errors,
  };

  try {
    // Step 2: Fetch all player days for this week (not just the date)
    console.log(`📊 Fetching player days for the entire week...`);
    const playerDays = await deps.fetchPlayerDaysByDate(date);
    console.log(`  Found ${playerDays.length} player day records`);

    if (playerDays.length === 0) {
      console.log(`⚠️  No player days found. Skipping aggregation.`);
      result.elapsedMs = Date.now() - startTime;
      return result;
    }

    // Step 3: Aggregate Player Days → Player Weeks
    console.log(`\n📈 Aggregating Player Days → Player Weeks...`);
    const playerWeeks = aggregate(
      asRecords(playerDays),
      asConfig(playerDayToWeekConfig),
    );
    console.log(`  Generated ${playerWeeks.length} player week records`);

    const playerWeeksForSheets = convertToSheets(asRecords(playerWeeks));
    const playerWeeksResult =
      await deps.upsertPlayerWeeks(playerWeeksForSheets);
    result.breakdown.playerWeeks = playerWeeksResult;
    result.totalRecordsUpdated +=
      playerWeeksResult.created + playerWeeksResult.updated;
    console.log(
      `  ✓ Created: ${playerWeeksResult.created}, Updated: ${playerWeeksResult.updated}`,
    );

    // Step 4: Fetch all player weeks for the season (for splits/totals)
    console.log(`\n📊 Fetching all player weeks for season...`);
    const allPlayerWeeks = await deps.fetchPlayerWeeksByWeek(weekId);
    console.log(`  Found ${allPlayerWeeks.length} total player week records`);

    // Step 5: Build week metadata for seasonType splitting
    const weeks = await deps.fetchWeeksBySeason(seasonId);
    const weekMetadata = new Map<string, Week>();
    weeks.forEach((w) => weekMetadata.set(w.id, w));
    console.log(`  Built metadata for ${weeks.length} weeks`);

    // Step 6: Aggregate Player Weeks → Player Splits
    console.log(`\n📈 Aggregating Player Weeks → Player Splits...`);
    const playerSplits = aggregate(
      asRecords(allPlayerWeeks),
      asConfig(playerWeekToSplitConfig),
      asMetadata(weekMetadata),
    );
    console.log(`  Generated ${playerSplits.length} player split records`);

    const playerSplitsForSheets = convertToSheets(asRecords(playerSplits));
    const playerSplitsResult = await deps.upsertPlayerSplits(
      playerSplitsForSheets,
    );
    result.breakdown.playerSplits = playerSplitsResult;
    result.totalRecordsUpdated +=
      playerSplitsResult.created + playerSplitsResult.updated;
    console.log(
      `  ✓ Created: ${playerSplitsResult.created}, Updated: ${playerSplitsResult.updated}`,
    );

    // Step 7: Aggregate Player Weeks → Player Totals
    console.log(`\n📈 Aggregating Player Weeks → Player Totals...`);
    const playerTotals = aggregate(
      asRecords(allPlayerWeeks),
      asConfig(playerWeekToTotalConfig),
      asMetadata(weekMetadata),
    );
    console.log(`  Generated ${playerTotals.length} player total records`);

    const playerTotalsForSheets = convertToSheets(asRecords(playerTotals));
    const playerTotalsResult = await deps.upsertPlayerTotals(
      playerTotalsForSheets,
    );
    result.breakdown.playerTotals = playerTotalsResult;
    result.totalRecordsUpdated +=
      playerTotalsResult.created + playerTotalsResult.updated;
    console.log(
      `  ✓ Created: ${playerTotalsResult.created}, Updated: ${playerTotalsResult.updated}`,
    );

    // Step 8: Aggregate Player Days → Team Days
    console.log(`\n📈 Aggregating Player Days → Team Days...`);
    const teamDays = aggregate(
      asRecords(playerDays),
      asConfig(playerDayToTeamDayConfig),
    );
    console.log(`  Generated ${teamDays.length} team day records`);

    const teamDaysForSheets = convertToSheets(asRecords(teamDays));
    const teamDaysResult = await deps.upsertTeamDays(teamDaysForSheets);
    result.breakdown.teamDays = teamDaysResult;
    result.totalRecordsUpdated +=
      teamDaysResult.created + teamDaysResult.updated;
    console.log(
      `  ✓ Created: ${teamDaysResult.created}, Updated: ${teamDaysResult.updated}`,
    );

    // Step 9: Fetch all team days for the week (for team weeks)
    console.log(`\n📊 Fetching all team days for week...`);
    const allTeamDays = await deps.fetchTeamDaysByWeek(weekId);
    console.log(`  Found ${allTeamDays.length} team day records`);

    // Step 10: Aggregate Team Days → Team Weeks
    console.log(`\n📈 Aggregating Team Days → Team Weeks...`);
    const teamWeeks = aggregate(
      asRecords(allTeamDays),
      asConfig(teamDayToWeekConfig),
    );
    console.log(`  Generated ${teamWeeks.length} team week records`);

    const teamWeeksForSheets = convertToSheets(asRecords(teamWeeks));
    const teamWeeksResult = await deps.upsertTeamWeeks(teamWeeksForSheets);
    result.breakdown.teamWeeks = teamWeeksResult;
    result.totalRecordsUpdated +=
      teamWeeksResult.created + teamWeeksResult.updated;
    console.log(
      `  ✓ Created: ${teamWeeksResult.created}, Updated: ${teamWeeksResult.updated}`,
    );

    // Step 11: Fetch all team weeks for the season (for team seasons)
    console.log(`\n📊 Fetching all team weeks for season...`);
    const allTeamWeeks = await deps.fetchTeamWeeksBySeason(seasonId);
    console.log(`  Found ${allTeamWeeks.length} team week records`);

    // Step 12: Aggregate Team Weeks → Team Seasons
    console.log(`\n📈 Aggregating Team Weeks → Team Seasons...`);
    const teamSeasons = aggregate(
      asRecords(allTeamWeeks),
      asConfig(teamWeekToSeasonConfig),
      asMetadata(weekMetadata),
    );
    console.log(`  Generated ${teamSeasons.length} team season records`);

    const teamSeasonsForSheets = convertToSheets(asRecords(teamSeasons));
    const teamSeasonsResult =
      await deps.upsertTeamSeasons(teamSeasonsForSheets);
    result.breakdown.teamSeasons = teamSeasonsResult;
    result.totalRecordsUpdated +=
      teamSeasonsResult.created + teamSeasonsResult.updated;
    console.log(
      `  ✓ Created: ${teamSeasonsResult.created}, Updated: ${teamSeasonsResult.updated}`,
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    console.error(`❌ Error during stat rebuild:`, error);
  }

  result.elapsedMs = Date.now() - startTime;

  console.log(`\n✅ Stat rebuild complete!`);
  console.log(`   Total records updated: ${result.totalRecordsUpdated}`);
  console.log(`   Elapsed time: ${result.elapsedMs}ms`);
  if (errors.length > 0) {
    console.log(`   ⚠️  Errors: ${errors.length}`);
  }

  return result;
}

/**
 * Rebuilds stats for a date range (multiple dates)
 *
 * Convenience function that calls rebuildStatsForDate for each date in the range.
 * Processes dates sequentially to avoid database contention.
 *
 * @param startDate - First date to rebuild (inclusive)
 * @param endDate - Last date to rebuild (inclusive)
 * @param deps - Database operation dependencies
 * @returns Array of results, one per date
 *
 * @example
 * ```typescript
 * const results = await rebuildStatsForDateRange(
 *   new Date('2025-01-01'),
 *   new Date('2025-01-07'),
 *   deps
 * );
 * ```
 */
export async function rebuildStatsForDateRange(
  startDate: Date,
  endDate: Date,
  deps: StatOrchestrationDeps,
): Promise<StatOrchestrationResult[]> {
  const results: StatOrchestrationResult[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const result = await rebuildStatsForDate(new Date(currentDate), deps);
    results.push(result);

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const totalRecords = results.reduce(
    (sum, r) => sum + r.totalRecordsUpdated,
    0,
  );
  const totalTime = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  console.log(`\n🎉 Date range rebuild complete!`);
  console.log(`   Dates processed: ${results.length}`);
  console.log(`   Total records updated: ${totalRecords}`);
  console.log(`   Total time: ${totalTime}ms`);

  return results;
}
