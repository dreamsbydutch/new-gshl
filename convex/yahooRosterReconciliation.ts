import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { verifyPlayerDayRemoval } from "./lib/verifiedPlayerDayRemoval";
import { syncPlayerDayPerformanceIndex } from "./lib/playerDayPerformanceIndex";

/** Exact-ID, compare-and-delete operation after the operator verifies a backup. */
export const removeSupersededDays = mutation({
  args: {
    serverSecret: v.string(),
    seasonId: v.id("seasons"),
    date: v.string(),
    backupSha256: v.string(),
    expected: v.array(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    if (
      !process.env.CONVEX_SERVER_SECRET ||
      args.serverSecret !== process.env.CONVEX_SERVER_SECRET
    )
      throw new Error("Unauthorized server request");
    if (!/^[a-f0-9]{64}$/.test(args.backupSha256) || args.expected.length > 25)
      throw new Error(
        "A verified backup digest and at most 25 rows are required.",
      );
    const ids: Id<"playerDayStatLines">[] = [];
    for (const expected of args.expected) {
      const id =
        typeof expected.id === "string"
          ? ctx.db.normalizeId("playerDayStatLines", expected.id)
          : null;
      if (!id || ids.includes(id))
        throw new Error("Distinct player-day IDs are required.");
      const actual = await ctx.db.get(id);
      if (!actual)
        throw new Error(
          "Superseded player day no longer exists; retry reconciliation.",
        );
      verifyPlayerDayRemoval(actual, expected, args.seasonId, args.date);
      ids.push(id);
    }
    for (const id of ids) {
      await syncPlayerDayPerformanceIndex(
        ctx.db,
        "playerDayStatLines",
        id,
        null,
      );
      await ctx.db.delete(id);
    }
    return { deleted: ids.length };
  },
});
