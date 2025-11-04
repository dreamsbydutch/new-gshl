/**
 * Yahoo Scraper Cron Job
 *
 * Automatically scrapes Yahoo Fantasy Hockey rosters and syncs PlayerDay records
 * on a schedule optimized for NHL game times.
 *
 * Schedule (Eastern Time):
 * - Every 15 minutes: 7:00 PM - 2:00 AM (peak game time)
 * - Every hour: 1:00 PM - 7:00 PM (pre-game period)
 * - Twice daily: 4:00 AM and 8:00 AM (morning updates)
 *
 * Target Date Logic:
 * - Before 7:00 AM ET: Scrapes PREVIOUS day (finishing overnight games)
 * - 7:00 AM ET onwards: Scrapes CURRENT day (new game day starts)
 *
 * Examples:
 * - 4:00 AM run → scrapes yesterday
 * - 8:00 AM run → scrapes today
 * - 7:00 PM run → scrapes today
 */

import cron, { type ScheduledTask } from "node-cron";

type CronTask = {
  name: string;
  schedule: string;
  task: ScheduledTask;
};

const activeTasks: CronTask[] = [];

/**
 * Start the Yahoo scraper cron job
 */
export function startYahooScraperCron() {
  console.log("🕐 [Cron] Initializing Yahoo Scraper cron jobs...");

  // Peak game time: Every 15 minutes from 7 PM to 2 AM ET
  // Cron format: minute hour day month weekday
  // 7 PM = 19:00, 2 AM = 2:00
  const peakGameSchedule = cron.schedule(
    "*/15 19-23,0-2 * * *",
    async () => {
      console.log(
        "🏒 [Cron] Peak game time scrape triggered (every 15 min, 7PM-2AM ET)",
      );
      await runYahooScraper("peak-game");
    },
    {
      timezone: "America/New_York",
    },
  );

  // Pre-game period: Every hour from 1 PM to 7 PM ET
  const preGameSchedule = cron.schedule(
    "0 13-18 * * *",
    async () => {
      console.log("📋 [Cron] Pre-game scrape triggered (hourly, 1PM-7PM ET)");
      await runYahooScraper("pre-game");
    },
    {
      timezone: "America/New_York",
    },
  );

  // Morning updates: 4 AM and 8 AM ET
  const morningSchedule = cron.schedule(
    "0 4,8 * * *",
    async () => {
      console.log("🌅 [Cron] Morning scrape triggered (4AM & 8AM ET)");
      await runYahooScraper("morning");
    },
    {
      timezone: "America/New_York",
    },
  );

  activeTasks.push(
    {
      name: "peak-game",
      schedule: "*/15 19-23,0-2 * * *",
      task: peakGameSchedule,
    },
    { name: "pre-game", schedule: "0 13-18 * * *", task: preGameSchedule },
    { name: "morning", schedule: "0 4,8 * * *", task: morningSchedule },
  );

  console.log("✅ [Cron] Yahoo Scraper cron jobs started:");
  console.log("   - Peak game: Every 15 min (7PM-2AM ET)");
  console.log("   - Pre-game: Hourly (1PM-7PM ET)");
  console.log("   - Morning: 4AM & 8AM ET");
}

/**
 * Stop all Yahoo scraper cron jobs
 */
export function stopYahooScraperCron() {
  console.log("🛑 [Cron] Stopping Yahoo Scraper cron jobs...");

  for (const { name, task } of activeTasks) {
    task.stop();
    console.log(`   - Stopped: ${name}`);
  }

  activeTasks.length = 0;
  console.log("✅ [Cron] All Yahoo Scraper cron jobs stopped");
}

/**
 * Get status of all cron jobs
 */
export function getYahooScraperCronStatus() {
  return activeTasks.map(({ name, schedule, task }) => ({
    name,
    schedule,
    running: task.getStatus() === "scheduled",
  }));
}

/**
 * Execute the Yahoo scraper
 */
async function runYahooScraper(trigger: string) {
  const startTime = Date.now();

  try {
    // Dynamic import to avoid circular dependencies
    const { yahooScraperRouter } = await import("../api/routers/yahoo-scraper");

    // Create a caller context
    const caller = yahooScraperRouter.createCaller({
      headers: new Headers(),
    });

    // Determine the target date based on time of day
    // Before 7 AM ET: scrape previous day
    // 7 AM ET onwards: scrape current day
    const now = new Date();

    // Get the current date in ET timezone
    const etDateStr = now.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    }); // en-CA gives YYYY-MM-DD format

    const etHour = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    ).getHours();

    // Parse the ET date and adjust if before 7 AM
    const targetDate = new Date(etDateStr + "T00:00:00.000");

    // If it's before 7 AM ET, scrape the previous day
    if (etHour < 7) {
      targetDate.setDate(targetDate.getDate() - 1);
      console.log(
        `🌙 [Cron/${trigger}] Before 7 AM ET - scraping previous day`,
      );
    } else {
      console.log(`☀️ [Cron/${trigger}] After 7 AM ET - scraping current day`);
    }

    const targetDateStr = targetDate.toISOString().split("T")[0]!;

    console.log(
      `📅 [Cron/${trigger}] Starting scrape for ${targetDateStr} (ET hour: ${etHour})...`,
    );

    // Call the scrapeAndSyncPlayerDays mutation
    const result = await caller.scrapeAndSyncPlayerDays({
      targetDate: targetDateStr,
      dryRun: false,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ [Cron/${trigger}] Scrape completed in ${duration}s:`, {
      season: result.seasonName,
      teams: result.scrapedTeams,
      players: result.totalPlayersScraped,
      created: result.upsertResult.created,
      updated: result.upsertResult.updated,
      deleted: result.upsertResult.deleted,
      errors: result.upsertResult.errors,
    });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(
      `❌ [Cron/${trigger}] Scrape failed after ${duration}s:`,
      error,
    );
  }
}
