import path from "node:path";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
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

export type PlayerRatingBackfillOptions = {
  seasonId: string;
  models: SupportedPlayerRatingModelName[];
  apply: boolean;
  includeBreakdown: boolean;
  logToConsole: boolean;
  seasonType: string;
  weekIds: string[];
  weekNums: string[];
};

export type PlayerRatingModelExecutionSummary = {
  modelName: SupportedPlayerRatingModelName;
  spreadsheetId: string;
  sheetName: string;
  outputField: string;
  matchedRows: number;
  updatedRows: number;
  dryRun: boolean;
};

export const PLAYER_RATINGS_BACKFILL_HELP_TEXT = `
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

function formatUnknownMessage(value: unknown): string {
  if (value == null) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function parsePlayerRatingBackfillOptions(
  args: string[],
): PlayerRatingBackfillOptions {
  if (hasFlag(args, "--help")) {
    console.log(PLAYER_RATINGS_BACKFILL_HELP_TEXT);
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

export function logPlayerRatingBackfill(
  options: Pick<PlayerRatingBackfillOptions, "logToConsole">,
  message: string,
): void {
  if (options.logToConsole) {
    console.log(`[ratings:backfill] ${message}`);
  }
}

function isWritePermissionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, status, message } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  return (
    code === 403 ||
    status === 403 ||
    (typeof message === "string" &&
      message.toLowerCase().includes("permission"))
  );
}

function wrapWritePermissionError(
  error: unknown,
  options: PlayerRatingBackfillOptions,
  modelName: SupportedPlayerRatingModelName,
  prepared: Awaited<ReturnType<typeof preparePlayerRatingModelRows>>,
  serviceAccountEmail?: string,
): Error {
  const baseMessage =
    error instanceof Error
      ? error.message
      : formatUnknownMessage(error) || "Unknown error";
  const accountLabel = serviceAccountEmail
    ? `Service account ${serviceAccountEmail}`
    : "Configured Google Sheets credentials";

  return new Error(
    `[ratings:backfill] ${accountLabel} cannot update ${modelName} for season ${options.seasonId} in workbook ${prepared.spreadsheetId} sheet ${prepared.sheetName}. Google Sheets returned: ${baseMessage}. Share that spreadsheet with Editor access for the service account or rerun with --models excluding ${modelName}.`,
  );
}

export async function executePlayerRatingModelBackfill(
  options: PlayerRatingBackfillOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<PlayerRatingModelExecutionSummary> {
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
      updates.set(row.rowNumber - 1, row.sheetValues);
    }
    try {
      await clientModule.optimizedSheetsClient.updateRowsByIds(
        prepared.spreadsheetId,
        prepared.sheetName,
        updates,
      );
    } catch (error) {
      if (isWritePermissionError(error)) {
        throw wrapWritePermissionError(
          error,
          options,
          modelName,
          prepared,
          clientModule.optimizedSheetsClient.getConfiguredServiceAccountEmail(),
        );
      }
      throw error;
    }
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

export async function runPlayerRatingBackfill(
  options: PlayerRatingBackfillOptions,
): Promise<PlayerRatingModelExecutionSummary[]> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  logPlayerRatingBackfill(
    options,
    `Starting ${options.apply ? "apply" : "dry-run"} for season ${options.seasonId} on ${options.models.join(", ")}.`,
  );

  const summaries: PlayerRatingModelExecutionSummary[] = [];
  for (const modelName of options.models) {
    const summary = await executePlayerRatingModelBackfill(options, modelName);
    summaries.push(summary);
    logPlayerRatingBackfill(
      options,
      `${summary.modelName}: matched=${summary.matchedRows} output=${summary.outputField} sheet=${summary.sheetName} workbook=${summary.spreadsheetId}`,
    );
  }

  return summaries;
}

export async function getAllSeasonIds(): Promise<string[]> {
  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??=
    path.resolve("credentials.json");

  const { fastSheetsReader } = await import(
    "@gshl-lib/sheets/reader/fast-reader"
  );
  const seasons = await fastSheetsReader.fetchModel<DatabaseRecord>("Season");
  return seasons
    .map((row) => toTrimmedString(row.id))
    .filter(Boolean)
    .sort((left, right) => {
      const leftNumber = Number(left);
      const rightNumber = Number(right);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return left.localeCompare(right);
    });
}
