import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { emitNotification } from "./lib/notificationEvents";
import { toUtcTimestamp } from "./lib/timestamps";

export const scan = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_draftStartAt", (q) =>
        q
          .gte("draftStartAt", now - 7 * 86400000)
          .lte("draftStartAt", now + 15 * 60000),
      )
      .take(20);
    for (const season of seasons)
      await ctx.scheduler.runAfter(0, internal.draft.notifyState, {
        seasonId: season._id,
      });
    const editions = await ctx.db
      .query("weeklyEditions")
      .withIndex("by_status_publishedAt", (q) =>
        q
          .eq("status", "published")
          .gte("publishedAt", now - 3600000)
          .lte("publishedAt", now),
      )
      .take(50);
    for (const edition of editions)
      await emitNotification(ctx, {
        key: `edition:${edition._id}`,
        category: "press_box",
        title: "New in the Press Box",
        body: edition.issueLabel,
        href: `/headlines/${edition._id}`,
        editionId: edition._id,
        expiresAt: (toUtcTimestamp(edition.publishedAt) ?? now) + 86400000,
      });
  },
});
