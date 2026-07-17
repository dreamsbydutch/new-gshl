import { convexToJson, jsonToConvex } from "convex/values";
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

function convexUrl(): string {
  return (env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(
    /\/$/,
    "",
  );
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

function summarizeArgs(args: Record<string, unknown>): string {
  const summary = { ...args };
  if ("serverSecret" in summary) summary.serverSecret = "[REDACTED]";
  if (Array.isArray(summary.rows)) {
    summary.rows = `[${summary.rows.length} rows]`;
  }

  const serialized = JSON.stringify(summary);
  return serialized.length > 1_000
    ? `${serialized.slice(0, 1_000)}...`
    : serialized;
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
      `Convex ${operation} failed for ${model} (${getConvexTableName(model)}) at ${convexHost()} with args ${summarizeArgs(args)}: ${describeUnknownError(error)}`,
      { cause: error },
    );
  }
}

function getConvexUrl(): string {
  const url = convexUrl();
  if (!url) {
    throw new Error(
      "GSHL_DATA_BACKEND=convex requires CONVEX_URL or NEXT_PUBLIC_CONVEX_URL to be set.",
    );
  }

  return url;
}

export async function callConvex<T>(
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const url = getConvexUrl();
  const response = await fetch(`${url}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Convex-Client": "gshl-server",
    },
    body: JSON.stringify({
      path,
      format: "convex_encoded_json",
      args: [
        convexToJson({
          ...args,
          serverSecret: env.CONVEX_SERVER_SECRET ?? "",
        }),
      ],
    }),
  });

  const responseText = await response.text();
  if (!response.ok && response.status !== 560) {
    throw new Error(`HTTP ${response.status}: ${responseText}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Invalid JSON response: ${responseText}`, {
      cause: error,
    });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("status" in payload)
  ) {
    throw new Error(`Invalid Convex response: ${responseText}`);
  }

  if (payload.status === "success" && "value" in payload) {
    return jsonToConvex(payload.value as never) as T;
  }

  if (payload.status === "error") {
    const errorMessage =
      "errorMessage" in payload && typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : "";
    throw new Error(
      errorMessage ||
        `Convex returned error response: ${JSON.stringify(payload)}`,
    );
  }

  throw new Error(`Unexpected Convex response: ${responseText}`);
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
    callConvex<AnyRow[]>("query", "data:list", args),
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
    callConvex<AnyRow | null>("query", "data:byId", args),
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
    callConvex<number>("query", "data:count", args),
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
    () => callConvex<Record<string, AnyRow[]>>("query", "data:snapshot", args),
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
    callConvex<AnyRow>("mutation", "data:updateById", args),
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
    callConvex<UpsertResult>("mutation", "data:upsertByCompositeKey", args),
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
