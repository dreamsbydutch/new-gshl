import { optimizedSheetsClient } from "../client/optimized-client";
import { MODEL_TO_WORKBOOK, SHEETS_CONFIG, WORKBOOKS } from "../config/config";

type PrimitiveCellValue = string | number | boolean | null;

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
  return JSON.stringify(value);
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
  const workbookKey = MODEL_TO_WORKBOOK[modelName];
  if (!workbookKey) {
    throw new Error(`No workbook mapping for model: ${String(modelName)}`);
  }

  const spreadsheetId = WORKBOOKS[workbookKey as keyof typeof WORKBOOKS];
  const columns = SHEETS_CONFIG.COLUMNS[modelName];

  if (!sheetName || !spreadsheetId || !columns) {
    throw new Error(`Unknown or unconfigured model: ${String(modelName)}`);
  }

  const idColumnIndex = columns.indexOf("id");
  if (idColumnIndex < 0) {
    throw new Error(`Model ${String(modelName)} has no 'id' column mapping`);
  }

  const idColLetter = columnToLetter(idColumnIndex + 1);
  const idColumnRange = `${sheetName}!${idColLetter}2:${idColLetter}`;
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

  return null;
}

export class MinimalSheetsWriter {
  async updateById<T extends Record<string, unknown>>(
    modelName: keyof typeof SHEETS_CONFIG.SHEETS,
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
  }
}

export const minimalSheetsWriter = new MinimalSheetsWriter();
