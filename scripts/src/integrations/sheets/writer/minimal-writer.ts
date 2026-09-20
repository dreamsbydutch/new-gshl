import { optimizedSheetsClient } from "../client/optimized-client";
import {
  columnToLetter,
  planCompositeKeyUpsert,
} from "../../../../../shared/sheets-core/index";
import {
  getSpreadsheetIdsForModel,
  serializeCsvMultiValue,
  SHEETS_CONFIG,
} from "../config/config";
import { fastSheetsReader } from "../reader/fast-reader";
import { normalizeDateOnlyValue } from "../../../utils/date";
import { env } from "@gshl-env";
import * as convexStore from "@gshl-lib/data/convex-store";

type PrimitiveCellValue = string | number | boolean | null;
type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

type CompositeKeyUpsertOptions = {
  merge?: boolean;
  updatedAtColumn?: string;
  createdAtColumn?: string;
  idColumn?: string;
  generateId?: () => string;
  spreadsheetId?: string;
  deleteMissing?: boolean | { filter?: Record<string, unknown> };
  diagnostics?:
    | boolean
    | {
        maxSamples?: number;
        maxFieldsPerSample?: number;
      };
};

type CompositeKeyDiffSample = {
  key: string;
  rowNumber: number;
  changedFields: Array<{
    column: string;
    previousValue: string;
    nextValue: string;
  }>;
};

type CompositeKeyUpsertResult = {
  updated: number;
  inserted: number;
  deleted: number;
  duplicateDeletes: number;
  unchanged: number;
  total: number;
  diagnostics?: {
    changedColumns: Array<{ column: string; count: number }>;
    sampleUpdates: CompositeKeyDiffSample[];
  };
};

function stringifyPrimitive(value: string | number | boolean): string {
  return typeof value === "string" ? value : String(value);
}

function isDateOnlyColumn(column: string): boolean {
  return column === "date" || column.endsWith("Date") || column === "birthday";
}

function isCsvMultiValueColumn(column: string): boolean {
  return (
    column === "nhlPos" || column === "nhlTeam" || column === "gshlTeamIds"
  );
}

function normalizeWriteValue(
  column: string,
  value: unknown,
): PrimitiveCellValue {
  if (value === null || value === undefined) return "";
  if (isCsvMultiValueColumn(column)) {
    return serializeCsvMultiValue(value);
  }
  if (isDateOnlyColumn(column)) {
    return normalizeDateOnlyValue(value) ?? "";
  }
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

function normalizeCompositeKeyPart(column: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (isDateOnlyColumn(column)) {
    return normalizeDateOnlyValue(value) ?? "";
  }
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

function normalizeComparableCellValue(value: PrimitiveCellValue): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value).trim();
}

function getChangedFields(
  header: readonly string[],
  left: readonly PrimitiveCellValue[],
  right: readonly PrimitiveCellValue[],
): CompositeKeyDiffSample["changedFields"] {
  const maxLength = Math.max(header.length, left.length, right.length);
  const changedFields: CompositeKeyDiffSample["changedFields"] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const previousValue = normalizeComparableCellValue(left[index] ?? "");
    const nextValue = normalizeComparableCellValue(right[index] ?? "");
    if (previousValue === nextValue) {
      continue;
    }
    changedFields.push({
      column: header[index] ?? String(index),
      previousValue,
      nextValue,
    });
  }

  return changedFields;
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

  const idColLetter = columnToLetter({ columnIndex: idColumnIndex + 1 });
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
    if (env.GSHL_DATA_BACKEND === "convex") {
      await convexStore.updateById(modelName, id, data);
      return;
    }

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
      const colLetter = columnToLetter({ columnIndex: colIndex + 1 });
      const range = `${location.sheetName}!${colLetter}${location.rowNumber}`;

      await optimizedSheetsClient.updateValues(location.spreadsheetId, range, [
        [normalizeWriteValue(key, value)],
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
    if (env.GSHL_DATA_BACKEND === "convex") {
      return convexStore.upsertByCompositeKey(
        modelName,
        keyColumns,
        rows,
        options,
      ) as Promise<CompositeKeyUpsertResult>;
    }

    const sheetName = SHEETS_CONFIG.SHEETS[modelName];
    const columns = SHEETS_CONFIG.COLUMNS[modelName];
    if (!sheetName || !columns) {
      throw new Error(`Unknown or unconfigured model: ${String(modelName)}`);
    }

    const spreadsheetIds = options.spreadsheetId
      ? [options.spreadsheetId]
      : getSpreadsheetIdsForModel(String(modelName));
    if (spreadsheetIds.length !== 1 || !spreadsheetIds[0]) {
      throw new Error(
        `Composite key upsert requires exactly one workbook for ${String(modelName)}.`,
      );
    }

    const deleteMissing = options.deleteMissing ?? null;
    const diagnosticsOptions =
      options.diagnostics && typeof options.diagnostics === "object"
        ? options.diagnostics
        : null;
    const captureDiagnostics =
      options.diagnostics !== undefined && options.diagnostics !== false;
    const maxDiffSamples = diagnosticsOptions?.maxSamples ?? 5;
    const maxFieldsPerSample = diagnosticsOptions?.maxFieldsPerSample ?? 8;
    const nowIso = new Date().toISOString();
    const spreadsheetId = spreadsheetIds[0];
    const rawRows = await optimizedSheetsClient.getValues(
      spreadsheetId,
      `${sheetName}!A1:ZZ`,
    );
    const header = (rawRows[0] ?? []).map((cell) => String(cell ?? "").trim());
    const headerColumns = header.length ? header : [...columns];
    const dataRows = rawRows.slice(1);
    const plan = planCompositeKeyUpsert({
      headerColumns,
      existingRows: dataRows,
      incomingRows: rows,
      keyColumns,
      merge: options.merge ?? true,
      idColumn: options.idColumn,
      createdAtColumn: options.createdAtColumn,
      updatedAtColumn: options.updatedAtColumn,
      nowIso,
      deleteMissing: Boolean(deleteMissing),
      deleteFilter:
        deleteMissing && typeof deleteMissing === "object"
          ? (deleteMissing.filter ?? null)
          : null,
      generateId: options.generateId,
      headerCoercion: "legacy",
      normalizeValue: ({ column, value }) => normalizeWriteValue(column, value),
      normalizeKeyPart: ({ column, value }) =>
        normalizeCompositeKeyPart(column, value),
      cellsMatch: ({ left, right }) =>
        normalizeComparableCellValue(left) === normalizeComparableCellValue(right),
    });
    const changedColumnCounts = new Map<string, number>();
    const sampleUpdates: CompositeKeyDiffSample[] = [];
    if (captureDiagnostics)
      for (const [rowIndex, nextRow] of plan.updates) {
        const existingRow = dataRows[rowIndex - 1] ?? [];
        const changedFields = getChangedFields(headerColumns, existingRow, nextRow)
          .filter((field) => field.column !== options.updatedAtColumn);
        for (const changedField of changedFields)
          changedColumnCounts.set(
            changedField.column,
            (changedColumnCounts.get(changedField.column) ?? 0) + 1,
          );
        if (sampleUpdates.length < maxDiffSamples)
          sampleUpdates.push({
            key: plan.updateKeys.get(rowIndex) ?? String(rowIndex),
            rowNumber: rowIndex + 1,
            changedFields: changedFields.slice(0, maxFieldsPerSample),
          });
      }

    if (plan.updates.size > 0) {
      await optimizedSheetsClient.updateRowsByIds(
        spreadsheetId,
        sheetName,
        plan.updates,
      );
    }

    if (plan.inserts.length > 0) {
      await optimizedSheetsClient.appendValuesBatch(
        spreadsheetId,
        sheetName,
        plan.inserts,
      );
    }

    if (plan.rowNumbersToDelete.length > 0) {
      await optimizedSheetsClient.deleteRows(
        spreadsheetId,
        sheetName,
        plan.rowNumbersToDelete,
      );
    }

    if (plan.duplicateRowNumbers.length > 0) {
      await optimizedSheetsClient.deleteRows(
        spreadsheetId,
        sheetName,
        plan.duplicateRowNumbers,
      );
    }

    fastSheetsReader.clearCache(modelName);

    return {
      updated: plan.updated,
      inserted: plan.inserted,
      deleted: plan.rowNumbersToDelete.length,
      duplicateDeletes: plan.duplicateRowNumbers.length,
      unchanged: plan.unchanged,
      total: plan.updated + plan.inserted,
      diagnostics: captureDiagnostics
        ? {
            changedColumns: Array.from(changedColumnCounts.entries())
              .map(([column, count]) => ({ column, count }))
              .sort((left, right) => right.count - left.count),
            sampleUpdates,
          }
        : undefined,
    };
  }
}

export const minimalSheetsWriter = new MinimalSheetsWriter();
