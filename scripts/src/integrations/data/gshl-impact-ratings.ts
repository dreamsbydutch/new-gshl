import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { capturedCli } from "./production-operator-cli";

export const GSHL_IMPACT_VERSION = "gshl-category-impact-v3";
export const GSHL_IMPACT_TABLES = [
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
] as const;
export type GshlImpactTable = (typeof GSHL_IMPACT_TABLES)[number];
export type GshlImpactNext = {
  Rating: number;
  averageRating: number;
  ratingVersion: typeof GSHL_IMPACT_VERSION;
  ratingAppearances: number;
};
export type GshlImpactApplyRow = {
  id: string;
  expected: Record<string, unknown>;
  next: GshlImpactNext;
};
export type GshlImpactFieldState =
  | { present: false }
  | { present: true; value: unknown };
export type GshlImpactRollbackRow = {
  id: string;
  expected: Record<string, unknown>;
  restore: Record<keyof GshlImpactNext, GshlImpactFieldState>;
};
export type GshlImpactBatchResult = {
  table: GshlImpactTable;
  apply: boolean;
  total: number;
  updated: number;
  wouldUpdate: number;
  already: number;
};
export type GshlImpactScope = {
  table: GshlImpactTable;
  field?: "seasonId" | "weekId";
  id?: string;
};

/** Retry transport failures only; callers suppress diagnostics at the IO boundary. */
export async function retryImpactRead<T>(
  read: () => Promise<T>,
  pause = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await read();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        attempt < 2 &&
        !/unauthorized|bound|scope|invalid|duplicate|cursor|pagination|maximum|array.*length/i.test(
          message,
        ) &&
        /fetch failed|timed out|ECONNRESET|429|502|503|504|524/i.test(message)
      ) {
        await pause(500 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw Error("Production read retries exhausted");
}

/** Every scope paginates below Convex's array limit; complete populations stay bounded. */
export async function collectImpactScopeIds(
  args: GshlImpactScope,
  readPage: (
    args: GshlImpactScope & { cursor?: string | null },
  ) => Promise<unknown>,
): Promise<{ ids: string[] }> {
  const ids = new Set<string>(),
    cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 7; page++) {
    const result = await readPage({ ...args, cursor });
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw Error("Invalid rating population page");
    const value = result as Record<string, unknown>;
    if (!Array.isArray(value.ids) || value.ids.length > 2000)
      throw Error("Invalid rating population response");
    for (const id of value.ids) {
      if (typeof id !== "string" || !id || ids.has(id))
        throw Error("Duplicate or invalid rating population identity");
      ids.add(id);
      if (ids.size > 12000)
        throw Error("Rating population scope exceeds bound");
    }
    if (
      typeof value.isDone !== "boolean" ||
      typeof value.continueCursor !== "string"
    )
      throw Error("Invalid rating population pagination");
    if (value.isDone) return { ids: [...ids].sort() };
    if (
      !value.continueCursor ||
      value.continueCursor === cursor ||
      cursors.has(value.continueCursor)
    )
      throw Error("Rating population cursor did not advance");
    cursors.add(value.continueCursor);
    cursor = value.continueCursor;
  }
  throw Error("Rating population exceeded bounded page count");
}

/** Explicit production-only CAS transport; credentials and errors never reach artifacts. */
export async function createProductionImpactClient() {
  const deployment = "polished-tern-709";
  const secret = (
    await capturedCli([
      "env",
      "get",
      "CONVEX_SERVER_SECRET",
      "--deployment",
      deployment,
    ])
  ).trim();
  if (!secret || /[\r\n]/.test(secret))
    throw Error("Production rating credential unavailable");
  const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`, {
    logger: false,
  });
  async function send(
    name: "applyBatch" | "rollbackBatch",
    args: {
      table: GshlImpactTable;
      apply?: boolean;
      rows: GshlImpactApplyRow[] | GshlImpactRollbackRow[];
    },
  ): Promise<GshlImpactBatchResult> {
    if (
      !GSHL_IMPACT_TABLES.includes(args.table) ||
      args.rows.length > 100 ||
      new Set(args.rows.map((row) => row.id)).size !== args.rows.length
    )
      throw Error("Unsupported production GSHL impact batch scope");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await client.mutation(
          makeFunctionReference<"mutation">(`gshlImpactRatings:${name}`),
          { ...args, serverSecret: secret },
          // Callers bound concurrent disjoint batches; each mutation retains full CAS.
          { skipQueue: true },
        );
        if (
          !result ||
          result.table !== args.table ||
          result.apply !== (args.apply === true) ||
          result.total !== args.rows.length ||
          [result.updated, result.wouldUpdate, result.already].some(
            (value: unknown) =>
              typeof value !== "number" ||
              !Number.isSafeInteger(value) ||
              value < 0,
          ) ||
          result.updated + result.wouldUpdate + result.already !==
            args.rows.length ||
          (args.apply === true
            ? result.wouldUpdate !== 0
            : result.updated !== 0)
        )
          throw Error("Rating batch result mismatch");
        return result as GshlImpactBatchResult;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const reason = [
          "Rating source preimage changed",
          "Rating source row missing or wrong table",
          "Rating rollback postimage changed",
          "Rating batch result mismatch",
          "Unauthorized rating maintenance",
        ].find((reason) => message.includes(reason));
        if (
          !reason &&
          /fetch failed|timed out|ECONNRESET|429|502|503|504|524/i.test(
            message,
          ) &&
          attempt < 2
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1)),
          );
          continue;
        }
        throw Error(
          `Production GSHL impact ${name} failed${reason ? ": " + reason : ""}; private diagnostics suppressed`,
        );
      }
    }
    throw Error("Production rating retries exhausted");
  }
  return {
    deployment,
    scopeIds: async (args: GshlImpactScope): Promise<{ ids: string[] }> => {
      try {
        return await collectImpactScopeIds(args, (page) =>
          retryImpactRead(() =>
            client.query(
              makeFunctionReference<"query">("gshlImpactRatings:readScopeIds"),
              { ...page, serverSecret: secret },
            ),
          ),
        );
      } catch {
        throw Error(
          "Production GSHL impact population read failed; private diagnostics suppressed",
        );
      }
    },
    inventory: async (): Promise<{
      seasons: Record<string, unknown>[];
      weeks: Record<string, unknown>[];
      teams: Record<string, unknown>[];
    }> => {
      try {
        const result: unknown = await retryImpactRead(() =>
          client.query(
            makeFunctionReference<"query">("gshlImpactRatings:readInventory"),
            { serverSecret: secret },
          ),
        );
        const rows = result as Record<string, unknown> | null;
        for (const [table, bound] of [
          ["seasons", 16],
          ["weeks", 335],
          ["teams", 212],
        ] as const)
          if (
            !Array.isArray(rows?.[table]) ||
            (rows[table] as unknown[]).length > bound
          )
            throw Error("Invalid rating metadata inventory response");
        return result as {
          seasons: Record<string, unknown>[];
          weeks: Record<string, unknown>[];
          teams: Record<string, unknown>[];
        };
      } catch {
        throw Error(
          "Production GSHL impact inventory read failed; private diagnostics suppressed",
        );
      }
    },
    applyBatch: (args: {
      table: GshlImpactTable;
      apply?: boolean;
      rows: GshlImpactApplyRow[];
    }) => send("applyBatch", args),
    rollbackBatch: (args: {
      table: GshlImpactTable;
      apply?: boolean;
      rows: GshlImpactRollbackRow[];
    }) => send("rollbackBatch", args),
  };
}
