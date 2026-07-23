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
  playerDayBackfillPage: makeFunctionReference<
    "query",
    Record<string, unknown>,
    { items: AnyRow[]; nextCursor: string | null; hasMore: boolean }
  >("yahooBackfill:listPlayerDayRows"),
  maintenanceWeekPage: makeFunctionReference<
    "query",
    Record<string, unknown>,
    { items: AnyRow[]; nextCursor: string | null; hasMore: boolean }
  >("maintenanceScope:listWeekRows"),
  maintenanceSeasonPage: makeFunctionReference<
    "query",
    Record<string, unknown>,
    { items: AnyRow[]; nextCursor: string | null; hasMore: boolean }
  >("maintenanceScope:listSeasonRows"),
  maintenanceAggregatePage: makeFunctionReference<
    "query",
    Record<string, unknown>,
    { items: AnyRow[]; nextCursor: string | null; hasMore: boolean }
  >("maintenanceScope:listAggregateRows"),
  maintenanceAggregateUpsert: makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    { updated: number; inserted: number }
  >("maintenanceScope:upsertAggregateRows"),
  maintenanceAggregateDelete: makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    { deleted: number }
  >("maintenanceScope:deleteAggregateRows"),
  maintenancePatchRows: makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    { updated: number }
  >("maintenanceScope:patchRowsById"),
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

function serverArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (!env.CONVEX_SERVER_SECRET) {
    throw new Error("CONVEX_SERVER_SECRET is required for Convex scripts.");
  }
  return { ...args, serverSecret: env.CONVEX_SERVER_SECRET };
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
  const rows = await getClient().query(
    refs.list,
    serverArgs({
      table: getConvexTableName(model),
    }),
  );
  return rows.map(hydrateRow<T>);
}

export async function fetchPlayerDaySeason<T extends AnyRow>(
  seasonId: string | number,
): Promise<T[]> {
  const rows = await getClient().query(
    refs.list,
    serverArgs({
      table: getConvexTableName("PlayerDayStatLine"),
      where: { seasonId: String(seasonId) },
    }),
  );
  return rows.map(hydrateRow<T>);
}

export async function fetchPlayerDayWeeks<T extends AnyRow>(
  seasonId: string | number,
  weekIds: readonly string[],
  teamIds: readonly string[] = [],
): Promise<T[]> {
  const rows: T[] = [];
  for (const weekId of new Set(weekIds)) {
    const teamScopes =
      teamIds.length > 0 ? Array.from(new Set(teamIds)) : [null];
    for (const gshlTeamId of teamScopes) {
      let cursor: string | null = null;
      do {
        const args: Record<string, unknown> = {
          seasonId: String(seasonId),
          weekId,
          cursor,
        };
        if (gshlTeamId) args.gshlTeamId = gshlTeamId;
        const page = await getClient().query(
          refs.playerDayBackfillPage,
          serverArgs(args),
        );
        rows.push(...page.items.map(hydrateRow<T>));
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor);
    }
  }
  return rows;
}

export async function fetchWeekScopedModel<T extends AnyRow>(
  model: Extract<
    ModelName,
    | "PlayerDayStatLine"
    | "PlayerWeekStatLine"
    | "TeamDayStatLine"
    | "TeamWeekStatLine"
  >,
  seasonId: string,
  weekIds: readonly string[],
  teamIds: readonly string[] = [],
): Promise<T[]> {
  const rows: T[] = [];
  for (const weekId of new Set(weekIds)) {
    const teamScopes =
      teamIds.length > 0 ? Array.from(new Set(teamIds)) : [null];
    for (const gshlTeamId of teamScopes) {
      let cursor: string | null = null;
      do {
        const args: Record<string, unknown> = { seasonId, weekId, cursor };
        if (gshlTeamId) args.gshlTeamId = gshlTeamId;
        const page = await getClient().query(
          refs.maintenanceWeekPage,
          serverArgs({
            ...args,
            table: getConvexTableName(model),
          }),
        );
        rows.push(...page.items.map(hydrateRow<T>));
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor);
    }
  }
  return rows;
}

export async function fetchPlayerNhlSeason<T extends AnyRow>(
  seasonId: string,
): Promise<T[]> {
  return fetchSeasonModel<T>("PlayerNHLStatLine", seasonId);
}

export type SeasonScopedModelName = Extract<
  ModelName,
  | "Week"
  | "Team"
  | "Matchup"
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerNHLStatLine"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine"
>;

export async function fetchSeasonModel<T extends AnyRow>(
  model: SeasonScopedModelName,
  seasonId: string,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  try {
    do {
      const page: {
        items: AnyRow[];
        nextCursor: string | null;
        hasMore: boolean;
      } = await getClient().query(
        refs.maintenanceSeasonPage,
        serverArgs({
          table: getConvexTableName(model),
          seasonId,
          cursor,
        }),
      );
      rows.push(...page.items.map(hydrateRow<T>));
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor);
  } catch (error) {
    throw new Error(
      `[production-convex] maintenanceScope:listSeasonRows failed for ${model}, season ${seasonId}. Run "npx convex deploy" if the maintenance functions changed. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return rows;
}

export type AggregateModelName = Extract<
  ModelName,
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerCareerSplitStatLine"
  | "PlayerCareerTotalStatLine"
  | "PlayerNHLStatLine"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine"
>;

export async function fetchAggregateRows<T extends AnyRow>(
  model: AggregateModelName,
  seasonId?: string,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const args: Record<string, unknown> = {
      table: getConvexTableName(model),
      cursor,
    };
    if (seasonId) args.seasonId = seasonId;
    const page: {
      items: AnyRow[];
      nextCursor: string | null;
      hasMore: boolean;
    } = await getClient().query(
      refs.maintenanceAggregatePage,
      serverArgs(args),
    );
    rows.push(...page.items.map(hydrateRow<T>));
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  return rows;
}

export async function upsertAggregateRows<T extends AnyRow>(
  model: AggregateModelName,
  rows: readonly T[],
): Promise<{ updated: number; inserted: number }> {
  try {
    return await getClient().mutation(
      refs.maintenanceAggregateUpsert,
      serverArgs({
        table: getConvexTableName(model),
        rows: rows.map((row) => compactRecord(row)),
      }),
    );
  } catch (error) {
    const errorData =
      typeof error === "object" && error !== null && "data" in error
        ? JSON.stringify((error as { data: unknown }).data)
        : null;
    const message =
      errorData ?? (error instanceof Error ? error.message : String(error));
    throw new Error(
      `[production-convex] maintenanceScope:upsertAggregateRows failed for ${model} (${rows.length} row(s)): ${message}`,
      { cause: error },
    );
  }
}

export async function verifyAggregateMaintenanceFunctions(
  seasonId: string,
): Promise<void> {
  try {
    await Promise.all([
      upsertAggregateRows("PlayerDayStatLine", []),
      fetchSeasonModel("Week", seasonId),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[stats:aggregate-season] Production Convex does not have the required aggregate maintenance functions available. Run "npx convex deploy" from the repository root, then retry. Preflight error: ${message}`,
      { cause: error },
    );
  }
}

export async function deleteAggregateRows(
  model: AggregateModelName,
  ids: readonly string[],
): Promise<{ deleted: number }> {
  return getClient().mutation(
    refs.maintenanceAggregateDelete,
    serverArgs({ table: getConvexTableName(model), ids }),
  );
}

export type MaintenancePatchModelName = Extract<
  ModelName,
  "Matchup" | "TeamDayStatLine" | "TeamWeekStatLine" | "TeamSeasonStatLine"
>;

export async function updateRowsById(
  model: MaintenancePatchModelName,
  rows: ReadonlyArray<{ id: string; data: AnyRow }>,
): Promise<number> {
  let updated = 0;
  for (let offset = 0; offset < rows.length; offset += 25) {
    const batch = rows.slice(offset, offset + 25).map((row) => ({
      id: row.id,
      data: compactRecord(row.data),
    }));
    const result = await getClient().mutation(
      refs.maintenancePatchRows,
      serverArgs({ table: getConvexTableName(model), rows: batch }),
    );
    updated += result.updated;
  }
  return updated;
}

export async function fetchSnapshot<M extends readonly ModelName[]>(
  models: M,
): Promise<Record<M[number], AnyRow[]>> {
  const snapshot = await getClient().query(
    refs.snapshot,
    serverArgs({
      tables: models.map(getConvexTableName),
    }),
  );
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
  await getClient().mutation(
    refs.updateById,
    serverArgs({
      table: getConvexTableName(model),
      id,
      data: compactRecord(data),
    }),
  );
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
  return getClient().mutation(refs.upsertByCompositeKey, serverArgs(args));
}
