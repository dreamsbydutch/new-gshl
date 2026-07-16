import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { env } from "@gshl-env";
import {
  CONVEX_TABLE_TO_MODEL,
  getConvexTableName,
  type ModelName,
} from "./model-map";

type AnyRow = Record<string, unknown>;

export type UpsertOptions = {
  merge?: boolean;
  updatedAtColumn?: string;
  createdAtColumn?: string;
  idColumn?: string;
  generateId?: () => string;
  spreadsheetId?: string;
  deleteMissing?: boolean | { filter?: Record<string, unknown> };
  diagnostics?: boolean | { maxSamples?: number; maxFieldsPerSample?: number };
};

export type UpsertResult = {
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

function productionUrlFromDeployment(): string | null {
  const deployment =
    env.CONVEX_DEPLOYMENT?.trim() ||
    env.CONVEX_DEPLOY_KEY?.split("|", 1)[0]?.trim();
  if (!deployment?.startsWith("prod:")) return null;
  const deploymentName = deployment.slice("prod:".length).trim();
  return deploymentName ? `https://${deploymentName}.convex.cloud` : null;
}

function resolveConvexUrl(): string {
  if (env.GSHL_CONVEX_TARGET === "production") {
    const url = env.CONVEX_PROD_URL ?? productionUrlFromDeployment();
    if (!url) {
      throw new Error(
        "Production-backed scripts require CONVEX_PROD_URL, a prod: CONVEX_DEPLOYMENT, or a production CONVEX_DEPLOY_KEY. Refusing to fall back to a development deployment.",
      );
    }
    return url;
  }

  const url = env.NEXT_PUBLIC_CONVEX_URL ?? env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "Non-production Convex scripts require NEXT_PUBLIC_CONVEX_URL or CONVEX_URL.",
    );
  }
  return url;
}

function getClient(): ConvexHttpClient {
  client ??= new ConvexHttpClient(resolveConvexUrl());
  return client;
}

function hydrateRow<T>(row: AnyRow): T {
  const hydrated: AnyRow = { ...row };
  for (const [key, value] of Object.entries(hydrated)) {
    if (key.endsWith("At") && typeof value === "string" && value.trim()) {
      const date = new Date(value);
      hydrated[key] = Number.isNaN(date.getTime()) ? value : date;
    }
  }
  return hydrated as T;
}

function toConvexValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toConvexValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, toConvexValue(entry)]],
      ),
    );
  }
  return value;
}

function compactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return toConvexValue(record) as Record<string, unknown>;
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
  });
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
    if (model) output[model] = rows.map(hydrateRow<AnyRow>);
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
    data: compactRecord(data),
  });
}

export async function upsertByCompositeKey<T extends AnyRow>(
  model: ModelName,
  keyColumns: readonly string[],
  rows: T[],
  options: UpsertOptions = {},
): Promise<UpsertResult> {
  const args: Record<string, unknown> = {
    table: getConvexTableName(model),
    keyColumns: [...keyColumns],
    rows: rows.map(compactRecord),
  };
  if (options.merge !== undefined) args.merge = options.merge;
  if (options.deleteMissing !== undefined) {
    args.deleteMissing = toConvexValue(options.deleteMissing);
  }
  return getClient().mutation(refs.upsertByCompositeKey, args);
}
