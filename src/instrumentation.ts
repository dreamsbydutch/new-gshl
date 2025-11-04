/**
 * Next.js Instrumentation
 *
 * This file runs once when the Next.js server starts.
 * Use it to initialize services like cron jobs.
 *
 * Note: Only runs in Node.js runtime, not in Edge runtime.
 */

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Only start cron jobs in development or if explicitly enabled
    const shouldStartCron =
      process.env.NODE_ENV === "development" ||
      process.env.ENABLE_CRON === "true";

    if (shouldStartCron) {
      console.log("🔧 [Instrumentation] Initializing server services...");

      // Import and start the cron jobs
      const { startYahooScraperCron } = await import(
        "./server/cron/yahoo-scraper-job"
      );
      const { startStatAggregationCron } = await import(
        "./server/cron/stat-aggregation-job"
      );

      startYahooScraperCron();
      startStatAggregationCron();

      console.log("✅ [Instrumentation] Server initialization complete");
    } else {
      console.log(
        "⏭️  [Instrumentation] Cron jobs disabled (use ENABLE_CRON=true to enable)",
      );
    }
  }
}
