import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  notificationIconUrl,
  DEFAULT_NOTIFICATION_ICON,
} from "../../src/lib/utils/features/notifications";
import { WEEKLY_EDITION_LOGO_URL } from "../../src/lib/utils/features/weekly-edition-brand";

export async function resolveNotificationIcon(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"notificationEvents">,
) {
  if (event.category === "press_box" || event.subject?.kind === "press_box")
    return notificationIconUrl(WEEKLY_EDITION_LOGO_URL);
  if (event.subject?.kind === "team") {
    const franchise = await ctx.db.get(event.subject.franchiseId);
    return notificationIconUrl(franchise?.logoUrl);
  }
  if (event.subject?.kind === "conference") {
    const conference = await ctx.db.get(event.subject.conferenceId);
    return notificationIconUrl(conference?.logoUrl);
  }
  if (event.pickId) {
    const pick = await ctx.db.get(event.pickId);
    const team = pick?.gshlTeamId ? await ctx.db.get(pick.gshlTeamId) : null;
    const franchise = team ? await ctx.db.get(team.franchiseId) : null;
    return notificationIconUrl(franchise?.logoUrl);
  }
  return DEFAULT_NOTIFICATION_ICON;
}

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
