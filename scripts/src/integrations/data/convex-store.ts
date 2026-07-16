import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { env } from "@gshl-env";
import {
  CONVEX_TABLE_TO_MODEL,
  getConvexTableName,
  type ModelName,
} from "./model-map";

type AnyRow = Record<string, unknown>;

type BaseQueryInput = {
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

export async function fetchModel<T extends AnyRow>(
  model: ModelName,
): Promise<T[]> {
  const rows = await getClient().query(refs.list, {
    table: getConvexTableName(model),
  });
  return rows.map(hydrateRow<T>);
}

export async function fetchPlayerDaySeason<T extends AnyRow>(
  seasonId: string | number,
): Promise<T[]> {
  const rows = await getClient().query(refs.list, {
    table: getConvexTableName("PlayerDayStatLine"),
    where: { seasonId: String(seasonId) },
  } satisfies BaseQueryInput & { table: string });
  return rows.map(hydrateRow<T>);
}

export async function fetchSnapshot<M extends readonly ModelName[]>(
  models: M,
): Promise<Record<M[number], AnyRow[]>> {
  const snapshot = await getClient().query(refs.snapshot, {
    tables: models.map(getConvexTableName),
  });
  const output: Partial<Record<ModelName, AnyRow[]>> = {};
  for (const [table, rows] of Object.entries(snapshot)) {
    const model = CONVEX_TABLE_TO_MODEL[table];
    if (!model) continue;
    output[model] = (rows as AnyRow[]).map((row) => hydrateRow<AnyRow>(row));
  }
  return output as Record<M[number], AnyRow[]>;
}

export async function updateById<T extends AnyRow>(
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

export async function upsertByCompositeKey<T extends AnyRow>(
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
