/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { queryGeneric } from "convex/server";
import { v } from "convex/values";

function requireServerSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected) {
    throw new Error("Unauthorized server request");
  }
}

export const listPlayerDayRows = queryGeneric({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    weekId: v.id("weeks"),
    gshlTeamId: v.optional(v.id("teams")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    requireServerSecret(args.serverSecret);
    const base = ctx.db.query("playerDayStatLines" as never);
    const scoped = args.gshlTeamId
      ? base.withIndex("by_seasonId_weekId_gshlTeamId" as never, (q: any) =>
          q
            .eq("seasonId", args.seasonId)
            .eq("weekId", args.weekId)
            .eq("gshlTeamId", args.gshlTeamId),
        )
      : base.withIndex("by_seasonId_weekId" as never, (q: any) =>
          q.eq("seasonId", args.seasonId).eq("weekId", args.weekId),
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
