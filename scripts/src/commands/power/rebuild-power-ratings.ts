import path from "node:path";
import {
  getCompositeKeyColumnsForModel,
  getWriteSpreadsheetIdForModel,
  type DatabaseRecord,
} from "@gshl-lib/sheets/config/config";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { fetchModel } from "@gshl-lib/data/convex-store";
import {
  getArgValue,
  hasFlag,
  toBoolean,
} from "@gshl-lib/ranking/player-rating-support";
import { runLocalPowerRankingsSeason } from "../../domains/power/apps-script-power-engine";

type RebuildPowerOptions = {
  seasonIds: string[];
  allSeasons: boolean;
  apply: boolean;
  weekTypes: string[];
  seasonType: string;
  logToConsole: boolean;
};

const HELP_TEXT = `
Usage:
  npm run power:rebuild -- --season-id <id>
  npm run power:rebuild -- --season-ids <list>
  npm run power:rebuild -- --all-seasons
  npm run power:rebuild -- --season-id <id> --apply

Options:
  --season-id <id>      Optional single season id.
  --season-ids <list>   Optional comma-separated season ids.
  --all-seasons         Rebuild every season in chronological order.
  --apply               Write power and matchup updates back to Convex.
  --week-types <list>   Optional comma-separated week types.
  --season-type <type>  Optional legacy seasonType filter.
  --log <true|false>    Enable or disable console logging. Default: true.
  --help                Show this message and exit.
`.trim();

function parseList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function log(options: RebuildPowerOptions, message: string): void {
  if (options.logToConsole) {
    console.log(`[power:rebuild] ${message}`);
  }
}

function parseOptions(args: string[]): RebuildPowerOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonIds = Array.from(
    new Set([
      ...parseList(getArgValue(args, "--season-ids")),
      ...parseList(getArgValue(args, "--season-id")),
    ]),
  );
  const allSeasons = hasFlag(args, "--all-seasons");
  if (!seasonIds.length && !allSeasons) {
    throw new Error(
      "[power:rebuild] --season-id, --season-ids, or --all-seasons is required.",
    );
  }

  return {
    seasonIds,
    allSeasons,
    apply: hasFlag(args, "--apply"),
    weekTypes: parseList(getArgValue(args, "--week-types")),
    seasonType: String(getArgValue(args, "--season-type") ?? "").trim(),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
  };
}

async function writeRows(
  modelName: "TeamWeekStatLine" | "TeamSeasonStatLine" | "Matchup",
  rows: Record<string, unknown>[],
  seasonId: string,
): Promise<number> {
  if (!rows.length) return 0;

  const keyColumns =
    modelName === "Matchup"
      ? ["id"]
      : getCompositeKeyColumnsForModel(modelName);

  await minimalSheetsWriter.upsertByCompositeKey(modelName, keyColumns, rows, {
    merge: true,
    idColumn: "id",
    createdAtColumn: "createdAt",
    updatedAtColumn: "updatedAt",
    spreadsheetId: getWriteSpreadsheetIdForModel(modelName, { seasonId }),
  });

  return rows.length;
}

async function main(): Promise<void> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const options = parseOptions(process.argv.slice(2));
  if (!options.apply) {
    log(
      options,
      "Dry-run mode: pass --apply to write TeamWeekStatLine, TeamSeasonStatLine, and Matchup updates.",
    );
  }

  const seasons = await fetchModel<Record<string, unknown>>("Season");
  const selectedIds = new Set(options.seasonIds);
  const seasonIds = seasons
    .filter(
      (season) =>
        options.allSeasons ||
        selectedIds.has(String(season.id ?? "")) ||
        selectedIds.has(String(season.legacyId ?? "")),
    )
    .sort((left, right) => {
      const yearDifference =
        Number(left.year ?? left.seasonYear ?? 0) -
        Number(right.year ?? right.seasonYear ?? 0);
      if (yearDifference) return yearDifference;
      return String(left.startDate ?? "").localeCompare(
        String(right.startDate ?? ""),
      );
    })
    .map((season) => String(season.id ?? ""))
    .filter(Boolean);
  if (!seasonIds.length) {
    throw new Error("[power:rebuild] No matching seasons were found.");
  }

  const summaries = [];
  const replayedTeamWeeks: DatabaseRecord[] = [];
  for (const seasonId of seasonIds) {
    const result = await runLocalPowerRankingsSeason(seasonId, {
      weekTypes: options.weekTypes.length ? options.weekTypes : null,
      seasonType: options.seasonType || null,
      dryRun: true,
      returnRows: true,
      logToConsole: options.logToConsole,
      inputOverrides: replayedTeamWeeks.length
        ? { teamWeeks: replayedTeamWeeks }
        : undefined,
    });

    const weekUpdates = result.weekUpdates ?? [];
    const seasonUpdates = result.seasonUpdates ?? [];
    const matchupUpdates = result.matchupUpdates ?? [];
    replayedTeamWeeks.push(...weekUpdates);
    let writtenWeekRows = 0;
    let writtenSeasonRows = 0;
    let writtenMatchupRows = 0;
    if (options.apply) {
      writtenWeekRows = await writeRows(
        "TeamWeekStatLine",
        weekUpdates,
        seasonId,
      );
      writtenSeasonRows = await writeRows(
        "TeamSeasonStatLine",
        seasonUpdates,
        seasonId,
      );
      writtenMatchupRows = await writeRows("Matchup", matchupUpdates, seasonId);
    }
    summaries.push({
      seasonId,
      updatedWeekRows: result.updatedWeekRows,
      updatedSeasonRows: result.updatedSeasonRows,
      updatedMatchupRows: result.updatedMatchupRows,
      writtenWeekRows,
      writtenSeasonRows,
      writtenMatchupRows,
    });
  }

  console.log(
    JSON.stringify(
      {
        seasonIds,
        apply: options.apply,
        summaries,
      },
      null,
      2,
    ),
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
