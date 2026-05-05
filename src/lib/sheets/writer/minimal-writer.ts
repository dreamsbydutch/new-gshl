import { optimizedSheetsClient } from "../client/optimized-client";
import { getSpreadsheetIdsForModel, SHEETS_CONFIG } from "../config/config";
import { fastSheetsReader } from "../reader/fast-reader";

type PrimitiveCellValue = string | number | boolean | null;
type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

type CompositeKeyUpsertOptions = {
  merge?: boolean;
  updatedAtColumn?: string;
  createdAtColumn?: string;
  idColumn?: string;
  generateId?: () => string;
};

type CompositeKeyUpsertResult = {
  updated: number;
  inserted: number;
  total: number;
};

function stringifyPrimitive(value: string | number | boolean): string {
  return typeof value === "string" ? value : String(value);
}

function columnToLetter(columnIndex1: number): string {
  let columnIndex = columnIndex1;
  let letter = "";

  while (columnIndex > 0) {
    const remainder = (columnIndex - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnIndex = Math.floor((columnIndex - 1) / 26);
  }

  return letter;
}

function normalizeWriteValue(value: unknown): PrimitiveCellValue {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Date) {
    // Keep date-only semantics: serialize to YYYY-MM-DD
    return value.toISOString().slice(0, 10);
  }
  // Fallback: store JSON for objects/arrays
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return "";
}

function normalizeCompositeKeyPart(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = stringifyPrimitive(value).trim();
    if (!text) return "";
    if (/^-?\d+(\.\d+)?$/.test(text)) {
      const numeric = Number(text);
      if (Number.isFinite(numeric)) return String(numeric);
    }
    return text;
  }

  return "";
}

function makeCompositeKey(
  source: Record<string, unknown>,
  keyColumns: readonly string[],
): string {
  return keyColumns
    .map((column) => normalizeCompositeKeyPart(source[column]))
    .join("|");
}

function rowToRecord(
  header: readonly string[],
  row: readonly PrimitiveCellValue[],
): Record<string, PrimitiveCellValue> {
  const record: Record<string, PrimitiveCellValue> = {};
  header.forEach((column, index) => {
    record[column] = row[index] ?? "";
  });
  return record;
}

function buildRowFromObject(
  header: readonly string[],
  item: Record<string, unknown>,
  existingRow: readonly PrimitiveCellValue[] | null,
  merge: boolean,
): PrimitiveCellValue[] {
  return header.map((column, index) => {
    if (Object.prototype.hasOwnProperty.call(item, column)) {
      return normalizeWriteValue(item[column]);
    }
    if (merge && existingRow) {
      return existingRow[index] ?? "";
    }
    return "";
  });
}

async function findRowNumberById(
  modelName: keyof typeof SHEETS_CONFIG.SHEETS,
  id: string,
): Promise<{
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
} | null> {
  const sheetName = SHEETS_CONFIG.SHEETS[modelName];
  const columns = SHEETS_CONFIG.COLUMNS[modelName];

  if (!sheetName || !columns) {
    throw new Error(`Unknown or unconfigured model: ${String(modelName)}`);
  }

  const idColumnIndex = columns.indexOf("id");
  if (idColumnIndex < 0) {
    throw new Error(`Model ${String(modelName)} has no 'id' column mapping`);
  }

  const idColLetter = columnToLetter(idColumnIndex + 1);
  const idColumnRange = `${sheetName}!${idColLetter}2:${idColLetter}`;

  for (const spreadsheetId of getSpreadsheetIdsForModel(String(modelName))) {
    const idValues = await optimizedSheetsClient.getValues(
      spreadsheetId,
      idColumnRange,
    );

    for (let i = 0; i < idValues.length; i++) {
      const cell = idValues[i]?.[0];
      if (cell === undefined || cell === null) continue;
      if (String(cell).trim() === String(id).trim()) {
        return { spreadsheetId, sheetName, rowNumber: i + 2 };
      }
    }
  }

  return null;
}

export class MinimalSheetsWriter {
  async updateById<T extends Record<string, unknown>>(
    modelName: ModelName,
    id: string,
    data: Partial<T>,
  ): Promise<void> {
    const location = await findRowNumberById(modelName, id);
    if (!location) {
      throw new Error(`${String(modelName)} with id ${id} not found`);
    }

    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    const updates = Object.entries(data).filter(([key, value]) => {
      if (value === undefined) return false;
      return columns.includes(key as never);
    });

    for (const [key, value] of updates) {
      const colIndex = columns.indexOf(key as never);
      if (colIndex < 0) continue;
      const colLetter = columnToLetter(colIndex + 1);
      const range = `${location.sheetName}!${colLetter}${location.rowNumber}`;

      await optimizedSheetsClient.updateValues(location.spreadsheetId, range, [
        [normalizeWriteValue(value)],
      ]);
    }

    fastSheetsReader.clearCache(modelName);
  }

  async upsertByCompositeKey<T extends Record<string, unknown>>(
    modelName: ModelName,
    keyColumns: readonly string[],
    rows: T[],
    options: CompositeKeyUpsertOptions = {},
  ): Promise<CompositeKeyUpsertResult> {
    if (!rows.length) {
      return { updated: 0, inserted: 0, total: 0 };
    }

    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    if (!sheetName || !columns) {
      throw new Error(`Unknown or unconfigured model: ${String(modelName)}`);
    }

    const spreadsheetIds = getSpreadsheetIdsForModel(String(modelName));
    if (spreadsheetIds.length !== 1 || !spreadsheetIds[0]) {
      throw new Error(
        `Composite key upsert requires exactly one workbook for ${String(modelName)}.`,
      );
    }

    const merge = options.merge ?? true;
    const updatedAtColumn = options.updatedAtColumn;
    const createdAtColumn = options.createdAtColumn;
    const idColumn = options.idColumn;
    const nowIso = new Date().toISOString();
    const spreadsheetId = spreadsheetIds[0];
    const rawRows = await optimizedSheetsClient.getValues(
      spreadsheetId,
      `${sheetName}!A1:ZZ`,
    );
    const header = (rawRows[0] ?? []).map((cell) => String(cell ?? "").trim());
    const headerColumns = header.length ? header : [...columns];
    const dataRows = rawRows.slice(1);
    const headerIndex = new Map<string, number>();

    headerColumns.forEach((column, index) => {
      if (column) {
        headerIndex.set(column, index);
      }
    });

    for (const keyColumn of keyColumns) {
      if (!headerIndex.has(keyColumn)) {
        throw new Error(
          `Sheet ${sheetName} is missing composite key column ${keyColumn}.`,
        );
      }
    }

    const existingByKey = new Map<
      string,
      { rowNumber: number; row: PrimitiveCellValue[] }
    >();
    let maxNumericId = 0;
    const idIndex = idColumn ? headerIndex.get(idColumn) : undefined;

    dataRows.forEach((row, rowOffset) => {
      const paddedRow = headerColumns.map((_column, index) => row[index] ?? "");
      const key = makeCompositeKey(
        rowToRecord(headerColumns, paddedRow),
        keyColumns,
      );
      if (!key) {
        return;
      }
      existingByKey.set(key, { rowNumber: rowOffset + 2, row: paddedRow });
      if (idIndex !== undefined) {
        const idValue = paddedRow[idIndex];
        const numericId = Number(String(idValue ?? "").trim());
        if (Number.isFinite(numericId) && numericId > maxNumericId) {
          maxNumericId = numericId;
        }
      }
    });

    const updates = new Map<number, PrimitiveCellValue[]>();
    const inserts: PrimitiveCellValue[][] = [];
    const incomingSeen = new Set<string>();
    let updated = 0;
    let inserted = 0;
    let nextNumericId = maxNumericId + 1;

    for (const row of rows) {
      const mutableRow: Record<string, unknown> = { ...row };
      const key = makeCompositeKey(mutableRow, keyColumns);
      if (!key) {
        throw new Error(
          `Cannot upsert ${String(modelName)} row without composite key ${keyColumns.join(", ")}.`,
        );
      }
      if (incomingSeen.has(key)) {
        continue;
      }
      incomingSeen.add(key);

      const existing = existingByKey.get(key);
      if (updatedAtColumn) {
        mutableRow[updatedAtColumn] = nowIso;
      }

      if (existing) {
        const nextRow = buildRowFromObject(
          headerColumns,
          mutableRow,
          existing.row,
          merge,
        );
        if (createdAtColumn) {
          const createdAtIndex = headerIndex.get(createdAtColumn);
          if (
            createdAtIndex !== undefined &&
            existing.row[createdAtIndex] !== undefined &&
            existing.row[createdAtIndex] !== ""
          ) {
            nextRow[createdAtIndex] = existing.row[createdAtIndex] ?? "";
          }
        }
        updates.set(existing.rowNumber - 1, nextRow);
        updated += 1;
        continue;
      }

      if (idColumn && !mutableRow[idColumn]) {
        mutableRow[idColumn] = options.generateId
          ? options.generateId()
          : String(nextNumericId++);
      }
      if (createdAtColumn && !mutableRow[createdAtColumn]) {
        mutableRow[createdAtColumn] = nowIso;
      }

      inserts.push(buildRowFromObject(headerColumns, mutableRow, null, false));
      inserted += 1;
    }

    if (updates.size > 0) {
      await optimizedSheetsClient.updateRowsByIds(
        spreadsheetId,
        sheetName,
        updates,
      );
    }

    if (inserts.length > 0) {
      await optimizedSheetsClient.appendValuesBatch(
        spreadsheetId,
        sheetName,
        inserts,
      );
    }

    fastSheetsReader.clearCache(modelName);

    return {
      updated,
      inserted,
      total: updated + inserted,
    };
  }
}

export const minimalSheetsWriter = new MinimalSheetsWriter();
