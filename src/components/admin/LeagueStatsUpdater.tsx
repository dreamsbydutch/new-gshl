"use client";

/**
 * LeagueStatsUpdater Component
 *
 * Admin interface for aggregating and updating league stats for a single week.
 * Runs the full pipeline: PlayerDays → TeamDays → TeamWeeks → Matchup Scores.
 *
 * Features:
 * - Week-based aggregation
 * - Step-by-step progress tracking
 * - Detailed results for each aggregation stage
 * - Matchup score calculation and error reporting
 * - Automatic validation of input data
 */

import { useState } from "react";
import { clientApi as api } from "@gshl-trpc";
import { Button } from "@gshl-ui";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UpdateResult {
  success: boolean;
  message: string;
  details?: {
    teamDays?: {
      count: number;
      created?: number;
      updated?: number;
    };
    teamWeeks?: {
      count: number;
      created?: number;
      updated?: number;
    };
    matchups?: {
      updated: number;
      errors: Array<{ id: string; error: string }>;
    };
  };
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const ProcessingIndicator = ({ currentStep }: { currentStep: string }) => (
  <div className="rounded-md border border-blue-500 bg-blue-50 p-4 dark:bg-blue-950">
    <p className="text-blue-900 dark:text-blue-100">{currentStep}</p>
  </div>
);

const ResultsDisplay = ({ result }: { result: UpdateResult }) => (
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
      <div className="mt-3 space-y-2 text-sm">
        {result.details.teamDays && (
          <div className="text-green-800 dark:text-green-200">
            <strong>Team Days:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>Total: {result.details.teamDays.count}</li>
              {result.details.teamDays.created !== undefined && (
                <li>Created: {result.details.teamDays.created}</li>
              )}
              {result.details.teamDays.updated !== undefined && (
                <li>Updated: {result.details.teamDays.updated}</li>
              )}
            </ul>
          </div>
        )}

        {result.details.teamWeeks && (
          <div className="text-green-800 dark:text-green-200">
            <strong>Team Weeks:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>Total: {result.details.teamWeeks.count}</li>
              {result.details.teamWeeks.created !== undefined && (
                <li>Created: {result.details.teamWeeks.created}</li>
              )}
              {result.details.teamWeeks.updated !== undefined && (
                <li>Updated: {result.details.teamWeeks.updated}</li>
              )}
            </ul>
          </div>
        )}

        {result.details.matchups && (
          <div className="text-green-800 dark:text-green-200">
            <strong>Matchups:</strong>
            <ul className="ml-4 mt-1 list-disc">
              <li>Updated: {result.details.matchups.updated}</li>
              {result.details.matchups.errors.length > 0 && (
                <li className="text-yellow-700 dark:text-yellow-300">
                  Errors: {result.details.matchups.errors.length}
                </li>
              )}
            </ul>
          </div>
        )}

        {result.details.matchups?.errors &&
          result.details.matchups.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-yellow-700 dark:text-yellow-300">
                View Errors ({result.details.matchups.errors.length})
              </summary>
              <ul className="ml-4 mt-2 space-y-1 text-xs">
                {result.details.matchups.errors.map((err, idx) => (
                  <li key={idx}>
                    Matchup {err.id}: {err.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
      </div>
    )}
  </div>
);

const InfoSection = () => (
  <div className="rounded-md bg-muted p-4 text-sm">
    <h3 className="mb-2 font-semibold">What this does:</h3>
    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
      <li>Aggregates PlayerDayStatLine → TeamDayStatLine (daily team stats)</li>
      <li>Aggregates TeamDayStatLine → TeamWeekStatLine (weekly team stats)</li>
      <li>
        Automatically calculates and updates matchup scores for all matchups in
        that week
      </li>
      <li>
        Scores based on 10 head-to-head categories: G, A, P, PPP, SOG, HIT, BLK,
        W, GAA, SVP
      </li>
    </ol>
    <p className="mt-2 text-xs text-muted-foreground">
      Note: Make sure to scrape Yahoo data for the week first using the scraper
      above.
    </p>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function LeagueStatsUpdater() {
  const [weekId, setWeekId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [result, setResult] = useState<UpdateResult | null>(null);

  const aggregateTeamDays =
    api.teamStats.daily.aggregateAndCreateFromPlayerDays.useMutation();
  const aggregateTeamWeeks =
    api.teamStats.weekly.aggregateAndCreateFromDays.useMutation();

  const handleUpdateLeague = async () => {
    if (!weekId) {
      setResult({
        success: false,
        message: "Please enter a week ID",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      // Step 1: Aggregate PlayerDays → TeamDays
      setCurrentStep("Aggregating player days into team days...");
      const teamDaysResponse = await aggregateTeamDays.mutateAsync({
        weekId,
        dryRun: false,
      });

      if (teamDaysResponse.count === 0) {
        setResult({
          success: false,
          message: `❌ No player day data found for week ${weekId}. Make sure to scrape Yahoo data first.`,
        });
        setIsProcessing(false);
        return;
      }

      // Step 2: Aggregate TeamDays → TeamWeeks
      setCurrentStep("Aggregating team days into team weeks...");
      const teamWeeksResponse = await aggregateTeamWeeks.mutateAsync({
        weekId,
        dryRun: false,
      });

      // Step 3: Matchups are automatically updated in the teamWeeks mutation
      setCurrentStep("Done!");
      setResult({
        success: true,
        message: `✅ Successfully updated league stats for week ${weekId}`,
        details: {
          teamDays: {
            count: teamDaysResponse.count,
            created: teamDaysResponse.created,
            updated: teamDaysResponse.updated,
          },
          teamWeeks: {
            count: teamWeeksResponse.count,
            created: teamWeeksResponse.created,
            updated: teamWeeksResponse.updated,
          },
          matchups: teamWeeksResponse.matchups,
        },
      });
    } catch (error) {
      setResult({
        success: false,
        message: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsProcessing(false);
      setCurrentStep("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Week ID (e.g., 261)"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Button
          onClick={handleUpdateLeague}
          disabled={isProcessing || !weekId}
          className="min-w-[120px]"
        >
          {isProcessing ? "Processing..." : "Update League"}
        </Button>
      </div>

      {isProcessing && currentStep && (
        <ProcessingIndicator currentStep={currentStep} />
      )}

      {result && <ResultsDisplay result={result} />}

      <InfoSection />
    </div>
  );
}
