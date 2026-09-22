import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { syncPlayerDayPerformanceIndex } from "./lib/playerDayPerformanceIndex";

const scope = {
  source: v.union(
    v.literal("playerDayStatLines"),
    v.literal("playerDayHighlights"),
  ),
  seasonId: v.id("seasons"),
};

/** Operator-only, additive index build. Never invoked by a leaderboard read. */
export const prepare = mutation({
  args: { ...scope, serverSecret: v.string(), apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (
      !process.env.CONVEX_SERVER_SECRET ||
      args.serverSecret !== process.env.CONVEX_SERVER_SECRET
    )
      throw new Error("Unauthorized server request");
    const state = await ctx.db
      .query("playerDayPerformanceCoverage")
      .withIndex("by_source_season", (q) =>
        q.eq("source", args.source).eq("seasonId", args.seasonId),
      )
      .unique();
    if (!args.apply)
      return {
        ready: state?.ready ?? false,
        indexedRows: state?.indexedRows ?? 0,
        wouldStart: !state?.ready,
      };
    if (state?.ready)
      return { ready: true, indexedRows: state.indexedRows, wouldStart: false };
    if (!(await ctx.db.get(args.seasonId))) throw new Error("Season not found");
    if (!state)
      await ctx.db.insert("playerDayPerformanceCoverage", {
        source: args.source,
        seasonId: args.seasonId,
        ready: false,
        indexedRows: 0,
        cursor: null,
      });
    await ctx.scheduler.runAfter(0, internal.playerDayPerformanceIndex.batch, {
      source: args.source,
      seasonId: args.seasonId,
      expectedCursor: state?.cursor ?? null,
    });
    return {
      ready: false,
      indexedRows: state?.indexedRows ?? 0,
      wouldStart: true,
    };
  },
});

export const batch = internalMutation({
  args: { ...scope, expectedCursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("playerDayPerformanceCoverage")
      .withIndex("by_source_season", (q) =>
        q.eq("source", args.source).eq("seasonId", args.seasonId),
      )
      .unique();
    // Duplicate/resumed scheduled work cannot advance a cursor twice.
    if (!state || state.ready || state.cursor !== args.expectedCursor) return;
    const result = await ctx.db
      .query(args.source)
      .withIndex("by_seasonId", (q) => q.eq("seasonId", args.seasonId))
      .paginate({ cursor: state.cursor, numItems: 100 });
    for (const row of result.page)
      await syncPlayerDayPerformanceIndex(ctx.db, args.source, row._id, row);
    await ctx.db.patch(state._id, {
      cursor: result.continueCursor,
      indexedRows: state.indexedRows + result.page.length,
      ready: result.isDone,
    });
    if (!result.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.playerDayPerformanceIndex.batch,
        { ...args, expectedCursor: result.continueCursor },
      );
  },
});
