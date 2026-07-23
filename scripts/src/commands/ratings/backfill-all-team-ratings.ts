/**
 * Usage:
 *   npm run ratings:rebuild-team
 *   npm run ratings:rebuild-team -- --season-ids 11,12 --apply
 *   npm run ratings:rebuild-team -- --season-ids 11,12 --include-team-seasons
 *
 * What it does:
 *   Calls the Apps Script team-rating updater across one or more seasons and
 *   prints a combined summary. Team-week rebuilds also refresh power/team-week
 *   rankings and matchup ranks/ratings. Runs as a dry-run unless --apply is passed.
 *
 * Options:
 *   --season-ids <list>     Optional comma-separated season ids. Default: all Season rows.
 *   --apply                 Write updated team ratings back to Convex. Omit for dry-run.
 *   --log <true|false>      Enable or disable console logging. Default: true.
 *   --include-team-weeks    Accepted for compatibility; TeamWeekStatLine ratings are included by default.
 *   --include-team-seasons  Accepted for compatibility; TeamSeasonStatLine ratings are included by default.
 *   --stop-on-error         Abort immediately on the first failed season.
 *   --help                  Show this message and exit.
 */
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { type CompositeKeyModelName } from "@gshl-lib/sheets/config/config";
import {
  fetchModel,
  fetchSeasonModel,
  fetchWeekScopedModel,
  updateRowsById,
} from "@gshl-lib/data/convex-store";
import {
  rankRowsWithAppsScriptEngine,
  type RankingEngineSheetName,
} from "@gshl-lib/ranking/apps-script-engine";
import { getAllSeasonIds } from "@gshl-lib/ranking/player-rating-backfill";
import { runLocalPowerRankingsSeason } from "../../domains/power/apps-script-power-engine";
import {
  getArgValue,
  hasFlag,
  toBoolean,
} from "@gshl-lib/ranking/player-rating-support";

type TeamRatingRebuildOptions = {
  seasonIds: string[];
  apply: boolean;
  logToConsole: boolean;
  includeTeamDays: boolean;
  includeTeamWeeks: boolean;
  includeTeamSeasons: boolean;
  stopOnError: boolean;
  weekIds: string[];
  weekNums: string[];
  teamIds: string[];
};

type TeamRatingModelName = Extract<
  CompositeKeyModelName,
  "TeamDayStatLine" | "TeamWeekStatLine" | "TeamSeasonStatLine"
>;

type TeamRatingSheetSummary = {
  modelName: TeamRatingModelName;
  spreadsheetId: string;
  sheetName: string;
  outputField: string;
  matchedRows: number;
  updatedRows: number;
  dryRun: boolean;
};

type TeamRatingSeasonSummary = {
  seasonId: string;
  models: TeamRatingSheetSummary[];
  powerRefresh: {
    weekRows: number;
    seasonRows: number;
    matchupRows: number;
    dryRun: boolean;
  } | null;
  matchedRows: number;
  updatedRows: number;
};

type TeamRatingRebuildSummary = {
  apply: boolean;
  seasonIds: string[];
  processedSeasons: number;
  matchedRows: number;
  updatedRows: number;
  failures: Array<{ seasonId: string; message: string }>;
  seasons: TeamRatingSeasonSummary[];
};

const TEAM_RATING_MODELS: readonly TeamRatingModelName[] = [
  "TeamDayStatLine",
  "TeamWeekStatLine",
  "TeamSeasonStatLine",
];

function normalizeNullableNumbers(
  row: DatabaseRecord,
  fields: readonly string[],
): DatabaseRecord {
  const normalized = { ...row };
  for (const field of fields) {
    if (normalized[field] === "" || normalized[field] === undefined) {
      normalized[field] = null;
    }
  }
  return normalized;
}

const TEAM_WEEK_POWER_NUMBER_FIELDS = [
  "powerRating",
  "powerElo",
  "powerEloPre",
  "powerEloPost",
  "powerEloDelta",
  "powerEloExpected",
  "powerEloK",
  "powerStatScore",
  "powerStatEwma",
  "powerTalent",
  "powerHistoryPrior",
  "powerComposite",
  "powerRk",
] as const;

const MATCHUP_POWER_NUMBER_FIELDS = [
  "homeRank",
  "awayRank",
  "ratingPre",
  "ratingRealized",
  "ratingCompetitive",
  "ratingImportance",
  "ratingRosterStrength",
  "rating",
] as const;

const HELP_TEXT = `
Usage:
  npm run ratings:rebuild-team
  npm run ratings:rebuild-team -- --season-ids 11,12 --apply
  npm run ratings:rebuild-team -- --season-ids 11,12 --include-team-seasons

Options:
  --season-id <id>       Optional single season id.
  --season-ids <list>     Optional comma-separated season ids. Default: all Season rows.
  --week-ids <list>      Optional week ids for TeamDay/TeamWeek ratings.
  --week-nums <list>      Optional week numbers for TeamDay/TeamWeek ratings.
  --team-ids <list>       Optional team ids to update after week-wide rating calculation.
  --apply                 Write updated team ratings back to Convex. Omit for dry-run.
  --log <true|false>      Enable or disable console logging. Default: true.
  --include-team-weeks    Accepted for compatibility; TeamWeekStatLine ratings are included by default.
  --include-team-seasons  Accepted for compatibility; TeamSeasonStatLine ratings are included by default.
  --stop-on-error         Abort immediately on the first failed season.
  --help                  Show this message and exit.

Requirements:
  CONVEX_PROD_URL and CONVEX_SERVER_SECRET must target production.
  Unscoped team-week rebuilds trigger a power refresh; week/team-scoped runs do not.
`.trim();

function parseSeasonIds(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function log(
  options: Pick<TeamRatingRebuildOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[ratings:rebuild-team] ${message}`);
  }
}

function warn(message: string): void {
  console.warn(`[ratings:rebuild-team] ${message}`);
}

async function parseOptions(args: string[]): Promise<TeamRatingRebuildOptions> {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const requestedSeasonIds = parseSeasonIds(
    getArgValue(args, "--season-ids") ?? getArgValue(args, "--season-id"),
  );
  const seasonIds = requestedSeasonIds.length
    ? requestedSeasonIds
    : await getAllSeasonIds();
  if (!seasonIds.length) {
    throw new Error("[ratings:rebuild-team] No season ids found.");
  }

  return {
    seasonIds,
    apply: hasFlag(args, "--apply"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    includeTeamDays: true,
    includeTeamWeeks: true,
    includeTeamSeasons: true,
    stopOnError: hasFlag(args, "--stop-on-error"),
    weekIds: parseSeasonIds(
      getArgValue(args, "--week-ids") ?? getArgValue(args, "--week-id"),
    ),
    weekNums: parseSeasonIds(
      getArgValue(args, "--week-nums") ?? getArgValue(args, "--week-num"),
    ),
    teamIds: parseSeasonIds(
      getArgValue(args, "--team-ids") ?? getArgValue(args, "--team-id"),
    ),
  };
}

function recordMatchesId(record: DatabaseRecord, requestedId: string): boolean {
  return [record.id, record.legacyId].some(
    (value) => String(value ?? "").trim() === requestedId,
  );
}

function resolveIds(
  records: DatabaseRecord[],
  requestedIds: string[],
  label: string,
): string[] {
  return Array.from(
    new Set(
      requestedIds.map((requestedId) => {
        const match = records.find((row) => recordMatchesId(row, requestedId));
        const id = String(match?.id ?? "").trim();
        if (!id) {
          throw new Error(
            `[ratings:rebuild-team] ${label} ${requestedId} was not found in production Convex.`,
          );
        }
        return id;
      }),
    ),
  );
}

function getSelectedModels(
  options: TeamRatingRebuildOptions,
): TeamRatingModelName[] {
  return TEAM_RATING_MODELS.filter((modelName) => {
    if (options.weekIds.length > 0 && modelName === "TeamSeasonStatLine") {
      return false;
    }
    if (modelName === "TeamDayStatLine") return options.includeTeamDays;
    if (modelName === "TeamWeekStatLine") return options.includeTeamWeeks;
    return options.includeTeamSeasons;
  });
}

async function executeTeamRatingModel(
  options: TeamRatingRebuildOptions,
  seasonId: string,
  modelName: TeamRatingModelName,
): Promise<TeamRatingSheetSummary> {
  if (
    options.weekIds.length > 0 &&
    (modelName === "TeamDayStatLine" || modelName === "TeamWeekStatLine")
  ) {
    const [rows, seasonRows] = await Promise.all([
      fetchWeekScopedModel<DatabaseRecord>(
        modelName,
        seasonId,
        options.weekIds,
      ),
      fetchModel<DatabaseRecord>("Season"),
    ]);
    await rankRowsWithAppsScriptEngine(rows, {
      sheetName: modelName,
      outputField: "Rating",
      mutate: true,
      dataContext: { seasonRows },
    });
    const teamIdSet = new Set(options.teamIds);
    const targetRows = rows.filter(
      (row) =>
        teamIdSet.size === 0 ||
        teamIdSet.has(String(row.gshlTeamId ?? "").trim()),
    );
    let updatedRows = 0;
    if (options.apply) {
      const patches = targetRows.map((row) => {
        const id = String(row.id ?? "").trim();
        if (!id) {
          throw new Error("[ratings:rebuild-team] Missing Convex row id.");
        }
        const rating = row.Rating ?? 0;
        return {
          id,
          data: {
            Rating: rating === "" || rating === null ? 0 : rating,
            updatedAt: new Date(),
          },
        };
      });
      updatedRows = await updateRowsById(modelName, patches);
    }
    return {
      modelName,
      spreadsheetId: "production-convex",
      sheetName: modelName,
      outputField: "Rating",
      matchedRows: targetRows.length,
      updatedRows,
      dryRun: !options.apply,
    };
  }
  const spreadsheetId = "production-convex";
  const sheetName = modelName;
  const outputField = "Rating";
  const [rows, seasonRows] = await Promise.all([
    fetchSeasonModel<DatabaseRecord>(modelName, seasonId),
    fetchModel<DatabaseRecord>("Season"),
  ]);

  await rankRowsWithAppsScriptEngine(rows, {
    sheetName: modelName satisfies RankingEngineSheetName,
    outputField,
    mutate: true,
    dataContext: { seasonRows },
  });

  for (const row of rows) {
    row[outputField] =
      row[outputField] === "" ||
      row[outputField] === null ||
      row[outputField] === undefined
        ? 0
        : row[outputField];
  }

  if (options.apply && rows.length > 0) {
    const patches = rows.map((row) => {
      const id = String(row.id ?? "").trim();
      if (!id)
        throw new Error(`[ratings:rebuild-team] Missing ${modelName} id.`);
      return {
        id,
        data: { Rating: row.Rating ?? 0, updatedAt: new Date() },
      };
    });
    await updateRowsById(modelName, patches);
  }

  return {
    modelName,
    spreadsheetId,
    sheetName,
    outputField,
    matchedRows: rows.length,
    updatedRows: options.apply ? rows.length : 0,
    dryRun: !options.apply,
  };
}

async function executeSeason(
  options: TeamRatingRebuildOptions,
  seasonId: string,
): Promise<TeamRatingSeasonSummary> {
  const models = getSelectedModels(options);
  const summaries: TeamRatingSheetSummary[] = [];

  for (const modelName of models) {
    const summary = await executeTeamRatingModel(options, seasonId, modelName);
    summaries.push(summary);
    log(
      options,
      `Season ${seasonId} ${summary.modelName}: matched=${summary.matchedRows} updated=${summary.updatedRows} sheet=${summary.sheetName} workbook=${summary.spreadsheetId}.`,
    );
  }

  let powerRefresh: TeamRatingSeasonSummary["powerRefresh"] = null;
  if (options.includeTeamWeeks && options.weekIds.length === 0) {
    const powerResult = await runLocalPowerRankingsSeason(seasonId, {
      dryRun: true,
      returnRows: true,
      logToConsole: options.logToConsole,
    });

    if (options.apply) {
      const weekUpdates = powerResult.weekUpdates ?? [];
      const seasonUpdates = powerResult.seasonUpdates ?? [];
      const matchupUpdates = powerResult.matchupUpdates ?? [];
      const [existingWeeks, existingSeasons, existingMatchups] =
        await Promise.all([
          fetchSeasonModel<DatabaseRecord>("TeamWeekStatLine", seasonId),
          fetchSeasonModel<DatabaseRecord>("TeamSeasonStatLine", seasonId),
          fetchSeasonModel<DatabaseRecord>("Matchup", seasonId),
        ]);
      const weekIdByKey = new Map(
        existingWeeks.map((row) => [
          `${String(row.seasonId)}|${String(row.weekId)}|${String(row.gshlTeamId)}`,
          String(row.id ?? ""),
        ]),
      );
      const seasonIdByKey = new Map(
        existingSeasons.map((row) => [
          `${String(row.seasonId)}|${String(row.seasonType)}|${String(row.gshlTeamId)}`,
          String(row.id ?? ""),
        ]),
      );
      const matchupIdSet = new Set(
        existingMatchups.map((row) => String(row.id ?? "")),
      );

      const weekPatches = weekUpdates.map((row) => {
        const id = weekIdByKey.get(
          `${String(row.seasonId)}|${String(row.weekId)}|${String(row.gshlTeamId)}`,
        );
        if (!id)
          throw new Error("[ratings:rebuild-team] Missing power TeamWeek row.");
        return {
          id,
          data: {
            ...normalizeNullableNumbers(row, TEAM_WEEK_POWER_NUMBER_FIELDS),
            updatedAt: new Date(),
          },
        };
      });
      const seasonPatches = seasonUpdates.map((row) => {
        const id = seasonIdByKey.get(
          `${String(row.seasonId)}|${String(row.seasonType)}|${String(row.gshlTeamId)}`,
        );
        if (!id)
          throw new Error(
            "[ratings:rebuild-team] Missing power TeamSeason row.",
          );
        return {
          id,
          data: {
            ...normalizeNullableNumbers(row, ["powerRk"]),
            updatedAt: new Date(),
          },
        };
      });
      const matchupPatches = matchupUpdates.map((row) => {
        const id = String(row.id ?? "").trim();
        if (!id || !matchupIdSet.has(id)) {
          throw new Error("[ratings:rebuild-team] Missing power Matchup row.");
        }
        const { id: _id, ...data } = normalizeNullableNumbers(
          row,
          MATCHUP_POWER_NUMBER_FIELDS,
        );
        return { id, data: { ...data, updatedAt: new Date() } };
      });
      await updateRowsById("TeamWeekStatLine", weekPatches);
      await updateRowsById("TeamSeasonStatLine", seasonPatches);
      await updateRowsById("Matchup", matchupPatches);
    }

    powerRefresh = {
      weekRows: powerResult.updatedWeekRows,
      seasonRows: powerResult.updatedSeasonRows,
      matchupRows: powerResult.updatedMatchupRows,
      dryRun: !options.apply,
    };
    log(
      options,
      `Season ${seasonId} power refresh: teamWeeks=${powerResult.updatedWeekRows} teamSeasons=${powerResult.updatedSeasonRows} matchups=${powerResult.updatedMatchupRows}.`,
    );
  }

  return {
    seasonId,
    powerRefresh,
    matchedRows: summaries.reduce(
      (sum, summary) => sum + summary.matchedRows,
      0,
    ),
    updatedRows: summaries.reduce(
      (sum, summary) => sum + summary.updatedRows,
      0,
    ),
    models: summaries,
  };
}

async function main(): Promise<void> {
  const parsedOptions = await parseOptions(process.argv.slice(2));
  const [seasonRows, weekRows, teamRows] = await Promise.all([
    fetchModel<DatabaseRecord>("Season"),
    fetchModel<DatabaseRecord>("Week"),
    fetchModel<DatabaseRecord>("Team"),
  ]);
  const seasonIds = resolveIds(seasonRows, parsedOptions.seasonIds, "Season");
  const hasWeekTeamScope =
    parsedOptions.weekIds.length > 0 ||
    parsedOptions.weekNums.length > 0 ||
    parsedOptions.teamIds.length > 0;
  if (hasWeekTeamScope && seasonIds.length !== 1) {
    throw new Error(
      "[ratings:rebuild-team] Week/team scope requires exactly one season id.",
    );
  }
  const seasonId = seasonIds[0] ?? "";
  const weekIds = resolveIds(weekRows, parsedOptions.weekIds, "Week");
  for (const weekNum of parsedOptions.weekNums) {
    const week = weekRows.find(
      (row) =>
        String(row.seasonId ?? "").trim() === seasonId &&
        String(row.weekNum ?? "").trim() === weekNum,
    );
    if (!week) {
      throw new Error(
        `[ratings:rebuild-team] Week number ${weekNum} was not found in the selected season.`,
      );
    }
    weekIds.push(String(week.id ?? "").trim());
  }
  const teamIds = resolveIds(teamRows, parsedOptions.teamIds, "Team");
  if (
    weekIds.some((weekId) =>
      weekRows.some(
        (row) =>
          String(row.id ?? "").trim() === weekId &&
          String(row.seasonId ?? "").trim() !== seasonId,
      ),
    ) ||
    teamIds.some((teamId) =>
      teamRows.some(
        (row) =>
          String(row.id ?? "").trim() === teamId &&
          String(row.seasonId ?? "").trim() !== seasonId,
      ),
    )
  ) {
    throw new Error(
      "[ratings:rebuild-team] Selected weeks and teams must belong to the selected season.",
    );
  }
  if (teamIds.length > 0 && weekIds.length === 0) {
    throw new Error(
      "[ratings:rebuild-team] --team-id/--team-ids requires a week id or week number.",
    );
  }
  const options: TeamRatingRebuildOptions = {
    ...parsedOptions,
    seasonIds,
    weekIds: Array.from(new Set(weekIds)),
    teamIds,
  };
  const selectedModels = getSelectedModels(options);
  if (!options.apply) {
    warn(
      "Dry-run mode: ratings are recomputed in memory only. Pass --apply to write changes to Convex.",
    );
  }
  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} across ${options.seasonIds.length} season(s) for ${selectedModels.join(", ")}.`,
  );

  const seasons: TeamRatingSeasonSummary[] = [];
  const failures: Array<{ seasonId: string; message: string }> = [];

  for (const seasonId of options.seasonIds) {
    try {
      log(options, `Processing season ${seasonId}.`);
      const season = await executeSeason(options, seasonId);
      seasons.push(season);
      log(
        options,
        `Season ${seasonId}: matched=${season.matchedRows} updated=${season.updatedRows}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      failures.push({ seasonId, message });
      console.error(
        `[ratings:rebuild-team] Season ${seasonId} failed\n${message}`,
      );
      if (options.stopOnError) {
        break;
      }
    }
  }

  const summary: TeamRatingRebuildSummary = {
    apply: options.apply,
    seasonIds: options.seasonIds,
    processedSeasons: seasons.length,
    matchedRows: seasons.reduce((sum, season) => sum + season.matchedRows, 0),
    updatedRows: seasons.reduce((sum, season) => sum + season.updatedRows, 0),
    failures,
    seasons,
  };

  console.log(
    JSON.stringify(
      {
        apply: summary.apply,
        seasonIds: summary.seasonIds,
        processedSeasons: summary.processedSeasons,
        matchedRows: summary.matchedRows,
        updatedRows: summary.updatedRows,
        failures: summary.failures,
        seasons: summary.seasons,
      },
      null,
      2,
    ),
  );

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
