/**
 * Cron Job Registrations
 * -----------------------
 * Register all scheduled tasks with the cron manager.
 * Jobs are automatically enabled based on environment variables.
 */

import { cronManager } from "./manager";

// Check if cron jobs should be enabled
const ENABLE_CRON = process.env.ENABLE_CRON === "true";
const ENABLE_YAHOO_SCRAPER = process.env.ENABLE_YAHOO_SCRAPER_CRON === "true";
const ENABLE_STAT_AGGREGATION =
  process.env.ENABLE_STAT_AGGREGATION_CRON === "true";

/**
 * Yahoo Scraper Jobs
 * ------------------
 * Scrapes Yahoo Fantasy Hockey data on an NHL-optimized schedule.
 */
if (ENABLE_CRON && ENABLE_YAHOO_SCRAPER) {
  // Peak game time: Every 15 minutes from 7 PM to 2 AM ET
  cronManager.register({
    name: "yahoo-scraper-peak",
    schedule: "*/15 19-23,0-2 * * *",
    timezone: "America/New_York",
    enabled: true,
    task: async () => {
      const { runYahooScraper } = await import("./tasks/yahoo-scraper.js");
      await runYahooScraper("peak-game");
    },
  });

  // Pre-game period: Every hour from 1 PM to 7 PM ET
  cronManager.register({
    name: "yahoo-scraper-pregame",
    schedule: "0 13-18 * * *",
    timezone: "America/New_York",
    enabled: true,
    task: async () => {
      const { runYahooScraper } = await import("./tasks/yahoo-scraper.js");
      await runYahooScraper("pre-game");
    },
  });

  // Morning updates: 4 AM and 8 AM ET
  cronManager.register({
    name: "yahoo-scraper-morning",
    schedule: "0 4,8 * * *",
    timezone: "America/New_York",
    enabled: true,
    task: async () => {
      const { runYahooScraper } = await import("./tasks/yahoo-scraper.js");
      await runYahooScraper("morning");
    },
  });
}

/**
 * Stat Aggregation Jobs
 * ----------------------
 * Rebuilds stat aggregations for completed game days.
 */
if (ENABLE_CRON && ENABLE_STAT_AGGREGATION) {
  // Primary run: 3 AM ET (after all games complete)
  cronManager.register({
    name: "stat-aggregation-primary",
    schedule: "0 3 * * *",
    timezone: "America/New_York",
    enabled: true,
    task: async () => {
      const { runStatAggregation } = await import(
        "./tasks/stat-aggregation.js"
      );
      await runStatAggregation("primary");
    },
  });

  // Secondary run: 6 AM ET (catch any late-finishing games)
  cronManager.register({
    name: "stat-aggregation-secondary",
    schedule: "0 6 * * *",
    timezone: "America/New_York",
    enabled: true,
    task: async () => {
      const { runStatAggregation } = await import(
        "./tasks/stat-aggregation.js"
      );
      await runStatAggregation("secondary");
    },
  });
}

// Log registration summary
const status = cronManager.getStatus();
if (status.length > 0) {
  console.log(`\n📋 [Cron] Registered ${status.length} jobs:`);
  for (const job of status) {
    console.log(`   - ${job.name}: ${job.schedule} (${job.timezone})`);
  }
  console.log("");
} else {
  console.log(`\n⚠️  [Cron] No jobs registered (ENABLE_CRON=${ENABLE_CRON})\n`);
}
