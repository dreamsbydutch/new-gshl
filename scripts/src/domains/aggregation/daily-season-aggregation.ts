import { fetchSeasonModel } from "../../integrations/data/convex-store";
import type { DatabaseRecord } from "../../integrations/data/records";
import {
  buildSeasonStatLines,
  replaceModelRowsForSeason,
} from "./season-stat-aggregation";
import type { RosterMetadata } from "../yahoo/daily-roster";
import { normalizeDateOnlyValue } from "../../utils/date";

/** Refresh the six season rollups without career/power rebuilds or row deletion. */
export async function refreshDailySeasonAggregates(
  season: DatabaseRecord & { id: string },
  apply: boolean,
  previewRoster?: { date: string; days: RosterMetadata[] },
) {
  if (apply && previewRoster)
    throw new Error(
      "Applied aggregates must use persisted NHL player-day stats.",
    );
  const [storedDays, weeks, teams] = await Promise.all([
    fetchSeasonModel<DatabaseRecord>("PlayerDayStatLine", season.id),
    fetchSeasonModel<DatabaseRecord>("Week", season.id),
    fetchSeasonModel<DatabaseRecord>("Team", season.id),
  ]);
  const days = previewRoster
    ? [
        ...storedDays.filter(
          (d) => normalizeDateOnlyValue(d.date) !== previewRoster.date,
        ),
        ...previewRoster.days.map((d) => ({
          ...storedDays.find(
            (stored) =>
              stored.playerId === d.playerId &&
              normalizeDateOnlyValue(stored.date) === previewRoster.date,
          ),
          ...d,
        })),
      ]
    : storedDays;
  if (!weeks.length || !teams.length || !days.length)
    throw new Error(
      "Season aggregation requires weeks, teams and imported player days.",
    );
  const teamIds = new Set(teams.map((t) => t.id));
  const weekIds = new Set(weeks.map((w) => w.id));
  if (days.some((d) => !teamIds.has(d.gshlTeamId) || !weekIds.has(d.weekId)))
    throw new Error("Season player days contain unknown teams or weeks.");
  const generated = buildSeasonStatLines(season.id, days, season, weeks, teams);
  const inputs = [
    ["PlayerWeekStatLine", generated.playerWeeks],
    ["PlayerSplitStatLine", generated.playerSplits],
    ["PlayerTotalStatLine", generated.playerTotals],
    ["TeamDayStatLine", generated.teamDays],
    ["TeamWeekStatLine", generated.teamWeeks],
    ["TeamSeasonStatLine", generated.teamSeasons],
  ] as const;
  const summaries = [];
  for (const [modelName, rows] of inputs) {
    // These placeholders belong to the separate rating/award/power workflows.
    // Omitting them preserves existing values when this stats-only run upserts.
    const stats = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(
          ([field]) => !/Rating$|Rk$|^power/.test(field),
        ),
      ),
    );
    summaries.push(
      apply
        ? await replaceModelRowsForSeason(modelName, season.id, stats, false)
        : { modelName, seasonRows: stats.length, applied: false },
    );
  }
  return {
    seasonId: season.id,
    playerDays: days.length,
    apply,
    writes: summaries,
  };
}
