"use client";

/**
 * PlayerWeekAggregator Component
 *
 * Admin interface for aggregating player and team stats at multiple levels.
 * Provides granular control over each aggregation stage with dry run support.
 *
 * Aggregation Stages:
 * 1. Player Weeks: PlayerDay → PlayerWeek (by week)
 * 2. Player Splits: PlayerWeek → PlayerSplit (seasonal, per team)
 * 3. Player Totals: PlayerWeek → PlayerTotal (seasonal, overall)
 * 4. Team Days: PlayerDay → TeamDay (by week)
 *
 * Features:
 * - Individual control for each aggregation type
 * - Dry run mode for previewing changes
 * - Real-time elapsed time tracking
 * - Detailed result summaries
 * - Input/output validation
 *
 * @example
 * ```tsx
 * <PlayerWeekAggregator />
 * ```
 */

import { useState, useEffect } from "react";
import { api } from "src/trpc/react";
import { Button } from "@gshl-ui";

// ============================================================================
// TYPES
// ============================================================================

interface AggregationResult {
  summary: {
    input: {
      totalPlayerDays?: number;
      uniquePlayers?: number;
      uniqueTeams?: number;
      uniqueDates?: number;
      totalPlayerWeeks?: number;
    };
    output: {
      totalPlayerWeeks?: number;
      totalTeamDays?: number;
      averagePlayersPerTeamDay?: string;
      totalPlayerSplits?: number;
      totalPlayerTotals?: number;
    };
  };
  created?: number;
  updated?: number;
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * ConfigSection
 *
 * Input controls for week ID, season ID, and dry run toggle
 */
const ConfigSection = ({
  weekId,
  seasonId,
  dryRun,
  onWeekIdChange,
  onSeasonIdChange,
  onDryRunChange,
  elapsedTime,
  isAggregating,
}: {
  weekId: string;
  seasonId: string;
  dryRun: boolean;
  onWeekIdChange: (value: string) => void;
  onSeasonIdChange: (value: string) => void;
  onDryRunChange: (value: boolean) => void;
  elapsedTime: number;
  isAggregating: boolean;
}) => (
  <div className="grid gap-4 md:grid-cols-3">
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="weekId">
        Week ID
      </label>
      <input
        id="weekId"
        type="text"
        placeholder="e.g., 2024-W12"
        value={weekId}
        onChange={(e) => onWeekIdChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>

    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="seasonId">
        Season ID
      </label>
      <input
        id="seasonId"
        type="text"
        placeholder="e.g., 2025"
        value={seasonId}
        onChange={(e) => onSeasonIdChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>

    <div className="flex flex-col justify-between space-y-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => onDryRunChange(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <span className="text-sm font-medium">Dry Run (Preview Only)</span>
      </label>
      {isAggregating && (
        <div className="text-sm text-muted-foreground">
          Elapsed: {elapsedTime.toFixed(1)}s
        </div>
      )}
    </div>
  </div>
);

/**
 * AggregationButton
 *
 * Reusable button for triggering aggregations with consistent styling
 */
const AggregationButton = ({
  label,
  onClick,
  disabled,
  isPending,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  isPending: boolean;
  variant?: "default" | "secondary" | "outline";
}) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    variant={variant}
    className="w-full"
  >
    {isPending ? "Processing..." : label}
  </Button>
);

/**
 * WeekAggregationSection
 *
 * Controls and results for player week and team day aggregations
 */
const WeekAggregationSection = ({
  weekId,
  dryRun,
  onAggregateWeek,
  onAggregateTeamDays,
  weekResult,
  teamDaysResult,
  isAggregating,
  isWeekPending,
  isTeamDaysPending,
}: {
  weekId: string;
  dryRun: boolean;
  onAggregateWeek: () => void;
  onAggregateTeamDays: () => void;
  weekResult: AggregationResult | null;
  teamDaysResult: AggregationResult | null;
  isAggregating: boolean;
  isWeekPending: boolean;
  isTeamDaysPending: boolean;
}) => (
  <div className="space-y-4 rounded-md border p-4">
    <h3 className="font-semibold">Week-Level Aggregations</h3>
    <p className="text-sm text-muted-foreground">
      Aggregate stats for a specific week. Requires Week ID.
    </p>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <AggregationButton
          label="Aggregate Player Weeks"
          onClick={onAggregateWeek}
          disabled={isAggregating || !weekId}
          isPending={isWeekPending}
        />
        <p className="text-xs text-muted-foreground">
          PlayerDay → PlayerWeek for {weekId || "selected week"}
        </p>
      </div>

      <div className="space-y-2">
        <AggregationButton
          label="Aggregate Team Days"
          onClick={onAggregateTeamDays}
          disabled={isAggregating || !weekId}
          isPending={isTeamDaysPending}
          variant="secondary"
        />
        <p className="text-xs text-muted-foreground">
          PlayerDay → TeamDay for {weekId || "selected week"}
        </p>
      </div>
    </div>

    {weekResult && <WeekResultDisplay data={weekResult} dryRun={dryRun} />}
    {teamDaysResult && (
      <TeamDaysResultDisplay data={teamDaysResult} dryRun={dryRun} />
    )}
  </div>
);

/**
 * SeasonAggregationSection
 *
 * Controls and results for season-level aggregations
 */
const SeasonAggregationSection = ({
  seasonId,
  dryRun,
  onAggregateSplits,
  onAggregateTotals,
  splitsResult,
  totalsResult,
  isAggregating,
  isSplitsPending,
  isTotalsPending,
}: {
  seasonId: string;
  dryRun: boolean;
  onAggregateSplits: () => void;
  onAggregateTotals: () => void;
  splitsResult: AggregationResult | null;
  totalsResult: AggregationResult | null;
  isAggregating: boolean;
  isSplitsPending: boolean;
  isTotalsPending: boolean;
}) => (
  <div className="space-y-4 rounded-md border p-4">
    <h3 className="font-semibold">Season-Level Aggregations</h3>
    <p className="text-sm text-muted-foreground">
      Aggregate stats for an entire season. Requires Season ID.
    </p>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <AggregationButton
          label="Aggregate Player Splits"
          onClick={onAggregateSplits}
          disabled={isAggregating || !seasonId}
          isPending={isSplitsPending}
        />
        <p className="text-xs text-muted-foreground">
          PlayerWeek → PlayerSplit (per team) for season {seasonId || "..."}
        </p>
      </div>

      <div className="space-y-2">
        <AggregationButton
          label="Aggregate Player Totals"
          onClick={onAggregateTotals}
          disabled={isAggregating || !seasonId}
          isPending={isTotalsPending}
        />
        <p className="text-xs text-muted-foreground">
          PlayerWeek → PlayerTotal (overall) for season {seasonId || "..."}
        </p>
      </div>
    </div>

    {splitsResult && (
      <SplitsResultDisplay data={splitsResult} dryRun={dryRun} />
    )}
    {totalsResult && (
      <TotalsResultDisplay data={totalsResult} dryRun={dryRun} />
    )}
  </div>
);

/**
 * WeekResultDisplay
 *
 * Displays results from player week aggregation
 */
const WeekResultDisplay = ({
  data,
  dryRun,
}: {
  data: AggregationResult;
  dryRun: boolean;
}) => (
  <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
    <h4 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">
      {dryRun ? "Player Week Preview:" : "Player Week Results:"}
    </h4>
    <div className="grid gap-2 text-blue-800 dark:text-blue-200 md:grid-cols-2">
      <div>
        <strong>Input:</strong>
        <ul className="ml-4 mt-1">
          <li>Player days: {data.summary.input.totalPlayerDays}</li>
          <li>Unique players: {data.summary.input.uniquePlayers}</li>
        </ul>
      </div>
      <div>
        <strong>Output:</strong>
        <ul className="ml-4 mt-1">
          <li>Player weeks: {data.summary.output.totalPlayerWeeks}</li>
          {!dryRun && (
            <li>
              Created: {data.created ?? 0}, Updated: {data.updated ?? 0}
            </li>
          )}
        </ul>
      </div>
    </div>
  </div>
);

/**
 * TeamDaysResultDisplay
 *
 * Displays results from team day aggregation
 */
const TeamDaysResultDisplay = ({
  data,
  dryRun,
}: {
  data: AggregationResult;
  dryRun: boolean;
}) => (
  <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm dark:border-orange-900 dark:bg-orange-950">
    <h4 className="mb-2 font-semibold text-orange-900 dark:text-orange-100">
      {dryRun ? "Team Day Preview:" : "Team Day Results:"}
    </h4>
    <div className="grid gap-2 text-orange-800 dark:text-orange-200 md:grid-cols-2">
      <div>
        <strong>Input:</strong>
        <ul className="ml-4 mt-1">
          <li>Player days: {data.summary.input.totalPlayerDays}</li>
          <li>Unique teams: {data.summary.input.uniqueTeams}</li>
          <li>Unique dates: {data.summary.input.uniqueDates}</li>
        </ul>
      </div>
      <div>
        <strong>Output:</strong>
        <ul className="ml-4 mt-1">
          <li>Team days: {data.summary.output.totalTeamDays}</li>
          <li>
            Avg players per team-day:{" "}
            {data.summary.output.averagePlayersPerTeamDay}
          </li>
          {!dryRun && (
            <li>
              Created: {data.created ?? 0}, Updated: {data.updated ?? 0}
            </li>
          )}
        </ul>
      </div>
    </div>
  </div>
);

/**
 * SplitsResultDisplay
 *
 * Displays results from split aggregation (e.g., position groups)
 */
const SplitsResultDisplay = ({
  data,
  dryRun,
}: {
  data: AggregationResult;
  dryRun: boolean;
}) => (
  <div className="rounded-md border border-purple-200 bg-purple-50 p-4 text-sm dark:border-purple-900 dark:bg-purple-950">
    <h4 className="mb-2 font-semibold text-purple-900 dark:text-purple-100">
      {dryRun ? "Split Preview:" : "Split Aggregation Results:"}
    </h4>
    <div className="grid gap-2 text-purple-800 dark:text-purple-200 md:grid-cols-2">
      <div>
        <strong>Input:</strong>
        <ul className="ml-4 mt-1">
          <li>Player weeks: {data.summary.input.totalPlayerWeeks}</li>
          <li>Unique players: {data.summary.input.uniquePlayers}</li>
        </ul>
      </div>
      <div>
        <strong>Output:</strong>
        <ul className="ml-4 mt-1">
          <li>Player splits: {data.summary.output.totalPlayerSplits}</li>
          {!dryRun && (
            <li>
              Created: {data.created ?? 0}, Updated: {data.updated ?? 0}
            </li>
          )}
        </ul>
      </div>
    </div>
  </div>
);

/**
 * TotalsResultDisplay
 *
 * Displays results from totals aggregation (summing up stats)
 */
const TotalsResultDisplay = ({
  data,
  dryRun,
}: {
  data: AggregationResult;
  dryRun: boolean;
}) => (
  <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
    <h4 className="mb-2 font-semibold text-green-900 dark:text-green-100">
      {dryRun ? "Total Preview:" : "Total Aggregation Results:"}
    </h4>
    <div className="grid gap-2 text-green-800 dark:text-green-200 md:grid-cols-2">
      <div>
        <strong>Input:</strong>
        <ul className="ml-4 mt-1">
          <li>Player weeks: {data.summary.input.totalPlayerWeeks}</li>
          <li>Unique players: {data.summary.input.uniquePlayers}</li>
        </ul>
      </div>
      <div>
        <strong>Output:</strong>
        <ul className="ml-4 mt-1">
          <li>Player totals: {data.summary.output.totalPlayerTotals}</li>
          {!dryRun && (
            <li>
              Created: {data.created ?? 0}, Updated: {data.updated ?? 0}
            </li>
          )}
        </ul>
      </div>
    </div>
  </div>
);

/**
 * InfoSection
 *
 * Displays usage information and aggregation pipeline details
 */
const InfoSection = () => (
  <div className="rounded-md bg-muted p-4 text-sm">
    <h3 className="mb-2 font-semibold">Aggregation Pipeline:</h3>
    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
      <li>
        <strong>Player Weeks:</strong> Aggregates daily stats into weekly stats
        per player
      </li>
      <li>
        <strong>Player Splits:</strong> Aggregates weekly stats into per-team
        seasonal stats
      </li>
      <li>
        <strong>Player Totals:</strong> Aggregates weekly stats into overall
        seasonal stats
      </li>
      <li>
        <strong>Team Days:</strong> Aggregates player daily stats into team
        daily stats
      </li>
    </ol>
    <p className="mt-3 text-xs text-muted-foreground">
      💡 Use dry run mode to preview changes before writing to the database.
      Check the console for detailed preview data.
    </p>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function PlayerWeekAggregator() {
  const [weekId, setWeekId] = useState("2024-W12");
  const [seasonId, setSeasonId] = useState("2025");
  const [dryRun, setDryRun] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Week aggregation mutation
  const aggregateWeek =
    api.playerStats.weekly.aggregateAndCreateFromDays.useMutation({
      onMutate: () => {
        console.log("⏱️ Week aggregation started...");
        setStartTime(Date.now());
        setElapsedTime(0);
      },
      onSuccess: (data) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.log(`✅ Week aggregation completed in ${duration}s:`, data);
        setStartTime(null);

        if (dryRun && data.preview) {
          alert(
            `Dry Run completed in ${duration}s!\n\n` +
              `Would create ${data.summary.output.totalPlayerWeeks} player week records\n` +
              `From ${data.summary.input.totalPlayerDays} player days\n` +
              `Unique players: ${data.summary.input.uniquePlayers}\n` +
              `Average days per week: ${data.summary.output.averageDaysPerWeek}\n\n` +
              `Check console for preview of first 10 records`,
          );
          console.log("Preview records:", data.preview);
        } else {
          alert(
            `Week Aggregation completed in ${duration}s!\n\n` +
              `Total records: ${data.count}\n` +
              `  - Created: ${data.created ?? 0}\n` +
              `  - Updated: ${data.updated ?? 0}\n\n` +
              `From ${data.summary.input.totalPlayerDays} player days\n` +
              `Unique players: ${data.summary.input.uniquePlayers}\n` +
              `Average days per week: ${data.summary.output.averageDaysPerWeek}`,
          );
        }
      },
      onError: (error) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.error(`❌ Week aggregation failed after ${duration}s:`, error);
        setStartTime(null);
        alert(`Week aggregation failed after ${duration}s: ${error.message}`);
      },
    });

  // Split aggregation mutation
  const aggregateSplits =
    api.playerStats.splits.aggregateAndCreateFromWeeks.useMutation({
      onMutate: () => {
        console.log("⏱️ Split aggregation started...");
        setStartTime(Date.now());
        setElapsedTime(0);
      },
      onSuccess: (data) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.log(`✅ Split aggregation completed in ${duration}s:`, data);
        setStartTime(null);

        if (dryRun && data.preview) {
          alert(
            `Dry Run completed in ${duration}s!\n\n` +
              `Would create ${data.summary.output.totalPlayerSplits} player split records\n` +
              `From ${data.summary.input.totalPlayerWeeks} player weeks\n` +
              `Unique players: ${data.summary.input.uniquePlayers}\n\n` +
              `Check console for preview of first 10 records`,
          );
          console.log("Preview records:", data.preview);
        } else {
          alert(
            `Split Aggregation completed in ${duration}s!\n\n` +
              `Total records: ${data.count}\n` +
              `  - Created: ${data.created ?? 0}\n` +
              `  - Updated: ${data.updated ?? 0}\n\n` +
              `From ${data.summary.input.totalPlayerWeeks} player weeks\n` +
              `Unique players: ${data.summary.input.uniquePlayers}`,
          );
        }
      },
      onError: (error) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.error(`❌ Split aggregation failed after ${duration}s:`, error);
        setStartTime(null);
        alert(`Split aggregation failed after ${duration}s: ${error.message}`);
      },
    });

  // Total aggregation mutation
  const aggregateTotals =
    api.playerStats.totals.aggregateAndCreateFromWeeks.useMutation({
      onMutate: () => {
        console.log("⏱️ Total aggregation started...");
        setStartTime(Date.now());
        setElapsedTime(0);
      },
      onSuccess: (data) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.log(`✅ Total aggregation completed in ${duration}s:`, data);
        setStartTime(null);

        if (dryRun && data.preview) {
          alert(
            `Dry Run completed in ${duration}s!\n\n` +
              `Would create ${data.summary.output.totalPlayerTotals} player total records\n` +
              `From ${data.summary.input.totalPlayerWeeks} player weeks\n` +
              `Unique players: ${data.summary.input.uniquePlayers}\n\n` +
              `Check console for preview of first 10 records`,
          );
          console.log("Preview records:", data.preview);
        } else {
          alert(
            `Total Aggregation completed in ${duration}s!\n\n` +
              `Total records: ${data.count}\n` +
              `  - Created: ${data.created ?? 0}\n` +
              `  - Updated: ${data.updated ?? 0}\n\n` +
              `From ${data.summary.input.totalPlayerWeeks} player weeks\n` +
              `Unique players: ${data.summary.input.uniquePlayers}`,
          );
        }
      },
      onError: (error) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.error(`❌ Total aggregation failed after ${duration}s:`, error);
        setStartTime(null);
        alert(`Total aggregation failed after ${duration}s: ${error.message}`);
      },
    });

  // Team day aggregation mutation
  const aggregateTeamDays =
    api.teamStats.daily.aggregateAndCreateFromPlayerDays.useMutation({
      onMutate: () => {
        console.log("⏱️ Team day aggregation started...");
        setStartTime(Date.now());
        setElapsedTime(0);
      },
      onSuccess: (data) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.log(`✅ Team day aggregation completed in ${duration}s:`, data);
        setStartTime(null);

        if (dryRun && data.preview) {
          alert(
            `Dry Run completed in ${duration}s!\n\n` +
              `Would create ${data.summary.output.totalTeamDays} team day records\n` +
              `From ${data.summary.input.totalPlayerDays} player days\n` +
              `Unique teams: ${data.summary.input.uniqueTeams}\n` +
              `Unique dates: ${data.summary.input.uniqueDates}\n\n` +
              `Check console for preview of first 10 records`,
          );
          console.log("Preview records:", data.preview);
        } else {
          alert(
            `Team Day Aggregation completed in ${duration}s!\n\n` +
              `Total records: ${data.count}\n` +
              `  - Created: ${data.created ?? 0}\n` +
              `  - Updated: ${data.updated ?? 0}\n\n` +
              `From ${data.summary.input.totalPlayerDays} player days\n` +
              `Unique teams: ${data.summary.input.uniqueTeams}\n` +
              `Avg players per team-day: ${data.summary.output.averagePlayersPerTeamDay}`,
          );
        }
      },
      onError: (error) => {
        const duration = startTime
          ? ((Date.now() - startTime) / 1000).toFixed(1)
          : "?";
        console.error(
          `❌ Team day aggregation failed after ${duration}s:`,
          error,
        );
        setStartTime(null);
        alert(
          `Team day aggregation failed after ${duration}s: ${error.message}`,
        );
      },
    });

  // Timer to track elapsed time while aggregating
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedTime((Date.now() - startTime) / 1000);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime]);

  const handleAggregateWeek = () => {
    if (!weekId) {
      alert("Please enter a week ID");
      return;
    }

    console.log(
      `🚀 Starting week aggregation for week: ${weekId}, dryRun: ${dryRun}`,
    );
    aggregateWeek.mutate({
      weekId,
      dryRun,
    });
  };

  const handleAggregateSplits = () => {
    if (!seasonId) {
      alert("Please enter a season ID");
      return;
    }

    console.log(
      `🚀 Starting split aggregation for season: ${seasonId}, dryRun: ${dryRun}`,
    );
    aggregateSplits.mutate({
      seasonId,
      dryRun,
    });
  };

  const handleAggregateTotals = () => {
    if (!seasonId) {
      alert("Please enter a season ID");
      return;
    }

    console.log(
      `🚀 Starting total aggregation for season: ${seasonId}, dryRun: ${dryRun}`,
    );
    aggregateTotals.mutate({
      seasonId,
      dryRun,
    });
  };

  const handleAggregateTeamDays = () => {
    if (!weekId) {
      alert("Please enter a week ID");
      return;
    }

    console.log(
      `🚀 Starting team day aggregation for week: ${weekId}, dryRun: ${dryRun}`,
    );
    aggregateTeamDays.mutate({
      weekId,
      dryRun,
    });
  };

  const isAggregating =
    aggregateWeek.isPending ||
    aggregateSplits.isPending ||
    aggregateTotals.isPending ||
    aggregateTeamDays.isPending;

  return (
    <div className="space-y-6">
      <ConfigSection
        weekId={weekId}
        seasonId={seasonId}
        dryRun={dryRun}
        onWeekIdChange={setWeekId}
        onSeasonIdChange={setSeasonId}
        onDryRunChange={setDryRun}
        elapsedTime={elapsedTime}
        isAggregating={isAggregating}
      />

      <WeekAggregationSection
        weekId={weekId}
        dryRun={dryRun}
        onAggregateWeek={handleAggregateWeek}
        onAggregateTeamDays={handleAggregateTeamDays}
        weekResult={aggregateWeek.isSuccess ? aggregateWeek.data : null}
        teamDaysResult={
          aggregateTeamDays.isSuccess ? aggregateTeamDays.data : null
        }
        isAggregating={isAggregating}
        isWeekPending={aggregateWeek.isPending}
        isTeamDaysPending={aggregateTeamDays.isPending}
      />

      <SeasonAggregationSection
        seasonId={seasonId}
        dryRun={dryRun}
        onAggregateSplits={handleAggregateSplits}
        onAggregateTotals={handleAggregateTotals}
        splitsResult={aggregateSplits.isSuccess ? aggregateSplits.data : null}
        totalsResult={aggregateTotals.isSuccess ? aggregateTotals.data : null}
        isAggregating={isAggregating}
        isSplitsPending={aggregateSplits.isPending}
        isTotalsPending={aggregateTotals.isPending}
      />

      <InfoSection />
    </div>
  );
}
