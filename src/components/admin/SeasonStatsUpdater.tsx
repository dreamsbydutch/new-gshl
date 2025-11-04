"use client";

/**
 * SeasonStatsUpdater Component
 *
 * Comprehensive pipeline for processing all stats for an entire season.
 * Orchestrates multi-stage aggregation:
 * 1. PlayerDay → PlayerWeek → PlayerSplit → PlayerTotal
 * 2. PlayerDay → TeamDay → TeamWeek → TeamSeason
 * 3. TeamWeek → Matchup Scores (all weeks)
 *
 * Features:
 * - Season-level batch processing
 * - Real-time progress tracking across all stages
 * - Detailed results for each aggregation layer
 * - Automatic validation and error handling
 *
 * @example
 * ```tsx
 * <SeasonStatsUpdater />
 * ```
 */

import { useState } from "react";
import { clientApi as api } from "@gshl-trpc";
import { Button } from "@gshl-ui";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ProcessingProgress {
  step: number;
  total: number;
  detail: string;
}

interface AggregationDetails {
  playerWeeks: { count: number; created?: number; updated?: number };
  playerSplits: { count: number; created?: number; updated?: number };
  playerTotals: { count: number; created?: number; updated?: number };
  teamDays: { count: number; created?: number; updated?: number };
  teamWeeks: { count: number; created?: number; updated?: number };
  teamSeasons: { count: number; created?: number; updated?: number };
  matchups: {
    totalWeeks: number;
    matchupsUpdated: number;
    errors: number;
  };
  summary?: {
    totalWeeks: number;
    processingTime: string;
  };
}

interface ProcessingResult {
  success: boolean;
  message: string;
  details?: AggregationDetails;
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * SeasonInputSection
 *
 * Input controls for selecting season and triggering aggregation
 */
const SeasonInputSection = ({
  seasonId,
  onSeasonIdChange,
  onProcess,
  isProcessing,
  weeksCount,
}: {
  seasonId: string;
  onSeasonIdChange: (value: string) => void;
  onProcess: () => void;
  isProcessing: boolean;
  weeksCount?: number;
}) => (
  <div className="space-y-3">
    <div className="flex gap-2">
      <input
        type="text"
        placeholder="Season ID (e.g., 11)"
        value={seasonId}
        onChange={(e) => onSeasonIdChange(e.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      <Button
        onClick={onProcess}
        disabled={isProcessing || !seasonId}
        className="min-w-[140px]"
      >
        {isProcessing ? "Processing..." : "Update Season"}
      </Button>
    </div>

    {weeksCount !== undefined && seasonId && (
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950">
        <p className="text-blue-900 dark:text-blue-100">
          Ready to process <strong>{weeksCount} weeks</strong> for season{" "}
          {seasonId}
        </p>
      </div>
    )}
  </div>
);

/**
 * ProgressIndicator
 *
 * Visual progress bar and status for multi-step aggregation
 */
const ProgressIndicator = ({
  currentStep,
  progress,
}: {
  currentStep: string;
  progress: ProcessingProgress;
}) => (
  <div className="space-y-2 rounded-md border border-blue-500 bg-blue-50 p-4 dark:bg-blue-950">
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
        {currentStep}
      </p>
      <p className="text-xs text-blue-700 dark:text-blue-300">
        Step {progress.step}/{progress.total}
      </p>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
      <div
        className="h-full bg-blue-600 transition-all duration-300 dark:bg-blue-400"
        style={{
          width: `${(progress.step / progress.total) * 100}%`,
        }}
      />
    </div>
    <p className="text-xs text-blue-600 dark:text-blue-400">
      {progress.detail}
    </p>
  </div>
);

/**
 * ResultsDisplay
 *
 * Displays comprehensive results from all aggregation stages
 */
const ResultsDisplay = ({ result }: { result: ProcessingResult }) => (
  <div
    className={`rounded-md border p-4 ${
      result.success
        ? "border-green-500 bg-green-50 dark:bg-green-950"
        : "border-red-500 bg-red-50 dark:bg-red-950"
    }`}
  >
    <p
      className={
        result.success
          ? "text-green-900 dark:text-green-100"
          : "text-red-900 dark:text-red-100"
      }
    >
      {result.message}
    </p>

    {result.success && result.details && (
      <div className="mt-4 space-y-3 text-sm">
        {/* Player Stats Section */}
        <div className="rounded border border-green-300 bg-green-100 p-3 dark:border-green-800 dark:bg-green-900">
          <strong className="text-green-900 dark:text-green-100">
            Player Stats:
          </strong>
          <div className="ml-4 mt-2 space-y-1 text-green-800 dark:text-green-200">
            <div>
              <strong>Player Weeks:</strong> {result.details.playerWeeks.count}{" "}
              total
              {result.details.playerWeeks.created !== undefined && (
                <>
                  {" "}
                  ({result.details.playerWeeks.created} created,{" "}
                  {result.details.playerWeeks.updated} updated)
                </>
              )}
            </div>
            <div>
              <strong>Player Splits:</strong>{" "}
              {result.details.playerSplits.count} total
              {result.details.playerSplits.created !== undefined && (
                <>
                  {" "}
                  ({result.details.playerSplits.created} created,{" "}
                  {result.details.playerSplits.updated} updated)
                </>
              )}
            </div>
            <div>
              <strong>Player Totals:</strong>{" "}
              {result.details.playerTotals.count} total
              {result.details.playerTotals.created !== undefined && (
                <>
                  {" "}
                  ({result.details.playerTotals.created} created,{" "}
                  {result.details.playerTotals.updated} updated)
                </>
              )}
            </div>
          </div>
        </div>

        {/* Team Stats Section */}
        <div className="rounded border border-green-300 bg-green-100 p-3 dark:border-green-800 dark:bg-green-900">
          <strong className="text-green-900 dark:text-green-100">
            Team Stats:
          </strong>
          <div className="ml-4 mt-2 space-y-1 text-green-800 dark:text-green-200">
            <div>
              <strong>Team Days:</strong> {result.details.teamDays.count} total
              {result.details.teamDays.created !== undefined && (
                <>
                  {" "}
                  ({result.details.teamDays.created} created,{" "}
                  {result.details.teamDays.updated} updated)
                </>
              )}
            </div>
            <div>
              <strong>Team Weeks:</strong> {result.details.teamWeeks.count}{" "}
              total
              {result.details.teamWeeks.created !== undefined && (
                <>
                  {" "}
                  ({result.details.teamWeeks.created} created,{" "}
                  {result.details.teamWeeks.updated} updated)
                </>
              )}
            </div>
            <div>
              <strong>Team Seasons:</strong> {result.details.teamSeasons.count}{" "}
              total
              {result.details.teamSeasons.created !== undefined && (
                <>
                  {" "}
                  ({result.details.teamSeasons.created} created,{" "}
                  {result.details.teamSeasons.updated} updated)
                </>
              )}
            </div>
          </div>
        </div>

        {/* Matchups Section */}
        <div className="rounded border border-green-300 bg-green-100 p-3 dark:border-green-800 dark:bg-green-900">
          <strong className="text-green-900 dark:text-green-100">
            Matchups:
          </strong>
          <div className="ml-4 mt-2 space-y-1 text-green-800 dark:text-green-200">
            <div>
              <strong>Weeks Processed:</strong>{" "}
              {result.details.matchups.totalWeeks}
            </div>
            <div>
              <strong>Matchups Updated:</strong>{" "}
              {result.details.matchups.matchupsUpdated}
            </div>
            {result.details.matchups.errors > 0 && (
              <div className="text-yellow-700 dark:text-yellow-300">
                <strong>Errors:</strong> {result.details.matchups.errors}
              </div>
            )}
          </div>
        </div>

        {/* Summary Section */}
        {result.details.summary && (
          <div className="rounded border border-green-300 bg-green-100 p-3 dark:border-green-800 dark:bg-green-900">
            <strong className="text-green-900 dark:text-green-100">
              Summary:
            </strong>
            <div className="ml-4 mt-2 space-y-1 text-green-800 dark:text-green-200">
              <div>
                <strong>Total Weeks:</strong>{" "}
                {result.details.summary.totalWeeks}
              </div>
              <div>
                <strong>Processing Time:</strong>{" "}
                {result.details.summary.processingTime}
              </div>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);

/**
 * InfoSection
 *
 * Displays pipeline information and usage notes
 */
const InfoSection = () => (
  <div className="rounded-md bg-muted p-4 text-sm">
    <h3 className="mb-2 font-semibold">Complete Season Pipeline:</h3>
    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
      <li>
        <strong>Player Stats:</strong> PlayerDay → PlayerWeek → PlayerSplit +
        PlayerTotal
      </li>
      <li>
        <strong>Team Stats:</strong> PlayerDay → TeamDay → TeamWeek → TeamSeason
      </li>
      <li>
        <strong>Matchups:</strong> Auto-updated for all weeks based on TeamWeek
        stats
      </li>
      <li>
        <strong>Filtering:</strong> Only started players (GS = 1) counted for
        stat categories
      </li>
    </ol>
    <p className="mt-3 text-xs text-muted-foreground">
      ⚠️ This processes the entire season. Make sure PlayerDayStatLine data
      exists for all weeks first.
    </p>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function SeasonStatsUpdater() {
  const [seasonId, setSeasonId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  // API mutations
  const aggregatePlayerWeeks =
    api.playerStats.weekly.aggregateAndCreateFromDays.useMutation();
  const aggregatePlayerSplits =
    api.playerStats.splits.aggregateAndCreateFromWeeks.useMutation();
  const aggregatePlayerTotals =
    api.playerStats.totals.aggregateAndCreateFromWeeks.useMutation();
  const aggregateTeamDays =
    api.teamStats.daily.aggregateAndCreateFromPlayerDays.useMutation();
  const aggregateTeamWeeks =
    api.teamStats.weekly.aggregateAndCreateFromDays.useMutation();
  const aggregateTeamSeasons =
    api.teamStats.season.aggregateAndCreateFromWeeks.useMutation();

  const utils = api.useUtils();

  // Query weeks for the season
  const { data: weeks } = api.week.getAll.useQuery(
    { where: { seasonId } },
    { enabled: !!seasonId && seasonId.trim() !== "" },
  );

  const handleUpdateSeason = async () => {
    if (!seasonId || seasonId.trim() === "") {
      setResult({
        success: false,
        message: "Please enter a season ID",
      });
      return;
    }

    // Fetch weeks for the season
    const fetchedWeeks = await utils.week.getAll.fetch({
      where: { seasonId: seasonId.trim() },
    });

    if (!fetchedWeeks || fetchedWeeks.length === 0) {
      setResult({
        success: false,
        message: `No weeks found for season ${seasonId}. Make sure the season exists and has weeks defined.`,
      });
      return;
    }

    console.log(`📅 Found ${fetchedWeeks.length} weeks for season ${seasonId}`);

    setIsProcessing(true);
    setResult(null);
    const startTime = Date.now();

    const details: AggregationDetails = {
      playerWeeks: { count: 0 },
      playerSplits: { count: 0 },
      playerTotals: { count: 0 },
      teamDays: { count: 0 },
      teamWeeks: { count: 0 },
      teamSeasons: { count: 0 },
      matchups: { totalWeeks: 0, matchupsUpdated: 0, errors: 0 },
    };

    try {
      const totalSteps = fetchedWeeks.length * 3 + 3;
      let currentStepNum = 0;

      // Process each week
      for (let i = 0; i < fetchedWeeks.length; i++) {
        const week = fetchedWeeks[i];
        if (!week) continue;

        const weekNum = i + 1;

        // 1. PlayerWeeks for this week
        currentStepNum++;
        setCurrentStep(
          `Week ${weekNum}/${fetchedWeeks.length}: Aggregating Player Weeks`,
        );
        setProgress({
          step: currentStepNum,
          total: totalSteps,
          detail: `Processing week ${week.id}`,
        });

        const playerWeekResult = await aggregatePlayerWeeks.mutateAsync({
          weekId: week.id,
        });

        details.playerWeeks.count += playerWeekResult.count;
        details.playerWeeks.created =
          (details.playerWeeks.created ?? 0) + (playerWeekResult.created ?? 0);
        details.playerWeeks.updated =
          (details.playerWeeks.updated ?? 0) + (playerWeekResult.updated ?? 0);

        // 2. TeamDays for this week
        currentStepNum++;
        setCurrentStep(
          `Week ${weekNum}/${fetchedWeeks.length}: Aggregating Team Days`,
        );
        setProgress({
          step: currentStepNum,
          total: totalSteps,
          detail: `Processing week ${week.id}`,
        });

        const teamDayResult = await aggregateTeamDays.mutateAsync({
          weekId: week.id,
        });

        details.teamDays.count += teamDayResult.count;
        details.teamDays.created =
          (details.teamDays.created ?? 0) + (teamDayResult.created ?? 0);
        details.teamDays.updated =
          (details.teamDays.updated ?? 0) + (teamDayResult.updated ?? 0);

        // 3. TeamWeeks for this week
        currentStepNum++;
        setCurrentStep(
          `Week ${weekNum}/${fetchedWeeks.length}: Aggregating Team Weeks`,
        );
        setProgress({
          step: currentStepNum,
          total: totalSteps,
          detail: `Processing week ${week.id}`,
        });

        const teamWeekResult = await aggregateTeamWeeks.mutateAsync({
          weekId: week.id,
        });

        details.teamWeeks.count += teamWeekResult.count;
        details.teamWeeks.created =
          (details.teamWeeks.created ?? 0) + (teamWeekResult.created ?? 0);
        details.teamWeeks.updated =
          (details.teamWeeks.updated ?? 0) + (teamWeekResult.updated ?? 0);
      }

      // Season-level aggregations
      // 4. PlayerSplits
      currentStepNum++;
      setCurrentStep("Aggregating Player Splits (Season)");
      setProgress({
        step: currentStepNum,
        total: totalSteps,
        detail: `Processing season ${seasonId}`,
      });

      const playerSplitResult = await aggregatePlayerSplits.mutateAsync({
        seasonId,
      });

      details.playerSplits.count = playerSplitResult.count;
      details.playerSplits.created = playerSplitResult.created ?? 0;
      details.playerSplits.updated = playerSplitResult.updated ?? 0;

      // 5. PlayerTotals
      currentStepNum++;
      setCurrentStep("Aggregating Player Totals (Season)");
      setProgress({
        step: currentStepNum,
        total: totalSteps,
        detail: `Processing season ${seasonId}`,
      });

      const playerTotalResult = await aggregatePlayerTotals.mutateAsync({
        seasonId,
      });

      details.playerTotals.count = playerTotalResult.count;
      details.playerTotals.created = playerTotalResult.created ?? 0;
      details.playerTotals.updated = playerTotalResult.updated ?? 0;

      // 6. TeamSeasons
      currentStepNum++;
      setCurrentStep("Aggregating Team Seasons");
      setProgress({
        step: currentStepNum,
        total: totalSteps,
        detail: `Processing season ${seasonId}`,
      });

      const teamSeasonResult = await aggregateTeamSeasons.mutateAsync({
        seasonId,
      });

      details.teamSeasons.count = teamSeasonResult.count;
      details.teamSeasons.created = teamSeasonResult.created ?? 0;
      details.teamSeasons.updated = teamSeasonResult.updated ?? 0;

      // Complete
      const endTime = Date.now();
      const processingTime = ((endTime - startTime) / 1000).toFixed(2);

      setCurrentStep("Complete!");
      setResult({
        success: true,
        message:
          details.playerWeeks.count === 0 &&
          details.teamDays.count === 0 &&
          details.teamWeeks.count === 0
            ? `⚠️ Completed processing season ${seasonId}, but no data was found. This likely means there are no PlayerDayStatLine records for this season's weeks. Please scrape Yahoo data first.`
            : `✅ Successfully updated all stats for season ${seasonId}`,
        details: {
          ...details,
          summary: {
            totalWeeks: fetchedWeeks.length,
            processingTime: `${processingTime}s`,
          },
        },
      });
    } catch (error) {
      setResult({
        success: false,
        message: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        details,
      });
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <SeasonInputSection
        seasonId={seasonId}
        onSeasonIdChange={setSeasonId}
        onProcess={handleUpdateSeason}
        isProcessing={isProcessing}
        weeksCount={weeks?.length}
      />

      {isProcessing && progress && (
        <ProgressIndicator currentStep={currentStep} progress={progress} />
      )}

      {result && <ResultsDisplay result={result} />}

      <InfoSection />
    </div>
  );
}
