"use client";

/**
 * YahooScraperControl Component
 *
 * Admin interface for scraping daily player stats from Yahoo Fantasy Hockey.
 * Provides controls for manual scraping, ADD column recalculation, and displays
 * automated cron job configuration.
 *
 * Features:
 * - Manual scraper execution with date selection
 * - Dry run mode for testing
 * - Real-time progress tracking with elapsed time
 * - Detailed results display with created/updated/deleted counts
 * - ADD column recalculation utility
 * - Vercel cron schedule information
 */

import { useState, useEffect } from "react";
import { api } from "src/trpc/react";
import { Button } from "@gshl-ui";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getTodayDateString = () => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

// ============================================================================
// TYPES
// ============================================================================

interface ScrapeResultsData {
  seasonName: string;
  weekId: string;
  targetDate: string | undefined;
  scrapedTeams: number;
  totalPlayersScraped: number;
  playerDayRecordsBuilt: number;
  upsertResult: {
    created: number;
    updated: number;
    deleted: number;
    errors: number;
  };
  unmappedPlayerNames?: string[];
  errors?: string[];
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const ScrapeResults = ({ data }: { data: ScrapeResultsData }) => (
  <div className="rounded-md border bg-muted/50 p-4">
    <h3 className="mb-2 font-semibold">Scrape Results</h3>
    <div className="grid gap-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Season:</span>
        <span className="font-medium">{data.seasonName}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Week ID:</span>
        <span className="font-medium">{data.weekId}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Date:</span>
        <span className="font-medium">{data.targetDate}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Teams Scraped:</span>
        <span className="font-medium">{data.scrapedTeams}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Players Scraped:</span>
        <span className="font-medium">{data.totalPlayersScraped}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Records Built:</span>
        <span className="font-medium">{data.playerDayRecordsBuilt}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Created:</span>
        <span className="font-medium text-green-600">
          {data.upsertResult.created}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Updated:</span>
        <span className="font-medium text-blue-600">
          {data.upsertResult.updated}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Deleted:</span>
        <span className="font-medium text-orange-600">
          {data.upsertResult.deleted}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Errors:</span>
        <span className="font-medium text-red-600">
          {data.upsertResult.errors}
        </span>
      </div>

      {data.unmappedPlayerNames && data.unmappedPlayerNames.length > 0 && (
        <div className="mt-2 rounded border-l-4 border-yellow-500 bg-yellow-50 p-2">
          <p className="text-sm font-medium text-yellow-800">
            Unmapped Players ({data.unmappedPlayerNames.length}):
          </p>
          <p className="text-xs text-yellow-700">
            {data.unmappedPlayerNames.join(", ")}
          </p>
        </div>
      )}

      {data.errors && data.errors.length > 0 && (
        <div className="mt-2 rounded border-l-4 border-red-500 bg-red-50 p-2">
          <p className="text-sm font-medium text-red-800">Errors:</p>
          {data.errors.map((error: string, idx: number) => (
            <p key={idx} className="text-xs text-red-700">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  </div>
);

const AddRecalculationControl = () => {
  const [dryRun, setDryRun] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const recalculate = api.yahooScraper.recalculateAddColumn.useMutation({
    onMutate: () => {
      console.log("⏱️ ADD recalculation started...");
      setStartTime(Date.now());
      setElapsedTime(0);
    },
    onSuccess: (data) => {
      const duration = startTime
        ? ((Date.now() - startTime) / 1000).toFixed(1)
        : "?";
      console.log(`✅ ADD recalculation completed in ${duration}s:`, data);
      setStartTime(null);
      alert(
        `ADD recalculation completed in ${duration}s!\n\n` +
          `Total records: ${data.totalRecords}\n` +
          `Unique dates: ${data.uniqueDates}\n` +
          `Updates applied: ${data.updatesApplied}\n` +
          `ADDs detected: ${data.addCount}\n` +
          `No ADDs: ${data.noAddCount}`,
      );
    },
    onError: (error) => {
      const duration = startTime
        ? ((Date.now() - startTime) / 1000).toFixed(1)
        : "?";
      console.error(`❌ ADD recalculation failed after ${duration}s:`, error);
      setStartTime(null);
      alert(`ADD recalculation failed after ${duration}s: ${error.message}`);
    },
  });

  useEffect(() => {
    if (startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [startTime]);

  const handleRecalculate = () => {
    if (
      !dryRun &&
      !confirm(
        "Are you sure you want to recalculate ADD for ALL PlayerDay records? This will update the entire sheet.",
      )
    ) {
      return;
    }

    recalculate.mutate({ dryRun });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="add-dry-run"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="add-dry-run" className="text-sm text-purple-700">
          Dry run (preview changes without applying)
        </label>
      </div>

      <Button
        onClick={handleRecalculate}
        disabled={recalculate.isPending}
        className="bg-purple-600 hover:bg-purple-700"
      >
        {recalculate.isPending
          ? `Recalculating... (${elapsedTime}s)`
          : "Recalculate ADD Column"}
      </Button>

      {recalculate.isPending && (
        <div className="rounded-md border border-purple-200 bg-white p-3">
          <p className="text-sm text-purple-700">
            Processing all PlayerDay records...
          </p>
          <p className="text-xs text-purple-600">
            Time elapsed: {elapsedTime}s
          </p>
        </div>
      )}

      {recalculate.isSuccess && (
        <div className="rounded-md border border-purple-200 bg-white p-4">
          <h4 className="mb-3 font-semibold text-purple-900">
            Recalculation Results
          </h4>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Total Records:</span>
              <span className="font-medium">
                {recalculate.data.totalRecords}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Unique Dates:</span>
              <span className="font-medium">
                {recalculate.data.uniqueDates}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">Updates Applied:</span>
              <span className="font-medium text-blue-600">
                {recalculate.data.updatesApplied}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">ADDs Detected:</span>
              <span className="font-medium text-green-600">
                {recalculate.data.addCount}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <span className="text-muted-foreground">No ADDs:</span>
              <span className="font-medium text-gray-600">
                {recalculate.data.noAddCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {recalculate.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <h4 className="mb-2 font-semibold text-red-800">Error</h4>
          <p className="text-sm text-red-700">{recalculate.error.message}</p>
        </div>
      )}
    </div>
  );
};

const VercelCronInfo = () => (
  <div className="space-y-4">
    <div className="rounded-md border border-blue-200 bg-white p-4">
      <div className="mb-3">
        <h4 className="font-semibold text-blue-900">Cron Schedules</h4>
        <p className="mt-1 text-xs text-gray-600">
          Configured in{" "}
          <code className="rounded bg-gray-100 px-1">vercel.json</code> and
          managed by Vercel
        </p>
      </div>

      <div className="space-y-2">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-gray-900">Peak Games</span>
            <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              Active
            </span>
          </div>
          <p className="text-xs text-gray-600">
            Every 15 minutes from 7pm-2am ET
          </p>
          <code className="mt-1 block text-xs text-gray-500">
            */15 19-23,0-2 * * *
          </code>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-gray-900">Pre-Game</span>
            <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              Active
            </span>
          </div>
          <p className="text-xs text-gray-600">Every hour from 1pm-6pm ET</p>
          <code className="mt-1 block text-xs text-gray-500">
            0 13-18 * * *
          </code>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-gray-900">Morning</span>
            <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
              Active
            </span>
          </div>
          <p className="text-xs text-gray-600">Once at 4am and 8am ET</p>
          <code className="mt-1 block text-xs text-gray-500">0 4,8 * * *</code>
        </div>
      </div>
    </div>

    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
      <p className="mb-2">
        <strong>📋 Monitoring:</strong>
      </p>
      <ul className="list-inside list-disc space-y-1">
        <li>View cron execution logs in Vercel dashboard</li>
        <li>Check function logs for scraper output</li>
        <li>Verify CRON_SECRET is set in environment variables</li>
        <li>
          Endpoint:{" "}
          <code className="rounded bg-gray-100 px-1">
            /api/cron/yahoo-scraper/trigger
          </code>
        </li>
      </ul>
      <p className="mt-3">
        <strong>📚 Documentation:</strong> See{" "}
        <code className="rounded bg-gray-100 px-1">VERCEL_DEPLOYMENT.md</code>{" "}
        for setup details
      </p>
    </div>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function YahooScraperControl() {
  const [targetDate, setTargetDate] = useState(getTodayDateString);
  const [leagueId, setLeagueId] = useState("6989");
  const [dryRun, setDryRun] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const scrapeAndSync = api.yahooScraper.scrapeAndSyncPlayerDays.useMutation({
    onMutate: () => {
      console.log("⏱️ Scraping started...");
      setStartTime(Date.now());
      setElapsedTime(0);
    },
    onSuccess: (data) => {
      const duration = startTime
        ? ((Date.now() - startTime) / 1000).toFixed(1)
        : "?";
      console.log(`✅ Scrape completed in ${duration}s:`, data);
      setStartTime(null);
      alert(
        `Scrape completed in ${duration}s!\n\n` +
          `Season: ${data.seasonName}\n` +
          `Week: ${data.weekId}\n` +
          `Date: ${data.targetDate}\n` +
          `Teams scraped: ${data.scrapedTeams}\n` +
          `Players scraped: ${data.totalPlayersScraped}\n` +
          `Records created: ${data.upsertResult.created}\n` +
          `Records updated: ${data.upsertResult.updated}\n` +
          `Records deleted: ${data.upsertResult.deleted}\n` +
          `Errors: ${data.upsertResult.errors}`,
      );
    },
    onError: (error) => {
      const duration = startTime
        ? ((Date.now() - startTime) / 1000).toFixed(1)
        : "?";
      console.error(`❌ Scrape failed after ${duration}s:`, error);
      setStartTime(null);
      alert(`Scrape failed after ${duration}s: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedTime((Date.now() - startTime) / 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime]);

  const handleScrape = () => {
    if (!targetDate) {
      alert("Please select a date");
      return;
    }

    console.log(
      `🚀 Starting scrape for date: ${targetDate}, league: ${leagueId}, dryRun: ${dryRun}`,
    );
    scrapeAndSync.mutate({
      leagueId,
      targetDate,
      dryRun,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="leagueId">
            League ID
          </label>
          <input
            id="leagueId"
            type="text"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="6989"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="targetDate">
            Target Date
          </label>
          <input
            id="targetDate"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Options</label>
          <div className="flex items-center space-x-2">
            <input
              id="dryRun"
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="dryRun" className="text-sm">
              Dry Run (don&apos;t save)
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button
          onClick={handleScrape}
          disabled={scrapeAndSync.isPending}
          className="min-w-[150px]"
        >
          {scrapeAndSync.isPending ? "Scraping..." : "Run Scraper"}
        </Button>

        {scrapeAndSync.isPending && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <span className="text-sm font-medium text-muted-foreground">
              Scraping data... {elapsedTime.toFixed(1)}s
            </span>
            {elapsedTime > 10 && (
              <span className="text-xs text-yellow-600">
                (Scraping {Math.ceil(elapsedTime / 14)} teams, this may take a
                while)
              </span>
            )}
            {elapsedTime > 30 && (
              <span className="text-xs font-medium text-orange-600">
                Still working... Check console for progress
              </span>
            )}
          </div>
        )}
      </div>

      {scrapeAndSync.isSuccess && scrapeAndSync.data && (
        <ScrapeResults data={scrapeAndSync.data} />
      )}

      {scrapeAndSync.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 font-semibold text-red-800">Error</h3>
          <p className="text-sm text-red-700">{scrapeAndSync.error.message}</p>
        </div>
      )}

      <div className="mt-8 rounded-md border border-purple-200 bg-purple-50 p-4">
        <h3 className="mb-2 font-semibold text-purple-900">
          Recalculate ADD Column
        </h3>
        <p className="mb-4 text-sm text-purple-700">
          One-time operation to recalculate the ADD column for all PlayerDay
          records. Compares each day with the previous day. Season start dates
          have no ADDs.
        </p>
        <AddRecalculationControl />
      </div>

      <div className="mt-8 rounded-md border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-900">
          Automated Scraping (Vercel Cron)
        </h3>
        <p className="mb-4 text-sm text-blue-700">
          Automatic scraping is configured in{" "}
          <code className="rounded bg-blue-100 px-1">vercel.json</code> and runs
          on Vercel&apos;s platform.
        </p>
        <VercelCronInfo />
      </div>
    </div>
  );
}
