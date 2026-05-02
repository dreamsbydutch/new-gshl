import type { DatabaseRecord } from "@gshl-lib/sheets/config/config";
import {
  getDefaultRatingOutputField,
  normalizeRankingEngineSheetName,
  type RankingEngineSheetName,
} from "@gshl-lib/ranking/apps-script-engine";

export type PrimitiveCellValue = string | number | boolean | null;

export type SupportedPlayerRatingModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerNHLStatLine";

export type PlayerRatingSelectionOptions = {
  seasonId: string;
  seasonType?: string;
  weekIds?: string[];
  weekNums?: string[];
};

type SheetsConfigShape = {
  SHEETS: Record<string, string>;
  COLUMNS: Record<string, readonly string[]>;
};

export type LoadedPlayerRatingRow = {
  rowNumber: number;
  sheetValues: PrimitiveCellValue[];
  record: DatabaseRecord;
};

export type PreparedPlayerRatingModel = {
  modelName: SupportedPlayerRatingModelName;
  spreadsheetId: string;
  sheetName: string;
  outputField: string;
  rankingSheetName: RankingEngineSheetName;
  headers: string[];
  rows: LoadedPlayerRatingRow[];
  targetRows: LoadedPlayerRatingRow[];
};

export const ALL_SUPPORTED_PLAYER_RATING_MODELS: SupportedPlayerRatingModelName[] = [
  "PlayerDayStatLine",
  "PlayerWeekStatLine",
  "PlayerSplitStatLine",
  "PlayerTotalStatLine",
  "PlayerNHLStatLine",
];

const MODEL_NAME_ALIASES: Record<string, SupportedPlayerRatingModelName | "all"> = {
  all: "all",
  playerday: "PlayerDayStatLine",
  playerdaystatline: "PlayerDayStatLine",
  playerweek: "PlayerWeekStatLine",
  playerweekstatline: "PlayerWeekStatLine",
  playersplit: "PlayerSplitStatLine",
  playersplitstatline: "PlayerSplitStatLine",
  playertotal: "PlayerTotalStatLine",
  playertotalstatline: "PlayerTotalStatLine",
  playernhl: "PlayerNHLStatLine",
  playernhlstatline: "PlayerNHLStatLine",
};

export function getArgValue(args: string[], flagName: string): string | undefined {
  const exactIndex = args.findIndex((arg) => arg === flagName);
  if (exactIndex >= 0) {
    return args[exactIndex + 1];
  }

  const prefix = `${flagName}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

export function hasFlag(args: string[], flagName: string): boolean {
  return args.includes(flagName);
}

export function toTrimmedString(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" || typeof value === "symbol") return "";
  if (typeof value === "string") return value.trim();
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString().trim();
  }
  return "";
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  const normalized = toTrimmedString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function parseCsvList(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeModelName(
  value: string,
): SupportedPlayerRatingModelName | "all" {
  const normalized = value.trim().toLowerCase();
  const resolved = MODEL_NAME_ALIASES[normalized];
  if (!resolved) {
    throw new Error(`[player-rating] Unsupported model: ${value}`);
  }
  return resolved;
}

export function parseSupportedPlayerRatingModels(
  value: string | undefined,
): SupportedPlayerRatingModelName[] {
  const requested = parseCsvList(value);
  if (!requested.length) {
    return ALL_SUPPORTED_PLAYER_RATING_MODELS.slice();
  }

  const resolved = requested.flatMap((modelName) => {
    const normalized = normalizeModelName(modelName);
    return normalized === "all" ? ALL_SUPPORTED_PLAYER_RATING_MODELS : [normalized];
  });

  return Array.from(new Set(resolved));
}

function padRow(values: PrimitiveCellValue[], length: number): PrimitiveCellValue[] {
  const next = values.slice(0, length);
  while (next.length < length) {
    next.push("");
  }
  return next;
}

function resolveConfiguredSheetName(
  config: SheetsConfigShape,
  modelName: SupportedPlayerRatingModelName,
): string {
  return config.SHEETS[modelName] ?? modelName;
}

function getSheetCandidates(
  config: SheetsConfigShape,
  modelName: SupportedPlayerRatingModelName,
): string[] {
  return [resolveConfiguredSheetName(config, modelName)];
}

function resolveOutputField(
  headers: readonly string[],
  preferredOutputField: string,
): string {
  if (headers.includes(preferredOutputField)) {
    return preferredOutputField;
  }

  const candidates =
    preferredOutputField === "seasonRating"
      ? ["seasonRating", "seasonrating", "season_rating"]
      : ["Rating", "rating"];

  const resolved = candidates.find((candidate) => headers.includes(candidate));
  if (!resolved) {
    throw new Error(
      `[player-rating] Could not find output column ${preferredOutputField} in sheet headers.`,
    );
  }
  return resolved;
}

function matchesSeasonTypeFilter(
  record: DatabaseRecord,
  seasonType: string,
): boolean {
  if (!seasonType) return true;
  return toTrimmedString(record.seasonType) === seasonType;
}

function matchesWeekIdFilter(
  record: DatabaseRecord,
  weekIdAllowList: ReadonlySet<string> | null,
): boolean {
  if (!weekIdAllowList) return true;
  const weekId = toTrimmedString(record.weekId);
  return !!weekId && weekIdAllowList.has(weekId);
}

function isWeekScopedModel(modelName: SupportedPlayerRatingModelName): boolean {
  return modelName === "PlayerDayStatLine" || modelName === "PlayerWeekStatLine";
}

async function buildWeekIdAllowList(
  options: PlayerRatingSelectionOptions,
): Promise<ReadonlySet<string> | null> {
  if ((options.weekIds ?? []).length > 0) {
    return new Set(options.weekIds);
  }

  if ((options.weekNums ?? []).length === 0) {
    return null;
  }

  const { fastSheetsReader } = await import("@gshl-lib/sheets/reader/fast-reader");
  const weeks = await fastSheetsReader.fetchModel<DatabaseRecord>("Week");
  const allowList = new Set<string>();
  for (const week of weeks) {
    if (toTrimmedString(week.seasonId) !== options.seasonId) continue;
    const weekNum = toTrimmedString(week.weekNum);
    const weekId = toTrimmedString(week.id);
    if (!weekNum || !weekId || !(options.weekNums ?? []).includes(weekNum)) continue;
    allowList.add(weekId);
  }

  return allowList.size > 0 ? allowList : null;
}

async function resolveSpreadsheetId(
  modelName: SupportedPlayerRatingModelName,
  seasonId: string,
): Promise<string> {
  const configModule = await import("@gshl-lib/sheets/config/config");
  if (modelName === "PlayerDayStatLine") {
    return configModule.getPlayerDayWorkbookId(seasonId);
  }
  return configModule.getSpreadsheetIdForModel(modelName);
}

async function loadWritableRows(
  spreadsheetId: string,
  sheetNameCandidates: string[],
  modelName: SupportedPlayerRatingModelName,
): Promise<{
  sheetName: string;
  headers: string[];
  rows: LoadedPlayerRatingRow[];
}> {
  const [clientModule, configModule] = await Promise.all([
    import("@gshl-lib/sheets/client/optimized-client"),
    import("@gshl-lib/sheets/config/config"),
  ]);

  const columns = configModule.SHEETS_CONFIG.COLUMNS[modelName];
  if (!columns) {
    throw new Error(`[player-rating] No configured columns for ${modelName}.`);
  }

  let lastError: unknown = null;
  for (const sheetName of sheetNameCandidates) {
    try {
      const rawRows = await clientModule.optimizedSheetsClient.getValues(
        spreadsheetId,
        `${sheetName}!A1:ZZ`,
      );

      const headers = (rawRows[0] ?? []).map((value) => String(value ?? "").trim());
      if (!headers.length) {
        return { sheetName, headers: [], rows: [] };
      }

      const headerIndex = new Map<string, number>();
      headers.forEach((header, index) => {
        if (header) {
          headerIndex.set(header, index);
        }
      });

      const rows: LoadedPlayerRatingRow[] = [];
      for (let index = 1; index < rawRows.length; index += 1) {
        const values = rawRows[index] ?? [];
        const paddedSheetValues = padRow(
          values.map((value) => (value ?? "") as PrimitiveCellValue),
          headers.length,
        );
        const alignedValues = columns.map((column) => {
          const headerPosition = headerIndex.get(column);
          return headerPosition === undefined ? null : paddedSheetValues[headerPosition] ?? null;
        });

        const record = configModule.convertRowToModel<DatabaseRecord>(
          alignedValues,
          columns,
        );

        rows.push({
          rowNumber: index + 1,
          sheetValues: paddedSheetValues,
          record,
        });
      }

      return { sheetName, headers, rows };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[player-rating] Could not load ${modelName} from Sheets.`);
}

export async function preparePlayerRatingModelRows(
  selection: PlayerRatingSelectionOptions,
  modelName: SupportedPlayerRatingModelName,
): Promise<PreparedPlayerRatingModel> {
  const configModule = await import("@gshl-lib/sheets/config/config");
  const spreadsheetId = await resolveSpreadsheetId(modelName, selection.seasonId);
  const loaded = await loadWritableRows(
    spreadsheetId,
    getSheetCandidates(configModule.SHEETS_CONFIG, modelName),
    modelName,
  );
  const rankingSheetName = normalizeRankingEngineSheetName(modelName);
  const preferredOutputField = getDefaultRatingOutputField(rankingSheetName);
  const outputField = resolveOutputField(loaded.headers, preferredOutputField);
  const weekIdAllowList = isWeekScopedModel(modelName)
    ? await buildWeekIdAllowList(selection)
    : null;

  const targetRows = loaded.rows.filter(({ record }) => {
    if (toTrimmedString(record.seasonId) !== selection.seasonId) return false;
    if (!matchesSeasonTypeFilter(record, selection.seasonType ?? "")) return false;
    if (isWeekScopedModel(modelName) && !matchesWeekIdFilter(record, weekIdAllowList)) {
      return false;
    }
    return true;
  });

  return {
    modelName,
    spreadsheetId,
    sheetName: loaded.sheetName,
    outputField,
    rankingSheetName,
    headers: loaded.headers,
    rows: loaded.rows,
    targetRows,
  };
}