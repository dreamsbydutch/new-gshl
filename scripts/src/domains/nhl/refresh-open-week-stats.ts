import { fetchSeasonModel } from "../../integrations/data/convex-store";
import type { DatabaseRecord } from "../../integrations/data/records";
import { refreshDailySeasonAggregates } from "../aggregation/daily-season-aggregation";
import { shiftYahooDate } from "../yahoo/sync-cycle";
import {
  planScoringWeekRefresh,
  type ScoringWeek,
} from "./scoring-week-refresh";
import {
  parseDailyNhlPlayerStatSyncOptions,
  runDailyNhlPlayerStatSync,
} from "./daily-player-stats-sync";

/** Re-fetch prior days across each unfrozen matchup, then rebuild its rollups. */
export async function refreshOpenWeekStats(input: {
  season: DatabaseRecord & { id: string };
  today: string;
  apply: boolean;
  pythonBin: string;
  weekIds?: string[];
}) {
  const [weeks, teams] = await Promise.all([
    fetchSeasonModel<ScoringWeek>("Week", input.season.id),
    fetchSeasonModel<DatabaseRecord>("Team", input.season.id),
  ]);
  const plan = planScoringWeekRefresh(
    weeks.filter((w) => !input.weekIds || input.weekIds.includes(w.id)),
    shiftYahooDate(input.today, -1),
  );
  if (!teams.length)
    throw new Error("Correction refresh requires season teams.");
  const results = [];
  for (const range of plan) {
    const result = await runDailyNhlPlayerStatSync(
      parseDailyNhlPlayerStatSyncOptions([
        "--season-id",
        input.season.id,
        "--start-date",
        range.startDate,
        "--end-date",
        range.endDate,
        "--team-ids",
        teams.map((t) => t.id).join(","),
        "--python-bin",
        input.pythonBin,
        "--ssl-verify",
        "true",
        ...(input.apply ? ["--apply"] : []),
      ]),
    );
    if (result.skippedDates.length)
      throw new Error(
        `Correction refresh is missing imported days: ${result.skippedDates.join(", ")}`,
      );
    results.push(result);
  }
  return {
    plan,
    results,
    aggregates: plan.length
      ? await refreshDailySeasonAggregates(input.season, input.apply)
      : null,
  };
}
