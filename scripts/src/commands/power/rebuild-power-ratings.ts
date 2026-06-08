import path from "node:path";
import {
  getCompositeKeyColumnsForModel,
  getWriteSpreadsheetIdForModel,
} from "@gshl-lib/sheets/config/config";
import { minimalSheetsWriter } from "@gshl-lib/sheets/writer/minimal-writer";
import { getArgValue, hasFlag, toBoolean } from "@gshl-lib/ranking/player-rating-support";
import { runLocalPowerRankingsSeason } from "../../domains/power/apps-script-power-engine";

type RebuildPowerOptions = {
  seasonId: string;
  apply: boolean;
  weekTypes: string[];
  seasonType: string;
  logToConsole: boolean;
};

const HELP_TEXT = `
Usage:
  npm run power:rebuild -- --season-id <id>
  npm run power:rebuild -- --season-id <id> --apply

Options:
  --season-id <id>      Required season id.
  --apply               Write power and matchup updates back to Google Sheets.
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

  const seasonId = String(getArgValue(args, "--season-id") ?? "").trim();
  if (!seasonId) {
    throw new Error("[power:rebuild] --season-id is required.");
  }

  return {
    seasonId,
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

  await minimalSheetsWriter.upsertByCompositeKey(
    modelName,
    keyColumns,
    rows,
    {
      merge: true,
      idColumn: "id",
      createdAtColumn: "createdAt",
      updatedAtColumn: "updatedAt",
      spreadsheetId: getWriteSpreadsheetIdForModel(modelName, { seasonId }),
    },
  );

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

  const result = await runLocalPowerRankingsSeason(options.seasonId, {
    weekTypes: options.weekTypes.length ? options.weekTypes : null,
    seasonType: options.seasonType || null,
    dryRun: true,
    returnRows: true,
    logToConsole: options.logToConsole,
  });

  const weekUpdates = result.weekUpdates ?? [];
  const seasonUpdates = result.seasonUpdates ?? [];
  const matchupUpdates = result.matchupUpdates ?? [];

  let writtenWeekRows = 0;
  let writtenSeasonRows = 0;
  let writtenMatchupRows = 0;
  if (options.apply) {
    writtenWeekRows = await writeRows(
      "TeamWeekStatLine",
      weekUpdates,
      options.seasonId,
    );
    writtenSeasonRows = await writeRows(
      "TeamSeasonStatLine",
      seasonUpdates,
      options.seasonId,
    );
    writtenMatchupRows = await writeRows(
      "Matchup",
      matchupUpdates,
      options.seasonId,
    );
  }

  console.log(
    JSON.stringify(
      {
        seasonId: options.seasonId,
        apply: options.apply,
        updatedWeekRows: result.updatedWeekRows,
        updatedSeasonRows: result.updatedSeasonRows,
        updatedMatchupRows: result.updatedMatchupRows,
        writtenWeekRows,
        writtenSeasonRows,
        writtenMatchupRows,
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
