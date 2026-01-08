import { fastSheetsReader, type SheetsModelName } from "@gshl-sheets";

type AnyRow = Record<string, unknown>;

export type BaseQueryInput = {
  where?: Record<string, unknown> | undefined;
  orderBy?: Record<string, "asc" | "desc"> | undefined;
  take?: number | undefined;
  skip?: number | undefined;
};

function toComparable(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    // numeric strings should compare as numbers when both sides are numeric-ish
    const asNum = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(asNum)) return asNum;
    return trimmed;
  }
  return JSON.stringify(value);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const a = toComparable(left);
  const b = toComparable(right);
  if (a === null || b === null) return a === b;

  // If one side is number and other is string-number, toComparable normalized.
  return a === b;
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  const left = toComparable(a);
  const right = toComparable(b);

  // Nulls last
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const sign = dir === "asc" ? 1 : -1;

  if (typeof left === "number" && typeof right === "number") {
    return sign * (left - right);
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return sign * (Number(left) - Number(right));
  }

  return sign * String(left).localeCompare(String(right));
}

function applyWhere<T>(rows: T[], where?: Record<string, unknown>): T[] {
  if (!where) return rows;
  const entries = Object.entries(where).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return rows;

  return rows.filter((row) => {
    const record = row as unknown as AnyRow;
    for (const [key, expected] of entries) {
      if (!valuesEqual(record[key], expected)) return false;
    }
    return true;
  });
}

function applyOrderBy<T>(
  rows: T[],
  orderBy?: Record<string, "asc" | "desc">,
): T[] {
  if (!orderBy) return rows;
  const entries = Object.entries(orderBy);
  if (entries.length === 0) return rows;

  return rows.slice().sort((a, b) => {
    const left = a as unknown as AnyRow;
    const right = b as unknown as AnyRow;
    for (const [field, dir] of entries) {
      const cmp = compareValues(left[field], right[field], dir);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function applyPagination<T>(rows: T[], skip?: number, take?: number): T[] {
  const start = skip ?? 0;
  if (take === undefined) return rows.slice(start);
  return rows.slice(start, start + take);
}

export async function getMany<T>(
  model: SheetsModelName,
  input: BaseQueryInput = {},
): Promise<T[]> {
  const all = (await fastSheetsReader.fetchModel(model)) as unknown as T[];
  const filtered = applyWhere(all, input.where);
  const ordered = applyOrderBy(filtered, input.orderBy);
  return applyPagination(ordered, input.skip, input.take);
}

export async function getFirst<T>(
  model: SheetsModelName,
  input: BaseQueryInput = {},
): Promise<T | null> {
  const rows = await getMany<T>(model, { ...input, take: 1 });
  return rows[0] ?? null;
}

export async function getById<T>(
  model: SheetsModelName,
  id: string,
): Promise<T | null> {
  return getFirst<T>(model, { where: { id } });
}

export async function getCount(
  model: SheetsModelName,
  input: Pick<BaseQueryInput, "where"> = {},
): Promise<number> {
  const all = (await fastSheetsReader.fetchModel(model)) as unknown as Record<
    string,
    unknown
  >[];
  return applyWhere(all, input.where).length;
}
