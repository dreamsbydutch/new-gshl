/**
 * Runtime-neutral Sheets transformations. Adapters own all I/O, credentials,
 * backend routing, and destructive-write policy.
 */
export type SheetCell = string | number | boolean | null;
export type SheetRow = SheetCell[];

export type HeaderCoercion = "strict" | "legacy";

export function normalizeHeaderKey({
  value,
  coercion = "strict",
}: {
  value: unknown;
  coercion?: HeaderCoercion;
}): string {
  if (coercion === "legacy")
    return String(value ?? "")
      .trim()
      .toLowerCase();
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString().trim().toLowerCase();
  }
  return "";
}

export function alignRowsToColumns({
  rawRows,
  columns,
  headerCoercion = "strict",
}: {
  rawRows: SheetRow[];
  columns: readonly string[];
  headerCoercion?: HeaderCoercion;
}): SheetRow[] {
  const header = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);
  if (!header.length)
    return dataRows.map((row) => columns.map((_, index) => row[index] ?? null));

  const headerIndex = new Map<string, number>();
  header.forEach((cell, index) => {
    const key = String(cell).trim();
    if (!key) return;
    headerIndex.set(key, index);
    const normalized = normalizeHeaderKey({
      value: key,
      coercion: headerCoercion,
    });
    if (normalized && !headerIndex.has(normalized))
      headerIndex.set(normalized, index);
  });
  return dataRows.map((row) =>
    columns.map((column) => {
      const index =
        headerIndex.get(column) ??
        headerIndex.get(
          normalizeHeaderKey({ value: column, coercion: headerCoercion }),
        );
      return index === undefined ? null : (row[index] ?? null);
    }),
  );
}

export function columnToLetter({
  columnIndex,
}: {
  columnIndex: number;
}): string {
  let current = columnIndex;
  let letter = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    current = Math.floor((current - 1) / 26);
  }
  return letter;
}

export function makeCompositeKey({
  source,
  keyColumns,
  normalizePart,
}: {
  source: Record<string, unknown>;
  keyColumns: readonly string[];
  normalizePart: (input: { column: string; value: unknown }) => string;
}): string {
  return keyColumns
    .map((column) => normalizePart({ column, value: source[column] }))
    .join("|");
}

export type CompositeKeyPlan = {
  updates: Map<number, SheetRow>;
  updateKeys: Map<number, string>;
  inserts: SheetRow[];
  rowNumbersToDelete: number[];
  duplicateRowNumbers: number[];
  updated: number;
  inserted: number;
  unchanged: number;
};

export function planCompositeKeyUpsert({
  headerColumns,
  existingRows,
  incomingRows,
  keyColumns,
  merge,
  idColumn,
  createdAtColumn,
  updatedAtColumn,
  nowIso,
  deleteMissing = false,
  deleteFilter,
  generateId,
  normalizeValue,
  normalizeKeyPart,
  headerCoercion = "strict",
  cellsMatch,
}: {
  headerColumns: readonly string[];
  existingRows: SheetRow[];
  incomingRows: Array<Record<string, unknown>>;
  keyColumns: readonly string[];
  merge: boolean;
  idColumn?: string;
  createdAtColumn?: string;
  updatedAtColumn?: string;
  nowIso: string;
  deleteMissing?: boolean;
  deleteFilter?: Record<string, unknown> | null;
  generateId?: () => string;
  normalizeValue: (input: { column: string; value: unknown }) => SheetCell;
  normalizeKeyPart: (input: { column: string; value: unknown }) => string;
  headerCoercion?: HeaderCoercion;
  cellsMatch?: (input: { left: SheetCell; right: SheetCell }) => boolean;
}): CompositeKeyPlan {
  const index = new Map(
    headerColumns.map((column, position) => [column, position]),
  );
  for (const key of keyColumns)
    if (!index.has(key))
      throw new Error(`Sheet is missing composite key column ${key}.`);
  const toRecord = (row: SheetRow): Record<string, unknown> =>
    Object.fromEntries(
      headerColumns.map((column, position) => [column, row[position] ?? ""]),
    );
  const keyFor = (row: Record<string, unknown>) =>
    makeCompositeKey({
      source: row,
      keyColumns,
      normalizePart: normalizeKeyPart,
    });
  const build = (
    item: Record<string, unknown>,
    existing: SheetRow | null,
  ): SheetRow => {
    const itemKeys = new Map(
      Object.keys(item).map((key) => [
        normalizeHeaderKey({ value: key, coercion: headerCoercion }),
        key,
      ]),
    );
    return headerColumns.map((column, position) => {
      const direct = Object.hasOwn(item, column)
        ? column
        : itemKeys.get(
            normalizeHeaderKey({ value: column, coercion: headerCoercion }),
          );
      if (direct && Object.hasOwn(item, direct))
        return normalizeValue({ column, value: item[direct] });
      return merge && existing ? (existing[position] ?? "") : "";
    });
  };
  const existingByKey = new Map<string, { rowNumber: number; row: SheetRow }>();
  const duplicates = new Set<number>();
  let maxNumericId = 0;
  const idIndex = idColumn ? index.get(idColumn) : undefined;
  existingRows.forEach((raw, offset) => {
    const row = headerColumns.map((_, position) => raw[position] ?? "");
    const key = keyFor(toRecord(row));
    if (!key) return;
    const old = existingByKey.get(key);
    if (old) duplicates.add(old.rowNumber);
    existingByKey.set(key, { rowNumber: offset + 2, row });
    if (idIndex !== undefined) {
      const number = Number(String(row[idIndex] ?? "").trim());
      if (Number.isFinite(number) && number > maxNumericId)
        maxNumericId = number;
    }
  });
  const updates = new Map<number, SheetRow>();
  const updateKeys = new Map<number, string>();
  const inserts: SheetRow[] = [];
  const seen = new Set<string>();
  let updated = 0;
  let inserted = 0;
  let unchanged = 0;
  let nextId = maxNumericId + 1;
  for (const original of incomingRows) {
    const item = { ...original };
    const key = keyFor(item);
    if (!key)
      throw new Error(
        `Cannot upsert row without composite key ${keyColumns.join(", ")}.`,
      );
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = existingByKey.get(key);
    if (existing) {
      const candidate = build(item, existing.row);
      if (
        candidate.every(
          (value, position) =>
            cellsMatch
              ? cellsMatch({ left: value, right: existing.row[position] ?? "" })
              : String(value ?? "") === String(existing.row[position] ?? ""),
        )
      ) {
        unchanged++;
        continue;
      }
      if (updatedAtColumn) {
        const position = index.get(updatedAtColumn);
        if (position !== undefined)
          candidate[position] = normalizeValue({
            column: updatedAtColumn,
            value: nowIso,
          });
      }
      if (createdAtColumn) {
        const position = index.get(createdAtColumn);
        if (position !== undefined && existing.row[position] !== "")
          candidate[position] = existing.row[position] ?? "";
      }
      updates.set(existing.rowNumber - 1, candidate);
      updateKeys.set(existing.rowNumber - 1, key);
      updated++;
      continue;
    }
    if (idColumn && !item[idColumn])
      item[idColumn] = generateId ? generateId() : String(nextId++);
    if (createdAtColumn && !item[createdAtColumn])
      item[createdAtColumn] = nowIso;
    inserts.push(build(item, null));
    inserted++;
  }
  const matchesFilter = (record: Record<string, unknown>) =>
    !deleteFilter ||
    Object.entries(deleteFilter).every(
      ([column, value]) =>
        normalizeKeyPart({ column, value: record[column] }) ===
        normalizeKeyPart({ column, value }),
    );
  const rowNumbersToDelete = deleteMissing
    ? existingRows.flatMap((raw, offset) => {
        const key = keyFor(
          toRecord(headerColumns.map((_, position) => raw[position] ?? "")),
        );
        return matchesFilter(toRecord(raw)) && !seen.has(key)
          ? [offset + 2]
          : [];
      })
    : [];
  return {
    updates,
    updateKeys,
    inserts,
    rowNumbersToDelete,
    duplicateRowNumbers: [...duplicates],
    updated,
    inserted,
    unchanged,
  };
}
