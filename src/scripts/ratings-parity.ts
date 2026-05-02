import path from "node:path";
import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import { rankRowsWithAppsScriptEngine } from "@gshl-lib/ranking/apps-script-engine";
import { runAppsScriptFunction } from "@gshl-lib/ranking/apps-script-execution";
import {
  getArgValue,
  hasFlag,
  parsePositiveInteger,
  parseSupportedPlayerRatingModels,
  preparePlayerRatingModelRows,
  toBoolean,
  toTrimmedString,
  type LoadedPlayerRatingRow,
  type SupportedPlayerRatingModelName,
} from "@gshl-lib/ranking/player-rating-support";

type ParityOptions = {
  seasonId: string;
  models: SupportedPlayerRatingModelName[];
  sampleSize: number;
  seed: string;
  logToConsole: boolean;
  seasonType: string;
  weekIds: string[];
  weekNums: string[];
  maxDelta: number;
};

type AppsScriptSampleResult = {
  id: string;
  score: string | number;
  outputField: string;
  posGroup: string;
  seasonType: string;
  weekId: string;
};

type AppsScriptParityResponse = {
  seasonId: string;
  normalizedSheetName: string;
  sheetName: string;
  outputField: string;
  totalRows: number;
  requestedSampleCount: number;
  sampleResults: AppsScriptSampleResult[];
};

type ParityRowResult = {
  id: string;
  posGroup: string;
  seasonType: string;
  weekId: string;
  nodeScore: string | number;
  appsScriptScore: string | number;
  delta: number | null;
  matches: boolean;
};

type ModelParitySummary = {
  modelName: SupportedPlayerRatingModelName;
  sheetName: string;
  outputField: string;
  totalRows: number;
  sampledRows: number;
  matchedRows: number;
  mismatchedRows: number;
  maxDelta: number;
  mismatches: ParityRowResult[];
};

const HELP_TEXT = `
Usage:
  npm run ratings:parity -- --season-id <id>
  npm run ratings:parity -- --season-id <id> --models PlayerWeekStatLine,PlayerTotalStatLine --sample-size 24

Options:
  --season-id <id>        Required season id to compare.
  --models <list>         Comma-separated player rating models. Default: all supported models.
  --sample-size <n>       Rows to sample per model. Default: 24.
  --seed <value>          Deterministic sampling seed. Default: season id.
  --season-type <value>   Optional seasonType filter for split and total models.
  --week-ids <list>       Optional comma-separated week ids for day/week models.
  --week-nums <list>      Optional comma-separated week numbers for day/week models.
  --max-delta <value>     Allowed absolute score delta before mismatch. Default: 0.01.
  --log <true|false>      Enable or disable console logging. Default: true.
  --help                  Show this message and exit.

Requirements:
  GOOGLE_APPS_SCRIPT_ID and GOOGLE_APPS_SCRIPT_ACCESS_TOKEN must be set for live Apps Script execution.
`.trim();

function parseNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableSortRows(rows: LoadedPlayerRatingRow[], seed: string): LoadedPlayerRatingRow[] {
  return rows
    .slice()
    .sort((left, right) => {
      const leftKey = `${seed}|${toTrimmedString(left.record.id)}`;
      const rightKey = `${seed}|${toTrimmedString(right.record.id)}`;
      const leftHash = hashString(leftKey);
      const rightHash = hashString(rightKey);
      if (leftHash !== rightHash) {
        return leftHash - rightHash;
      }
      return leftKey.localeCompare(rightKey);
    });
}

function sampleRows(
  rows: LoadedPlayerRatingRow[],
  sampleSize: number,
  seed: string,
): LoadedPlayerRatingRow[] {
  if (rows.length <= sampleSize) {
    return rows.slice();
  }

  const groups = new Map<string, LoadedPlayerRatingRow[]>();
  for (const row of rows) {
    const posGroup = toTrimmedString(row.record.posGroup) || "UNKNOWN";
    const current = groups.get(posGroup) ?? [];
    current.push(row);
    groups.set(posGroup, current);
  }

  const groupKeys = Array.from(groups.keys()).sort();
  const selected = new Map<string, LoadedPlayerRatingRow>();
  let remaining = sampleSize;
  let remainingGroups = groupKeys.length;

  for (const groupKey of groupKeys) {
    const groupRows = stableSortRows(groups.get(groupKey) ?? [], `${seed}|${groupKey}`);
    const targetCount = Math.min(groupRows.length, Math.ceil(remaining / remainingGroups));
    for (const row of groupRows.slice(0, targetCount)) {
      const rowId = toTrimmedString(row.record.id);
      if (!rowId) continue;
      selected.set(rowId, row);
    }
    remaining = Math.max(sampleSize - selected.size, 0);
    remainingGroups -= 1;
  }

  if (selected.size < sampleSize) {
    const fallbackRows = stableSortRows(rows, `${seed}|fallback`);
    for (const row of fallbackRows) {
      const rowId = toTrimmedString(row.record.id);
      if (!rowId || selected.has(rowId)) continue;
      selected.set(rowId, row);
      if (selected.size >= sampleSize) break;
    }
  }

  return Array.from(selected.values()).slice(0, sampleSize);
}

function parseOptions(args: string[]): ParityOptions {
  if (hasFlag(args, "--help")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const seasonId = toTrimmedString(getArgValue(args, "--season-id"));
  if (!seasonId) {
    throw new Error("[ratings:parity] --season-id is required.");
  }

  return {
    seasonId,
    models: parseSupportedPlayerRatingModels(getArgValue(args, "--models")),
    sampleSize: parsePositiveInteger(getArgValue(args, "--sample-size"), 24),
    seed: toTrimmedString(getArgValue(args, "--seed")) || seasonId,
    logToConsole: toBoolean(getArgValue(args, "--log"), true),
    seasonType: toTrimmedString(getArgValue(args, "--season-type")),
    weekIds: (getArgValue(args, "--week-ids") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    weekNums: (getArgValue(args, "--week-nums") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    maxDelta: Number(getArgValue(args, "--max-delta") ?? "0.01") || 0.01,
  };
}

function log(options: ParityOptions, message: string): void {
  if (options.logToConsole) {
    console.log(`[ratings:parity] ${message}`);
  }
}

function compareScores(
  nodeScore: unknown,
  appsScriptScore: unknown,
  maxDelta: number,
): { matches: boolean; delta: number | null } {
  const left = parseNumber(nodeScore);
  const right = parseNumber(appsScriptScore);
  if (left === null || right === null) {
    return {
      matches: toTrimmedString(nodeScore) === toTrimmedString(appsScriptScore),
      delta: null,
    };
  }

  const delta = Math.abs(left - right);
  return {
    matches: delta <= maxDelta,
    delta,
  };
}

async function runModelParity(
  options: ParityOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<ModelParitySummary> {
  const prepared = await preparePlayerRatingModelRows(
    {
      seasonId: options.seasonId,
      seasonType: options.seasonType,
      weekIds: options.weekIds,
      weekNums: options.weekNums,
    },
    modelName,
  );

  const sample = sampleRows(prepared.targetRows, options.sampleSize, `${options.seed}|${modelName}`);
  const sampleIds = sample.map((row) => toTrimmedString(row.record.id)).filter(Boolean);
  const localRows = prepared.targetRows.map((row) => ({ ...row.record }));

  await rankRowsWithAppsScriptEngine(localRows, {
    sheetName: prepared.rankingSheetName,
    outputField: prepared.outputField,
    mutate: true,
  });

  const localById = new Map<string, DatabaseRecord>();
  for (const row of localRows) {
    const rowId = toTrimmedString(row.id);
    if (!rowId) continue;
    localById.set(rowId, row);
  }

  const appsScriptResult = await runAppsScriptFunction<AppsScriptParityResponse>(
    "runRatingParitySample",
    {
      seasonId: options.seasonId,
      sheetName: prepared.rankingSheetName,
      sampleIds,
      seasonType: options.seasonType,
      weekIds: options.weekIds,
      weekNums: options.weekNums,
    },
  );

  const mismatches: ParityRowResult[] = [];
  let matchedRows = 0;
  for (const remoteRow of appsScriptResult.sampleResults) {
    const localRow = localById.get(remoteRow.id);
    const localScore = localRow?.[prepared.outputField] ?? "";
    const comparison = compareScores(localScore, remoteRow.score, options.maxDelta);
    if (comparison.matches) {
      matchedRows += 1;
      continue;
    }

    mismatches.push({
      id: remoteRow.id,
      posGroup: remoteRow.posGroup,
      seasonType: remoteRow.seasonType,
      weekId: remoteRow.weekId,
      nodeScore: localScore as string | number,
      appsScriptScore: remoteRow.score,
      delta: comparison.delta,
      matches: false,
    });
  }

  return {
    modelName,
    sheetName: appsScriptResult.sheetName,
    outputField: appsScriptResult.outputField,
    totalRows: appsScriptResult.totalRows,
    sampledRows: appsScriptResult.sampleResults.length,
    matchedRows,
    mismatchedRows: mismatches.length,
    maxDelta: mismatches.reduce((max, row) => Math.max(max, row.delta ?? 0), 0),
    mismatches,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  process.env.USE_GOOGLE_SHEETS ??= "true";
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ??= path.resolve("credentials.json");

  log(
    options,
    `Starting parity check for season ${options.seasonId} on ${options.models.join(", ")} with sample size ${options.sampleSize}.`,
  );

  const summaries: ModelParitySummary[] = [];
  for (const modelName of options.models) {
    const summary = await runModelParity(options, modelName);
    summaries.push(summary);
    log(
      options,
      `${modelName}: sampled=${summary.sampledRows} matched=${summary.matchedRows} mismatched=${summary.mismatchedRows}`,
    );
  }

  const totals = summaries.reduce(
    (accumulator, summary) => {
      accumulator.sampledRows += summary.sampledRows;
      accumulator.matchedRows += summary.matchedRows;
      accumulator.mismatchedRows += summary.mismatchedRows;
      accumulator.maxDelta = Math.max(accumulator.maxDelta, summary.maxDelta);
      return accumulator;
    },
    { sampledRows: 0, matchedRows: 0, mismatchedRows: 0, maxDelta: 0 },
  );

  console.log(
    JSON.stringify(
      {
        seasonId: options.seasonId,
        models: summaries,
        totals,
      },
      null,
      2,
    ),
  );

  if (totals.mismatchedRows > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});