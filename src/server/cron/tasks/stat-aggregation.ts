/**
 * Stat Aggregation Task
 * ----------------------
 * Core stat rebuilding logic extracted for use by cron jobs.
 */

import { appRouter } from "../../api/root";
import { createTRPCContext } from "../../api/trpc";

/**
 * Execute the stat aggregation rebuild for a specific date
 */
export async function runStatAggregation(
  triggerType: "primary" | "secondary",
  targetDate?: Date,
): Promise<void> {
  const startTime = Date.now();

  try {
    // Determine target date
    // Default: previous day (games finish by 3 AM)
    const rawDate = targetDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Normalize to midnight in local timezone (YYYY-MM-DD at 00:00:00)
    const dateStr = rawDate.toISOString().split("T")[0]!;
    const date = new Date(`${dateStr}T00:00:00.000`);

    console.log(`📊 [Stats/${triggerType}] Starting stat aggregation rebuild`);
    console.log(`   Target date: ${dateStr}`);
    console.log(
      `   Triggered at: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
    );

    // Create a tRPC caller context
    const ctx = await createTRPCContext({
      headers: new Headers(),
    });

    // Create a tRPC caller
    const caller = appRouter.createCaller(ctx);

    // Execute the stat aggregation
    const result = await caller.statAggregation.rebuildStatsForDate({
      date,
    });

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ [Stats/${triggerType}] Aggregation complete!`);
    console.log(`   Date: ${dateStr}`);
    console.log(`   Week: ${result.weekId}`);
    console.log(`   Season: ${result.seasonId}`);
    console.log(`   Total records updated: ${result.totalRecordsUpdated}`);
    console.log(`   Breakdown:`);
    console.log(
      `     - Player weeks: ${result.breakdown.playerWeeks.created} created, ${result.breakdown.playerWeeks.updated} updated`,
    );
    console.log(
      `     - Player splits: ${result.breakdown.playerSplits.created} created, ${result.breakdown.playerSplits.updated} updated`,
    );
    console.log(
      `     - Player totals: ${result.breakdown.playerTotals.created} created, ${result.breakdown.playerTotals.updated} updated`,
    );
    console.log(
      `     - Team weeks: ${result.breakdown.teamWeeks.created} created, ${result.breakdown.teamWeeks.updated} updated`,
    );
    console.log(
      `     - Team seasons: ${result.breakdown.teamSeasons.created} created, ${result.breakdown.teamSeasons.updated} updated`,
    );
    console.log(`   Duration: ${elapsedSec}s`);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(
      `❌ [Stats/${triggerType}] Aggregation failed after ${duration}s:`,
      error,
    );
    throw error; // Re-throw so cron manager can log it
  }
}
