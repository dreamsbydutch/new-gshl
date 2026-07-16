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

function convexUrl(): string {
  return env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL ?? "";
}

function convexHost(): string {
  const url = convexUrl();
  if (!url) return "unset";
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || String(error);
    const cause =
      error.cause === undefined ? "" : ` cause=${describeUnknownError(error.cause)}`;
    return `${error.name}: ${message}${cause}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function runConvex<T>(
  operation: string,
  model: ModelName,
  args: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new Error(
      `Convex ${operation} failed for ${model} (${getConvexTableName(model)}) at ${convexHost()} with args ${JSON.stringify(args)}: ${describeUnknownError(error)}`,
      { cause: error },
    );
  }
}

function getClient(): ConvexHttpClient {
  const url = convexUrl();
  if (!url) {
    throw new Error(
      "GSHL_DATA_BACKEND=convex requires CONVEX_URL or NEXT_PUBLIC_CONVEX_URL to be set.",
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
  const args = { table: getConvexTableName(model), ...input };
  const rows = await runConvex("query data:list", model, args, () =>
    getClient().query(refs.list, args),
  );
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
  const args = { table: getConvexTableName(model), id };
  const row = await runConvex("query data:byId", model, args, () =>
    getClient().query(refs.byId, args),
  );
  return row ? hydrateRow<T>(row) : null;
}

export async function getCount(
  model: ModelName,
  input: Pick<BaseQueryInput, "where"> = {},
): Promise<number> {
  const args = {
    table: getConvexTableName(model),
    where: input.where,
  };
  return runConvex("query data:count", model, args, () =>
    getClient().query(refs.count, args),
  );
}

export async function fetchSnapshot<M extends readonly ModelName[]>(
  models: M,
): Promise<Record<M[number], AnyRow[]>> {
  if (models.length === 0) {
    return {} as Record<M[number], AnyRow[]>;
  }

  const tables = models.map(getConvexTableName);
  const args = { tables };
  const snapshot = await runConvex(
    "query data:snapshot",
    models[0]!,
    args,
    () => getClient().query(refs.snapshot, args),
  );
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
  const args = {
    table: getConvexTableName(model),
    id,
    data,
  };
  await runConvex("mutation data:updateById", model, args, () =>
    getClient().mutation(refs.updateById, args),
  );
}

export async function upsertByCompositeKey<T extends Record<string, unknown>>(
  model: ModelName,
  keyColumns: readonly string[],
  rows: T[],
  options: UpsertOptions = {},
): Promise<UpsertResult> {
  const args = {
    table: getConvexTableName(model),
    keyColumns: [...keyColumns],
    rows,
    merge: options.merge,
    deleteMissing: options.deleteMissing,
  };
  return runConvex("mutation data:upsertByCompositeKey", model, args, () =>
    getClient().mutation(refs.upsertByCompositeKey, args),
  );
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
