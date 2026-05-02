import path from "node:path";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import {
  getArgValue,
  hasFlag,
  parseSupportedPlayerRatingModels,
  preparePlayerRatingModelRows,
  toBoolean,
  toTrimmedString,
  type PrimitiveCellValue,
  type SupportedPlayerRatingModelName,
} from "@gshl-lib/ranking/player-rating-support";

type ScriptOptions = {
  seasonId: string;
  models: SupportedPlayerRatingModelName[];
  apply: boolean;
  includeBreakdown: boolean;
  logToConsole: boolean;
  seasonType: string;
  weekIds: string[];
  weekNums: string[];
};

type ModelExecutionSummary = {
  modelName: SupportedPlayerRatingModelName;
  spreadsheetId: string;
  sheetName: string;
  outputField: string;
  matchedRows: number;
  updatedRows: number;
  dryRun: boolean;
};

const HELP_TEXT = `
Usage:
  npm run ratings:backfill -- --season-id <id>
  npm run ratings:backfill -- --season-id <id> --models PlayerWeekStatLine,PlayerTotalStatLine --apply

Options:
  --season-id <id>        Required season id to rate.
  --models <list>         Comma-separated models. Default: all supported player models.
  --apply                 Write updated ratings back to Google Sheets. Omit for dry-run.
  --season-type <value>   Optional seasonType filter for split and total models.
  --week-ids <list>       Optional comma-separated week ids for day/week models.
  --week-nums <list>      Optional comma-separated week numbers for day/week models.
  --include-breakdown     Preserve __ratingDebug payload on in-memory rows during execution.
  --log <true|false>      Enable or disable console logging. Default: true.
  --help                  Show this message and exit.
`.trim();

function parseOptions(args: string[]): ScriptOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonId = toTrimmedString(getArgValue(args, "--season-id"));
  if (!seasonId) {
    throw new Error("[ratings:backfill] --season-id is required.");
  }

  return {
    seasonId,
    models: parseSupportedPlayerRatingModels(getArgValue(args, "--models")),
    apply: hasFlag(args, "--apply"),
    includeBreakdown: hasFlag(args, "--include-breakdown"),
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    seasonType: toTrimmedString(getArgValue(args, "--season-type")),
    weekIds: String(getArgValue(args, "--week-ids") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    weekNums: String(getArgValue(args, "--week-nums") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function log(options: ScriptOptions, message: string): void {
  if (options.logToConsole) {
    console.log(`[ratings:backfill] ${message}`);
  }
}

async function executeModel(
  options: ScriptOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<ModelExecutionSummary> {
  const clientModule = await import("@gshl-lib/sheets/client/optimized-client");
  const prepared = await preparePlayerRatingModelRows(
    {
      seasonId: options.seasonId,
      seasonType: options.seasonType,
      weekIds: options.weekIds,
      weekNums: options.weekNums,
    },
    modelName,
  );
  const outputColumnIndex = prepared.headers.indexOf(prepared.outputField);
  if (outputColumnIndex < 0) {
    throw new Error(
      `[ratings:backfill] Could not resolve output column index for ${prepared.outputField}.`,
    );
  }

  const targetRecords = prepared.targetRows.map((entry) => entry.record);
  await rankRowsWithAppsScriptEngine(targetRecords, {
    sheetName: prepared.rankingSheetName,
    outputField: prepared.outputField,
    includeBreakdown: options.includeBreakdown,
    mutate: true,
  });

  if (options.apply && prepared.targetRows.length > 0) {
    const updates = new Map<number, PrimitiveCellValue[]>();
    for (const row of prepared.targetRows) {
      const nextValue = row.record[prepared.outputField];
      row.sheetValues[outputColumnIndex] =
        nextValue === undefined || nextValue === null
          ? ""
          : (nextValue as PrimitiveCellValue);
      updates.set(row.rowNumber, row.sheetValues);
    }
    await clientModule.optimizedSheetsClient.updateRowsByIds(
      prepared.spreadsheetId,
      prepared.sheetName,
      updates,
    );
  }

  return {
    modelName,
    spreadsheetId: prepared.spreadsheetId,
    sheetName: prepared.sheetName,
    outputField: prepared.outputField,
    matchedRows: prepared.targetRows.length,
    updatedRows: options.apply ? prepared.targetRows.length : 0,
    dryRun: !options.apply,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  log(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} for season ${options.seasonId} on ${options.models.join(", ")}.`,
  );

  const summaries: ModelExecutionSummary[] = [];
  for (const modelName of options.models) {
    const summary = await executeModel(options, modelName);
    summaries.push(summary);
    log(
      options,
      `${summary.modelName}: matched=${summary.matchedRows} output=${summary.outputField} sheet=${summary.sheetName} workbook=${summary.spreadsheetId}`,
    );
  }

  const matchedRows = summaries.reduce(
    (sum, summary) => sum + summary.matchedRows,
    0,
  );
  const updatedRows = summaries.reduce(
    (sum, summary) => sum + summary.updatedRows,
    0,
  );
  console.log(
    JSON.stringify(
      {
        seasonId: options.seasonId,
        apply: options.apply,
        seasonType: options.seasonType || null,
        weekIds: options.weekIds,
        weekNums: options.weekNums,
        matchedRows,
        updatedRows,
        models: summaries,
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
