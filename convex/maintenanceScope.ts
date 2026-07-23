/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { mutationGeneric, queryGeneric } from "convex/server";
import { ConvexError, v } from "convex/values";

const TABLES = new Set([
  "playerDayStatLines",
  "playerWeekStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
]);

const AGGREGATE_KEYS: Record<string, string[]> = {
  playerDayStatLines: ["seasonId", "gshlTeamId", "playerId", "weekId", "date"],
  playerWeekStatLines: ["seasonId", "gshlTeamId", "playerId", "weekId"],
  playerSplitStatLines: ["seasonId", "seasonType", "gshlTeamId", "playerId"],
  playerTotalStatLines: ["seasonId", "seasonType", "playerId"],
  playerCareerSplitStatLines: ["gshlTeamId", "playerId", "seasonType"],
  playerCareerTotalStatLines: ["playerId", "seasonType"],
  playerNhlStatLines: ["seasonId", "playerId"],
  teamDayStatLines: ["seasonId", "gshlTeamId", "weekId", "date"],
  teamWeekStatLines: ["seasonId", "weekId", "gshlTeamId"],
  teamSeasonStatLines: ["seasonId", "seasonType", "gshlTeamId"],
};

const CAREER_TABLES = new Set([
  "playerCareerSplitStatLines",
  "playerCareerTotalStatLines",
]);

const SEASON_TABLES = new Set([
  "weeks",
  "teams",
  "matchups",
  "playerDayStatLines",
  "playerWeekStatLines",
  "playerSplitStatLines",
  "playerTotalStatLines",
  "playerNhlStatLines",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
]);

const PATCH_TABLES = new Set([
  "matchups",
  "teamDayStatLines",
  "teamWeekStatLines",
  "teamSeasonStatLines",
]);

function requireAggregateTable(table: string): string[] {
  const fields = AGGREGATE_KEYS[table];
  if (!fields) throw new Error(`Unsupported aggregate table: ${table}`);
  return fields;
}

function normalizeAggregateDoc(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const doc = { ...row };
  const id = doc.id;
  delete doc.id;
  delete doc._id;
  delete doc._creationTime;
  doc.legacyId ??=
    typeof id === "string" || typeof id === "number" ? String(id) : undefined;
  return doc;
}

function diagnosticValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return value === null || value === undefined ? "" : JSON.stringify(value);
}

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

export const listWeekRows = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    gshlTeamId: v.optional(v.id("teams")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!TABLES.has(args.table)) {
      throw new Error(`Unsupported maintenance scope table: ${args.table}`);
    }
    const base = ctx.db.query(args.table as never);
    const scoped = args.gshlTeamId
      ? base.withIndex("by_seasonId_weekId_gshlTeamId" as never, (q: any) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("weekId", args.weekId)
            .eq("gshlTeamId", args.gshlTeamId),
        )
      : base.withIndex("by_weekId" as never, (q: any) =>
          q.eq("weekId", args.weekId),
        );
    const page = await scoped.paginate({
      cursor: args.cursor,
      numItems: 50,
    });
    return {
      items: page.page.map(
        (row: Record<string, unknown> & { _id: string }) => ({
          ...row,
          id: row._id,
        }),
      ),
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});

export const listSeasonRows = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    seasonId: v.id("seasons"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!SEASON_TABLES.has(args.table)) {
      throw new Error(`Unsupported season scope table: ${args.table}`);
    }
    const page = await ctx.db
      .query(args.table as never)
      .withIndex("by_seasonId" as never, (q: any) =>
        q.eq("seasonId", args.seasonId),
      )
      .paginate({ cursor: args.cursor, numItems: 50 });
    return {
      items: page.page.map(
        (row: Record<string, unknown> & { _id: string }) => ({
          ...row,
          id: row._id,
        }),
      ),
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});

export const listAggregateRows = queryGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    seasonId: v.optional(v.id("seasons")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireAggregateTable(args.table);
    const careerTable = CAREER_TABLES.has(args.table);
    if (!careerTable && !args.seasonId) {
      throw new Error(`seasonId is required for ${args.table}`);
    }
    const base = ctx.db.query(args.table as never);
    const scoped = careerTable
      ? base
      : base.withIndex("by_seasonId" as never, (q: any) =>
          q.eq("seasonId", args.seasonId),
        );
    const page = await scoped.paginate({
      cursor: args.cursor,
      numItems: 50,
    });
    return {
      items: page.page.map(
        (row: Record<string, unknown> & { _id: string }) => ({
          ...row,
          id: row._id,
        }),
      ),
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
    };
  },
});

export const upsertAggregateRows = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    rows: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const keyFields = requireAggregateTable(args.table);
    if (args.rows.length > 25) {
      throw new Error("Aggregate writes are limited to 25 rows per mutation");
    }
    const indexName = `by_${keyFields.join("_")}`;
    const now = new Date().toISOString();
    let updated = 0;
    let inserted = 0;
    for (const rawRow of args.rows) {
      const doc = normalizeAggregateDoc(rawRow);
      try {
        const existing = (await ctx.db
          .query(args.table as never)
          .withIndex(indexName as never, (q: any) => {
            // Dynamic table/index dispatch is constrained by AGGREGATE_KEYS.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            let range = q;
            for (const field of keyFields) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              range = range.eq(field, doc[field]);
            }
            return range;
          })
          .first()) as unknown as { _id: string } | null;
        if (existing) {
          await ctx.db.patch(
            existing._id as never,
            {
              ...doc,
              updatedAt: doc.updatedAt ?? now,
            } as never,
          );
          updated += 1;
        } else {
          await ctx.db.insert(args.table as never, {
            ...doc,
            createdAt: doc.createdAt ?? now,
            updatedAt: doc.updatedAt ?? now,
          });
          inserted += 1;
        }
      } catch (error) {
        throw new ConvexError({
          code: "AGGREGATE_ROW_UPSERT_FAILED",
          table: args.table,
          indexName,
          key: Object.fromEntries(
            keyFields.map((field) => [field, diagnosticValue(doc[field])]),
          ),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { updated, inserted };
  },
});

export const deleteAggregateRows = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    ids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    requireAggregateTable(args.table);
    if (args.ids.length > 50) {
      throw new Error("Aggregate deletes are limited to 50 rows per mutation");
    }
    let deleted = 0;
    for (const id of args.ids) {
      const normalizedId = ctx.db.normalizeId(args.table as never, id) as
        | string
        | null;
      if (!normalizedId) continue;
      const row = (await ctx.db.get(normalizedId as never)) as unknown;
      if (!row) continue;
      await ctx.db.delete(normalizedId as never);
      deleted += 1;
    }
    return { deleted };
  },
});

export const patchRowsById = mutationGeneric({
  args: {
    serverSecret: v.string(),
    table: v.string(),
    rows: v.array(
      v.object({
        id: v.string(),
        data: v.record(v.string(), v.any()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    if (!PATCH_TABLES.has(args.table)) {
      throw new Error(`Unsupported maintenance patch table: ${args.table}`);
    }
    if (args.rows.length > 25) {
      throw new Error(
        "Maintenance patches are limited to 25 rows per mutation",
      );
    }
    let updated = 0;
    for (const entry of args.rows) {
      const id = ctx.db.normalizeId(args.table as never, entry.id) as
        | string
        | null;
      if (!id || !(await ctx.db.get(id as never))) {
        throw new ConvexError({
          code: "MAINTENANCE_PATCH_ROW_NOT_FOUND",
          table: args.table,
          id: entry.id,
        });
      }
      await ctx.db.patch(id as never, entry.data);
      updated += 1;
    }
    return { updated };
  },
});
