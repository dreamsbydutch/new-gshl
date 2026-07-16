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
import path from "node:path";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import {
  getCompositeKeyColumnsForModel,
  getWriteSpreadsheetIdForModel,
  SHEETS_CONFIG,
  type CompositeKeyModelName,
} from "@gshl-lib/sheets/config/config";
import { fastSheetsReader } from "@gshl-lib/sheets/reader/fast-reader";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
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

const HELP_TEXT = `
Usage:
  npm run ratings:rebuild-team
  npm run ratings:rebuild-team -- --season-ids 11,12 --apply
  npm run ratings:rebuild-team -- --season-ids 11,12 --include-team-seasons

Options:
  --season-ids <list>     Optional comma-separated season ids. Default: all Season rows.
  --apply                 Write updated team ratings back to Convex. Omit for dry-run.
  --log <true|false>      Enable or disable console logging. Default: true.
  --include-team-weeks    Accepted for compatibility; TeamWeekStatLine ratings are included by default.
  --include-team-seasons  Accepted for compatibility; TeamSeasonStatLine ratings are included by default.
  --stop-on-error         Abort immediately on the first failed season.
  --help                  Show this message and exit.

Requirements:
  NEXT_PUBLIC_CONVEX_URL (or CONVEX_URL) must be configured for data reads/writes.
  Team-week rebuilds automatically trigger a power refresh for the same season.
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

  const requestedSeasonIds = parseSeasonIds(getArgValue(args, "--season-ids"));
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
  };
}

function getSelectedModels(
  options: TeamRatingRebuildOptions,
): TeamRatingModelName[] {
  return TEAM_RATING_MODELS.filter((modelName) => {
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
  const spreadsheetId = getWriteSpreadsheetIdForModel(modelName, { seasonId });
  const sheetName = SHEETS_CONFIG.SHEETS[modelName];
  const outputField = "Rating";
  const rows = (
    await fastSheetsReader.fetchModel<DatabaseRecord>(modelName)
  ).filter((row) => String(row.seasonId ?? "") === seasonId);

  await rankRowsWithAppsScriptEngine(rows, {
    sheetName: modelName satisfies RankingEngineSheetName,
    outputField,
    mutate: true,
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
    await minimalSheetsWriter.upsertByCompositeKey(
      modelName,
      getCompositeKeyColumnsForModel(modelName),
      rows,
      {
        merge: true,
        idColumn: "id",
        createdAtColumn: "createdAt",
        updatedAtColumn: "updatedAt",
        spreadsheetId,
      },
    );
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
  if (options.includeTeamWeeks) {
    const powerResult = await runLocalPowerRankingsSeason(seasonId, {
      dryRun: !options.apply,
      returnRows: true,
      logToConsole: options.logToConsole,
    });

    if (options.apply) {
      const weekUpdates = powerResult.weekUpdates ?? [];
      const seasonUpdates = powerResult.seasonUpdates ?? [];
      const matchupUpdates = powerResult.matchupUpdates ?? [];

      if (weekUpdates.length > 0) {
        await minimalSheetsWriter.upsertByCompositeKey(
          "TeamWeekStatLine",
          getCompositeKeyColumnsForModel("TeamWeekStatLine"),
          weekUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
            spreadsheetId: getWriteSpreadsheetIdForModel("TeamWeekStatLine", {
              seasonId,
            }),
          },
        );
      }

      if (seasonUpdates.length > 0) {
        await minimalSheetsWriter.upsertByCompositeKey(
          "TeamSeasonStatLine",
          getCompositeKeyColumnsForModel("TeamSeasonStatLine"),
          seasonUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
            spreadsheetId: getWriteSpreadsheetIdForModel("TeamSeasonStatLine", {
              seasonId,
            }),
          },
        );
      }

      if (matchupUpdates.length > 0) {
        await minimalSheetsWriter.upsertByCompositeKey(
          "Matchup",
          ["id"],
          matchupUpdates,
          {
            merge: true,
            idColumn: "id",
            createdAtColumn: "createdAt",
            updatedAtColumn: "updatedAt",
            spreadsheetId: getWriteSpreadsheetIdForModel("Matchup", {
              seasonId,
            }),
          },
        );
      }
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
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const options = await parseOptions(process.argv.slice(2));
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
