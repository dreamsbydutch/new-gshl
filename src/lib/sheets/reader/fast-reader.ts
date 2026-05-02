import { optimizedSheetsClient } from "../client/optimized-client";
import {
  SHEETS_CONFIG,
  getPlayerDayWorkbookId,
  getSpreadsheetIdsForModel,
  convertRowToModel,
  type DatabaseRecord,
} from "../config/config";

type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

type SnapshotResult<M extends readonly ModelName[]> = Record<
  M[number],
  DatabaseRecord[]
>;

interface CacheEntry {
  rows: DatabaseRecord[];
  timestamp: number;
}

function alignRowsToConfiguredColumns(
  rawRows: (string | number | boolean | null)[][],
  columns: readonly string[],
): (string | number | boolean | null)[][] {
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);

  if (!header.length) {
    // Fallback for unexpected sheets without header rows.
    return dataRows.map((row) =>
      columns.map((_, index) => row[index] ?? null),
    );
  }

  const headerIndex = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = String(cell).trim();
    if (key) {
      headerIndex.set(key, index);
    }
  });

  return dataRows.map((row) =>
    columns.map((column) => {
      const index = headerIndex.get(column);
      return index === undefined ? null : row[index] ?? null;
    }),
  );
}

/**
 * FastSheetsReader
 *
 * Read-only, minimal “fetch rows” utilities optimized for batchGet.
 * Designed for client-side caching strategies (BrowserDB/localStorage)
 * where the server should return data quickly with minimal logic.
 */
export class FastSheetsReader {
  private readonly MODEL_CACHE_TTL = 60 * 1000;
  private modelCache = new Map<ModelName, CacheEntry>();
  private playerDaySeasonCache = new Map<string, CacheEntry>();
  private inFlightModelFetches = new Map<ModelName, Promise<DatabaseRecord[]>>();
  private inFlightPlayerDaySeasonFetches = new Map<
    string,
    Promise<DatabaseRecord[]>
  >();

  private getCachedModel<T extends DatabaseRecord>(
    modelName: ModelName,
  ): T[] | null {
    const cached = this.modelCache.get(modelName);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.MODEL_CACHE_TTL) {
      this.modelCache.delete(modelName);
      return null;
    }

    return cached.rows as T[];
  }

  private setCachedModel(
    modelName: ModelName,
    rows: DatabaseRecord[],
    timestamp = Date.now(),
  ): void {
    this.modelCache.set(modelName, {
      rows,
      timestamp,
    });
  }

  private getCachedPlayerDaySeason<T extends DatabaseRecord>(
    seasonId: string | number,
  ): T[] | null {
    const cached = this.playerDaySeasonCache.get(String(seasonId));
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.MODEL_CACHE_TTL) {
      this.playerDaySeasonCache.delete(String(seasonId));
      return null;
    }

    return cached.rows as T[];
  }

  private setCachedPlayerDaySeason(
    seasonId: string | number,
    rows: DatabaseRecord[],
    timestamp = Date.now(),
  ): void {
    this.playerDaySeasonCache.set(String(seasonId), {
      rows,
      timestamp,
    });
  }

  clearCache(modelName?: ModelName): void {
    if (modelName) {
      this.modelCache.delete(modelName);
      this.inFlightModelFetches.delete(modelName);
      if (modelName === "PlayerDayStatLine") {
        this.playerDaySeasonCache.clear();
        this.inFlightPlayerDaySeasonFetches.clear();
      }
      return;
    }

    this.modelCache.clear();
    this.playerDaySeasonCache.clear();
    this.inFlightModelFetches.clear();
    this.inFlightPlayerDaySeasonFetches.clear();
  }

  async fetchModel<T extends DatabaseRecord>(
    modelName: ModelName,
  ): Promise<T[]> {
    const cached = this.getCachedModel<T>(modelName);
    if (cached) {
      return cached;
    }

    const existingRequest = this.inFlightModelFetches.get(modelName);
    if (existingRequest) {
      return existingRequest as Promise<T[]>;
    }

    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    const request = (async () => {
      const range = `${sheetName}!A1:ZZ`;
      const spreadsheetIds = getSpreadsheetIdsForModel(String(modelName));
      const workbookRows = await Promise.all(
        spreadsheetIds.map(async (spreadsheetId) => {
          const rawRows = await optimizedSheetsClient.getValues(
            spreadsheetId,
            range,
          );
          return alignRowsToConfiguredColumns(rawRows, columns)
            .filter((row) => row && row.length > 0)
            .map((row) => convertRowToModel<T>(row, columns));
        }),
      );
      const rows = workbookRows.flat();

      this.setCachedModel(modelName, rows as DatabaseRecord[]);
      return rows;
    })();

    this.inFlightModelFetches.set(
      modelName,
      request as Promise<DatabaseRecord[]>,
    );

    try {
      return await request;
    } finally {
      this.inFlightModelFetches.delete(modelName);
    }
  }

  async fetchPlayerDaySeason<T extends DatabaseRecord>(
    seasonId: string | number,
  ): Promise<T[]> {
    const seasonKey = String(seasonId);
    const cached = this.getCachedPlayerDaySeason<T>(seasonKey);
    if (cached) {
      return cached;
    }

    const existingRequest =
      this.inFlightPlayerDaySeasonFetches.get(seasonKey);
    if (existingRequest) {
      return existingRequest as Promise<T[]>;
    }

    const modelName = "PlayerDayStatLine";
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    const request = (async () => {
      const range = `${sheetName}!A1:ZZ`;
      const spreadsheetId = getPlayerDayWorkbookId(seasonKey);
      const rawRows = await optimizedSheetsClient.getValues(
        spreadsheetId,
        range,
      );
      const rows = alignRowsToConfiguredColumns(rawRows, columns)
        .filter((row) => row && row.length > 0)
        .map((row) => convertRowToModel<T>(row, columns))
        .filter((row) => {
          const seasonValue = row.seasonId;
          return (
            (typeof seasonValue === "string" ||
              typeof seasonValue === "number") &&
            String(seasonValue) === seasonKey
          );
        });

      this.setCachedPlayerDaySeason(seasonKey, rows as DatabaseRecord[]);
      return rows;
    })();

    this.inFlightPlayerDaySeasonFetches.set(
      seasonKey,
      request as Promise<DatabaseRecord[]>,
    );

    try {
      return await request;
    } finally {
      this.inFlightPlayerDaySeasonFetches.delete(seasonKey);
    }
  }

  /**
   * Fetch many models efficiently.
   *
   * - Groups by workbook
   * - Uses a single `values.batchGet` call per workbook
   */
  async fetchSnapshot<M extends readonly ModelName[]>(
    models: M,
  ): Promise<SnapshotResult<M>> {
    const uniqueModels = Array.from(new Set(models));
    const output: Record<string, DatabaseRecord[]> = {};
    const pendingModels: ModelName[] = [];

    for (const modelName of uniqueModels) {
      const cached = this.getCachedModel(modelName);
      if (cached) {
        output[String(modelName)] = cached;
        continue;
      }

      pendingModels.push(modelName);
    }

    if (!pendingModels.length) {
      return output as SnapshotResult<M>;
    }

    const bySpreadsheet = new Map<string, ModelName[]>();
    for (const modelName of pendingModels) {
      for (const spreadsheetId of getSpreadsheetIdsForModel(String(modelName))) {
        const list = bySpreadsheet.get(spreadsheetId) ?? [];
        list.push(modelName);
        bySpreadsheet.set(spreadsheetId, list);
      }
    }

    const timestamp = Date.now();

    await Promise.all(
      Array.from(bySpreadsheet.entries()).map(async ([spreadsheetId, list]) => {
        const ranges: string[] = [];
        const rangeToModel = new Map<string, ModelName>();

        for (const modelName of list) {
          const sheetName = SHEETS_CONFIG.SHEETS[modelName];
          const columns = SHEETS_CONFIG.COLUMNS[modelName];
          if (!columns) {
            throw new Error(
              `No column configuration found for model: ${String(modelName)}`,
            );
          }

          const range = `${sheetName}!A1:ZZ`;
          ranges.push(range);
          rangeToModel.set(range, modelName);
        }

        const batch = await optimizedSheetsClient.getValuesOptimized(
          spreadsheetId,
          ranges,
        );

        for (const [range, values] of batch.entries()) {
          const modelName = rangeToModel.get(range);
          if (!modelName) continue;

          const columns = SHEETS_CONFIG.COLUMNS[modelName];
          if (!columns) continue;

          const alignedRows = alignRowsToConfiguredColumns(values, columns);

          const rows = alignedRows
            .filter((row) => row && row.length > 0)
            .map((row) => convertRowToModel(row, columns));

          output[String(modelName)] = [
            ...(output[String(modelName)] ?? []),
            ...rows,
          ];
        }
      }),
    );

    for (const modelName of pendingModels) {
      this.setCachedModel(
        modelName,
        output[String(modelName)] ?? [],
        timestamp,
      );
    }

    return output as SnapshotResult<M>;
  }
}

export const fastSheetsReader = new FastSheetsReader();
export type { ModelName as SheetsModelName };
