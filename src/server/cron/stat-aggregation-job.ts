/**
 * Stat Aggregation Cron Job
 *
 * Automatically rebuilds stat aggregations for completed game days.
 * Runs daily to ensure all stats are up-to-date across the hierarchy.
 *
 * Schedule (Eastern Time):
 * - 3:00 AM ET: Rebuild stats for the previous day (after all games complete)
 * - 6:00 AM ET: Secondary run for any late-finishing games
 *
 * What it does:
 * - Aggregates player days → player weeks → player splits/totals
 * - Aggregates team days → team weeks → team seasons
 * - Updates all stat levels for the specified date
 *
 * Safe to run multiple times (idempotent via upserts)
 */

import cron, { type ScheduledTask } from "node-cron";
import { appRouter } from "../api/root";
import { createTRPCContext } from "../api/trpc";

type CronTask = {
  name: string;
  schedule: string;
  task: ScheduledTask;
};

const activeTasks: CronTask[] = [];

/**
 * Execute the stat aggregation rebuild for a specific date
 */
async function runStatAggregation(
  triggerType: "primary" | "secondary",
  targetDate?: Date,
) {
  const startTime = Date.now();

  try {
    // Determine target date
    // Default: previous day (games finish by 3 AM)
    const rawDate = targetDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Normalize to midnight in local timezone (YYYY-MM-DD at 00:00:00)
    const dateStr = rawDate.toISOString().split("T")[0]!;
    const date = new Date(`${dateStr}T00:00:00.000`);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 [Cron] Starting stat aggregation rebuild (${triggerType})`);
    console.log(`   Target date: ${dateStr}`);
    console.log(
      `   Triggered at: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET`,
    );
    console.log(`${"=".repeat(60)}\n`);

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

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ [Cron] Stat aggregation complete!`);
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
      `     - Team days: ${result.breakdown.teamDays.created} created, ${result.breakdown.teamDays.updated} updated`,
    );
    console.log(
      `     - Team weeks: ${result.breakdown.teamWeeks.created} created, ${result.breakdown.teamWeeks.updated} updated`,
    );
    console.log(
      `     - Team seasons: ${result.breakdown.teamSeasons.created} created, ${result.breakdown.teamSeasons.updated} updated`,
    );
    console.log(`   Elapsed time: ${elapsedSec}s`);

    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.forEach((err, i) => {
        console.log(`     ${i + 1}. ${err}`);
      });
    }

    console.log(`${"=".repeat(60)}\n`);

    return result;
  } catch (error) {
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

    console.error(`\n${"=".repeat(60)}`);
    console.error(`❌ [Cron] Stat aggregation failed!`);
    console.error(`   Trigger: ${triggerType}`);
    console.error(`   Elapsed time: ${elapsedSec}s`);
    console.error(`   Error:`, error);
    console.error(`${"=".repeat(60)}\n`);

    throw error;
  }
}

/**
 * Start the stat aggregation cron job
 */
export function startStatAggregationCron() {
  console.log("🕐 [Cron] Initializing Stat Aggregation cron jobs...");

  // Primary run: 3:00 AM ET (after all games complete)
  // Cron format: minute hour day month weekday
  const primarySchedule = cron.schedule(
    "0 3 * * *",
    async () => {
      console.log("📊 [Cron] Primary stat aggregation triggered (3:00 AM ET)");
      await runStatAggregation("primary");
    },
    {
      timezone: "America/New_York",
    },
  );

  // Secondary run: 6:00 AM ET (catch any late-finishing games)
  const secondarySchedule = cron.schedule(
    "0 6 * * *",
    async () => {
      console.log(
        "📊 [Cron] Secondary stat aggregation triggered (6:00 AM ET)",
      );
      await runStatAggregation("secondary");
    },
    {
      timezone: "America/New_York",
    },
  );

  activeTasks.push(
    { name: "primary", schedule: "0 3 * * *", task: primarySchedule },
    { name: "secondary", schedule: "0 6 * * *", task: secondarySchedule },
  );

  console.log("✅ [Cron] Stat Aggregation cron jobs started:");
  console.log("   - Primary: 3:00 AM ET (post-game)");
  console.log("   - Secondary: 6:00 AM ET (late games)");
}

/**
 * Stop all stat aggregation cron jobs
 */
export function stopStatAggregationCron() {
  console.log("🛑 [Cron] Stopping Stat Aggregation cron jobs...");

  for (const { name, task } of activeTasks) {
    void task.stop();
    console.log(`   ✓ Stopped: ${name}`);
  }

  activeTasks.length = 0;
  console.log("✅ [Cron] All Stat Aggregation cron jobs stopped");
}

/**
 * Check if any stat aggregation cron jobs are running
 */
export function isStatAggregationCronRunning(): boolean {
  return activeTasks.length > 0;
}

/**
 * Get status of all stat aggregation cron jobs
 */
export function getStatAggregationCronStatus() {
  return {
    running: activeTasks.length > 0,
    tasks: activeTasks.map(({ name, schedule }) => ({
      name,
      schedule,
      timezone: "America/New_York",
    })),
  };
}

/**
 * Manually trigger stat aggregation for a specific date
 * Useful for backfilling or re-processing
 */
export async function manualStatAggregation(date: Date) {
  console.log(
    `🔧 [Manual] Manually triggering stat aggregation for ${date.toISOString().split("T")[0]}`,
  );
  return runStatAggregation("primary", date);
}
