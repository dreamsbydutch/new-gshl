/**
 * Yahoo Scraper Task
 * -------------------
 * Core scraping logic extracted for use by cron jobs.
 */

/**
 * Execute the Yahoo scraper for a specific trigger type
 */
export async function runYahooScraper(trigger: string): Promise<void> {
  const startTime = Date.now();

  try {
    // Dynamic import to avoid circular dependencies
    const { yahooScraperRouter } = await import(
      "../../api/routers/yahoo-scraper"
    );

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
        `🌙 [Yahoo/${trigger}] Before 7 AM ET - scraping previous day`,
      );
    } else {
      console.log(`☀️ [Yahoo/${trigger}] After 7 AM ET - scraping current day`);
    }

    const targetDateStr = targetDate.toISOString().split("T")[0]!;

    console.log(
      `📅 [Yahoo/${trigger}] Starting scrape for ${targetDateStr} (ET hour: ${etHour})...`,
    );

    // Call the scrapeAndSyncPlayerDays mutation
    const result = await caller.scrapeAndSyncPlayerDays({
      targetDate: targetDateStr,
      dryRun: false,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ [Yahoo/${trigger}] Scrape completed in ${duration}s:`, {
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
      `❌ [Yahoo/${trigger}] Scrape failed after ${duration}s:`,
      error,
    );
    throw error; // Re-throw so cron manager can log it
  }
}
