import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";

export async function emitNotification(
  ctx: MutationCtx,
  event: Omit<Doc<"notificationEvents">, "_id" | "_creationTime" | "createdAt">,
) {
  if (event.expiresAt <= Date.now()) return;
  if (
    await ctx.db
      .query("notificationEvents")
      .withIndex("by_key", (q) => q.eq("key", event.key))
      .unique()
  )
    return;
  const eventId = await ctx.db.insert("notificationEvents", {
    ...event,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.notifications.fanOut, {
    eventId,
    cursor: null,
  });
}
