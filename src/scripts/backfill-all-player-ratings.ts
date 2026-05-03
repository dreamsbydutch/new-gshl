import {
  getArgValue,
  hasFlag,
  parseSupportedPlayerRatingModels,
  toBoolean,
} from "@gshl-lib/ranking/player-rating-support";
import {
  getAllSeasonIds,
  runPlayerRatingBackfill,
  type PlayerRatingBackfillOptions,
  type PlayerRatingModelExecutionSummary,
} from "@gshl-lib/ranking/player-rating-backfill";

type FullRebuildOptions = {
  seasonIds: string[];
  models: PlayerRatingBackfillOptions["models"];
  apply: boolean;
  includeBreakdown: boolean;
  logToConsole: boolean;
  stopOnError: boolean;
};

type SeasonExecutionSummary = {
  seasonId: string;
  models: PlayerRatingModelExecutionSummary[];
  matchedRows: number;
  updatedRows: number;
};

const HELP_TEXT = `
Usage:
  npm run ratings:rebuild-all
  npm run ratings:rebuild-all -- --season-ids 11,12 --models PlayerTotalStatLine,PlayerNHLStatLine
  npm run ratings:rebuild-all -- --apply

Options:
  --season-ids <list>     Optional comma-separated season ids. Default: all Season rows.
  --models <list>         Comma-separated models. Default: all supported player models.
  --apply                 Write updated ratings back to Google Sheets. Omit for dry-run.
  --include-breakdown     Preserve __ratingDebug payload on in-memory rows during execution.
  --log <true|false>      Enable or disable console logging. Default: true.
  --stop-on-error         Abort immediately on the first season failure.
  --help                  Show this message and exit.
`.trim();

function log(
  options: Pick<FullRebuildOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[ratings:rebuild-all] ${message}`);
  }
}

function parseSeasonIds(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function parseOptions(args: string[]): Promise<FullRebuildOptions> {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const requestedSeasonIds = parseSeasonIds(getArgValue(args, "--season-ids"));
  const seasonIds = requestedSeasonIds.length
    ? requestedSeasonIds
    : await getAllSeasonIds();
  if (!seasonIds.length) {
    throw new Error("[ratings:rebuild-all] No season ids found.");
  }

  return {
    seasonIds,
    models: parseSupportedPlayerRatingModels(getArgValue(args, "--models")),
    apply: hasFlag(args, "--apply"),
    includeBreakdown: hasFlag(args, "--include-breakdown"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    stopOnError: hasFlag(args, "--stop-on-error"),
  };
}

async function executeSeason(
  options: FullRebuildOptions,
  seasonId: string,
): Promise<SeasonExecutionSummary> {
  const summaries = await runPlayerRatingBackfill({
    seasonId,
    models: options.models,
    apply: options.apply,
    includeBreakdown: options.includeBreakdown,
    logToConsole: options.logToConsole,
    seasonType: "",
    weekIds: [],
    weekNums: [],
  });

  return {
    seasonId,
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
  const options = await parseOptions(process.argv.slice(2));
  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} across ${options.seasonIds.length} season(s) for ${options.models.join(", ")}.`,
  );

  const seasons: SeasonExecutionSummary[] = [];
  const failures: Array<{ seasonId: string; message: string }> = [];

  for (const seasonId of options.seasonIds) {
    try {
      log(options, `Processing season ${seasonId}.`);
      const summary = await executeSeason(options, seasonId);
      seasons.push(summary);
      log(
        options,
        `Season ${seasonId}: matched=${summary.matchedRows} updated=${summary.updatedRows}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      failures.push({ seasonId, message });
      console.error(
        `[ratings:rebuild-all] Season ${seasonId} failed\n${message}`,
      );
      if (options.stopOnError) {
        break;
      }
    }
  }

  const matchedRows = seasons.reduce(
    (sum, season) => sum + season.matchedRows,
    0,
  );
  const updatedRows = seasons.reduce(
    (sum, season) => sum + season.updatedRows,
    0,
  );

  console.log(
    JSON.stringify(
      {
        apply: options.apply,
        seasonIds: options.seasonIds,
        processedSeasons: seasons.length,
        matchedRows,
        updatedRows,
        failures,
        seasons,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
