/**
 * Vercel Cron Job Trigger Endpoint
 *
 * This endpoint is called by Vercel's cron service on the schedule defined in vercel.json.
 *
 * Target Date Logic:
 * - Before 7:00 AM ET: Scrapes PREVIOUS day (finishing overnight games)
 * - 7:00 AM ET onwards: Scrapes CURRENT day (new game day starts)
 *
 * Examples:
 * - 4:00 AM run → scrapes yesterday
 * - 8:00 AM run → scrapes today
 *
 * IMPORTANT: Protect this endpoint in production!
 * Add authentication via:
 * - Vercel's Authorization header (recommended)
 * - Custom secret token
 * - IP whitelist
 */

import { type NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 minute timeout (Vercel Pro allows up to 300s)
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");

  if (process.env.NODE_ENV === "production") {
    // In production, verify the cron secret
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  const startTime = Date.now();

  try {
    console.log("🕐 [Vercel Cron] Yahoo scraper triggered");

    // Dynamic import the yahoo scraper router
    const { yahooScraperRouter } = await import(
      "@gshl-api/routers/yahoo-scraper"
    );

    // Create caller context
    const caller = yahooScraperRouter.createCaller({
      headers: new Headers(),
    });

    // Determine the target date based on time of day
    // Before 7 AM ET: scrape previous day
    // 7 AM ET onwards: scrape current day
    const now = new Date();
    const etHour = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    ).getHours();

    const targetDate = new Date(now);

    // If it's before 7 AM ET, scrape the previous day
    if (etHour < 7) {
      targetDate.setDate(targetDate.getDate() - 1);
      console.log(
        `🌙 [Vercel Cron] Before 7 AM ET (${etHour}h) - scraping previous day`,
      );
    } else {
      console.log(
        `☀️ [Vercel Cron] After 7 AM ET (${etHour}h) - scraping current day`,
      );
    }

    const targetDateStr = targetDate.toISOString().split("T")[0]!;

    console.log(`📅 [Vercel Cron] Scraping for ${targetDateStr}...`);

    // Execute the scrape
    const result = await caller.scrapeAndSyncPlayerDays({
      targetDate: targetDateStr,
      dryRun: false,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ [Vercel Cron] Completed in ${duration}s:`, {
      season: result.seasonName,
      week: result.weekId,
      teams: result.scrapedTeams,
      players: result.totalPlayersScraped,
      created: result.upsertResult.created,
      updated: result.upsertResult.updated,
      deleted: result.upsertResult.deleted,
      errors: result.upsertResult.errors,
    });

    return NextResponse.json({
      success: true,
      message: "Yahoo scraper executed successfully",
      duration: `${duration}s`,
      data: {
        seasonName: result.seasonName,
        weekId: result.weekId,
        targetDate: result.targetDate,
        scrapedTeams: result.scrapedTeams,
        totalPlayers: result.totalPlayersScraped,
        created: result.upsertResult.created,
        updated: result.upsertResult.updated,
        deleted: result.upsertResult.deleted,
        errors: result.upsertResult.errors,
      },
    });
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.error(`❌ [Vercel Cron] Failed after ${duration}s:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration: `${duration}s`,
      },
      { status: 500 },
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
