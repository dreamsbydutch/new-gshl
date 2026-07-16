import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { env } from "@gshl-env";
import {
  CONVEX_TABLE_TO_MODEL,
  getConvexTableName,
  MODEL_TO_CONVEX_TABLE,
  type ModelName,
} from "./model-map";

type AnyRow = Record<string, unknown>;

export type BaseQueryInput = {
  where?: Record<string, unknown> | undefined;
  orderBy?: Record<string, "asc" | "desc"> | undefined;
  take?: number | undefined;
  skip?: number | undefined;
};

type UpsertOptions = {
  merge?: boolean;
  updatedAtColumn?: string;
  createdAtColumn?: string;
  idColumn?: string;
  generateId?: () => string;
  spreadsheetId?: string;
  deleteMissing?: boolean | { filter?: Record<string, unknown> };
  diagnostics?: boolean | { maxSamples?: number; maxFieldsPerSample?: number };
};

type UpsertResult = {
  updated: number;
  inserted: number;
  deleted: number;
  duplicateDeletes: number;
  unchanged: number;
  total: number;
  diagnostics?: {
    changedColumns: Array<{ column: string; count: number }>;
    sampleUpdates: unknown[];
  };
};

const refs = {
  list: makeFunctionReference<"query", Record<string, unknown>, AnyRow[]>(
    "data:list",
  ),
  byId: makeFunctionReference<"query", Record<string, unknown>, AnyRow | null>(
    "data:byId",
  ),
  count: makeFunctionReference<"query", Record<string, unknown>, number>(
    "data:count",
  ),
  snapshot: makeFunctionReference<
    "query",
    Record<string, unknown>,
    Record<string, AnyRow[]>
  >("data:snapshot"),
  updateById: makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    AnyRow
  >("data:updateById"),
  upsertByCompositeKey: makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    UpsertResult
  >("data:upsertByCompositeKey"),
};

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  const url = env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "GSHL_DATA_BACKEND=convex requires NEXT_PUBLIC_CONVEX_URL to be set.",
    );
  }

  client ??= new ConvexHttpClient(url);
  return client;
}

function hydrateRow<T>(row: AnyRow): T {
  const hydrated: AnyRow = { ...row };
  for (const [key, value] of Object.entries(hydrated)) {
    if (
      key.endsWith("At") &&
      typeof value === "string" &&
      value.trim() !== ""
    ) {
      const date = new Date(value);
      hydrated[key] = Number.isNaN(date.getTime()) ? value : date;
    }
  }
  return hydrated as T;
}

export async function getMany<T>(
  model: ModelName,
  input: BaseQueryInput = {},
): Promise<T[]> {
  const rows = await getClient().query(refs.list, {
    table: getConvexTableName(model),
    ...input,
  });
  return rows.map(hydrateRow<T>);
}

export async function getFirst<T>(
  model: ModelName,
  input: BaseQueryInput = {},
): Promise<T | null> {
  const rows = await getMany<T>(model, { ...input, take: 1 });
  return rows[0] ?? null;
}

export async function getById<T>(
  model: ModelName,
  id: string,
): Promise<T | null> {
  const row = await getClient().query(refs.byId, {
    table: getConvexTableName(model),
    id,
  });
  return row ? hydrateRow<T>(row) : null;
}

export async function getCount(
  model: ModelName,
  input: Pick<BaseQueryInput, "where"> = {},
): Promise<number> {
  return getClient().query(refs.count, {
    table: getConvexTableName(model),
    where: input.where,
  });
}

export async function fetchSnapshot<M extends readonly ModelName[]>(
  models: M,
): Promise<Record<M[number], AnyRow[]>> {
  const tables = models.map(getConvexTableName);
  const snapshot = await getClient().query(refs.snapshot, { tables });
  const output: Partial<Record<ModelName, AnyRow[]>> = {};

  for (const [table, rows] of Object.entries(snapshot)) {
    const model = CONVEX_TABLE_TO_MODEL[table];
    if (!model) continue;
    output[model] = rows.map((row) => hydrateRow<AnyRow>(row));
  }

  return output as Record<M[number], AnyRow[]>;
}

export async function updateById<T extends Record<string, unknown>>(
  model: ModelName,
  id: string,
  data: Partial<T>,
): Promise<void> {
  await getClient().mutation(refs.updateById, {
    table: getConvexTableName(model),
    id,
    data,
  });
}

export async function upsertByCompositeKey<T extends Record<string, unknown>>(
  model: ModelName,
  keyColumns: readonly string[],
  rows: T[],
  options: UpsertOptions = {},
): Promise<UpsertResult> {
  return getClient().mutation(refs.upsertByCompositeKey, {
    table: getConvexTableName(model),
    keyColumns: [...keyColumns],
    rows,
    merge: options.merge,
    deleteMissing: options.deleteMissing,
  });
}

export const convexDataStore = {
  models: MODEL_TO_CONVEX_TABLE,
  getMany,
  getFirst,
  getById,
  getCount,
  fetchSnapshot,
  updateById,
  upsertByCompositeKey,
};
