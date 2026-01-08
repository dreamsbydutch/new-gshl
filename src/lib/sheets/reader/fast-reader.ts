import { optimizedSheetsClient } from "../client/optimized-client";
import {
  SHEETS_CONFIG,
  WORKBOOKS,
  MODEL_TO_WORKBOOK,
  convertRowToModel,
  type DatabaseRecord,
} from "../config/config";

type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

type SnapshotResult<M extends readonly ModelName[]> = {
  [K in M[number]]: DatabaseRecord[];
};

function getColumnLetter(index: number): string {
  let letter = "";
  let current = index;
  while (current > 0) {
    current--;
    letter = String.fromCharCode((current % 26) + 65) + letter;
    current = Math.floor(current / 26);
  }
  return letter;
}

function getSpreadsheetIdForModel(modelName: string): string {
  const workbookKey = MODEL_TO_WORKBOOK[modelName];
  if (!workbookKey) {
    throw new Error(`No workbook mapping found for model: ${modelName}`);
  }
  return WORKBOOKS[workbookKey];
}

/**
 * FastSheetsReader
 *
 * Read-only, minimal “fetch rows” utilities optimized for batchGet.
 * Designed for client-side caching strategies (BrowserDB/localStorage)
 * where the server should return data quickly with minimal logic.
 */
export class FastSheetsReader {
  async fetchModel<T extends DatabaseRecord>(
    modelName: ModelName,
  ): Promise<T[]> {
    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    if (!columns) {
      throw new Error(`No column configuration found for model: ${modelName}`);
    }

    const maxColumn = getColumnLetter(columns.length);
    const range = `${sheetName}!A2:${maxColumn}`;
    const spreadsheetId = getSpreadsheetIdForModel(String(modelName));

    const rows = await optimizedSheetsClient.getValues(spreadsheetId, range);
    return rows
      .filter((row) => row && row.length > 0)
      .map((row) => convertRowToModel<T>(row, columns));
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
    const uniqueModels = Array.from(new Set(models)) as ModelName[];

    const bySpreadsheet = new Map<string, ModelName[]>();
    for (const modelName of uniqueModels) {
      const spreadsheetId = getSpreadsheetIdForModel(String(modelName));
      const list = bySpreadsheet.get(spreadsheetId) ?? [];
      list.push(modelName);
      bySpreadsheet.set(spreadsheetId, list);
    }

    const output: Record<string, DatabaseRecord[]> = {};

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

          const maxColumn = getColumnLetter(columns.length);
          const range = `${sheetName}!A2:${maxColumn}`;
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

          output[String(modelName)] = values
            .filter((row) => row && row.length > 0)
            .map((row) => convertRowToModel(row, columns));
        }
      }),
    );

    return output as SnapshotResult<M>;
  }
}

export const fastSheetsReader = new FastSheetsReader();
export type { ModelName as SheetsModelName };
