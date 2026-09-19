import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireActiveUser, requireCommissioner } from "./lib/auth";
import { notificationCategory } from "./lib/notificationValidators";
import {
  isAllowedPushEndpoint,
  notificationChoice,
  NOTIFICATION_OPTIONS,
  DRAFT_REMINDER_CATEGORIES,
} from "../src/lib/utils/features/notifications";
import { toUtcTimestamp } from "./lib/timestamps";
import { notificationClock } from "./draft";

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    const preferences = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_category", (q) => q.eq("userId", user._id))
      .collect();
    const devices = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(20);
    return {
      options: NOTIFICATION_OPTIONS.map((option) => ({
        ...option,
        ...notificationChoice(
          option.key,
          preferences.find((row) => row.category === option.key),
        ),
      })),
      devices: devices.map((row) => ({
        id: row._id,
        label: row.label,
        updatedAt: row.updatedAt,
      })),
      publicKey:
        process.env.WEB_PUSH_PUBLIC_KEY &&
        process.env.WEB_PUSH_PRIVATE_KEY &&
        process.env.WEB_PUSH_SUBJECT
          ? process.env.WEB_PUSH_PUBLIC_KEY
          : null,
      isCommissioner: user.role === "commissioner",
    };
  },
});

export const inbox = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    return ctx.db
      .query("notifications")
      .withIndex("by_user_inbox", (q) =>
        q.eq("userId", user._id).eq("inbox", true),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const unread = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_inbox_read", (q) =>
        q.eq("userId", user._id).eq("inbox", true).eq("read", false),
      )
      .take(100);
    return rows.length;
  },
});

export const savePreference = mutation({
  args: {
    category: notificationCategory,
    inbox: v.boolean(),
    push: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", user._id).eq("category", args.category),
      )
      .unique();
    const values = { ...args, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, values);
    else
      await ctx.db.insert("notificationPreferences", {
        userId: user._id,
        ...values,
      });
  },
});

export const enableDraftReminders = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    for (const category of DRAFT_REMINDER_CATEGORIES) {
      const saved = await ctx.db
        .query("notificationPreferences")
        .withIndex("by_user_category", (q) =>
          q.eq("userId", user._id).eq("category", category),
        )
        .unique();
      const values = { inbox: true, push: true, updatedAt: Date.now() };
      if (saved) await ctx.db.patch(saved._id, values);
      else
        await ctx.db.insert("notificationPreferences", {
          userId: user._id,
          category,
          ...values,
        });
    }
  },
});

export const testPush = mutation({
  args: { deviceId: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const device = await ctx.db.get(args.deviceId);
    if (device?.userId !== user._id)
      throw new Error("Enable notifications on this device first.");
    if (
      !process.env.WEB_PUSH_PUBLIC_KEY ||
      !process.env.WEB_PUSH_PRIVATE_KEY ||
      !process.env.WEB_PUSH_SUBJECT
    )
      throw new Error("Push notifications are not configured yet.");
    const preference = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", user._id).eq("category", "draft_turn"),
      )
      .unique();
    if (!notificationChoice("draft_turn", preference ?? undefined).push)
      throw new Error("Enable on-the-clock alerts before sending a test.");
    const now = Date.now();
    const key = `test:${user._id}:${Math.floor(now / 60000)}`;
    if (
      await ctx.db
        .query("notificationEvents")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique()
    )
      throw new Error("Wait a minute before sending another test.");
    const message = {
      category: "draft_turn" as const,
      title: "Draft alerts are connected",
      body: "This device can receive your GSHL draft alerts.",
      href: "/notifications",
    };
    const eventId = await ctx.db.insert("notificationEvents", {
      ...message,
      key,
      createdAt: now,
      expiresAt: now + 60000,
    });
    const notificationId = await ctx.db.insert("notifications", {
      ...message,
      eventId,
      userId: user._id,
      inbox: false,
      read: true,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.notificationPush.send, {
      notificationId,
      deviceId: device._id,
      attempt: 0,
    });
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const row = await ctx.db.get(args.id);
    if (row?.userId !== user._id) throw new Error("Notification not found");
    await ctx.db.patch(row._id, { read: true });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireActiveUser(ctx);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_user_inbox_read", (q) =>
        q.eq("userId", user._id).eq("inbox", true).eq("read", false),
      )
      .take(100);
    for (const row of rows) await ctx.db.patch(row._id, { read: true });
    return { more: rows.length === 100 };
  },
});

export const subscribe = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    if (
      !isAllowedPushEndpoint(args.endpoint) ||
      args.endpoint.length > 4096 ||
      !/^[A-Za-z0-9_-]{87}$/.test(args.p256dh) ||
      !/^[A-Za-z0-9_-]{22}$/.test(args.auth)
    )
      throw new Error("Invalid push subscription");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    // Never silently transfer a shared browser subscription between accounts.
    if (existing && existing.userId !== user._id)
      throw new Error(
        "This browser is connected to another account. Reset browser notifications and try again.",
      );
    const devices = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(20);
    if (!existing && devices.length >= 20)
      throw new Error("Remove a device before adding another.");
    const values = {
      ...args,
      label: args.label.trim().slice(0, 80) || "Browser",
      userId: user._id,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("pushSubscriptions", values);
  },
});

export const removeDevice = mutation({
  args: { id: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const row = await ctx.db.get(args.id);
    if (row?.userId !== user._id) throw new Error("Device not found");
    await ctx.db.delete(row._id);
  },
});

export const deviceForEndpoint = query({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    return row?.userId === user._id ? row._id : null;
  },
});

export const disconnectBrowser = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    const user = await requireActiveUser(ctx);
    const device = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .unique();
    if (device?.userId === user._id) await ctx.db.delete(device._id);
  },
});

export const announce = mutation({
  args: { title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    await requireCommissioner(ctx);
    const title = args.title.trim(),
      body = args.body.trim();
    if (!title || title.length > 100 || !body || body.length > 500)
      throw new Error(
        "Enter a title (up to 100 characters) and message (up to 500 characters).",
      );
    const now = Date.now();
    const eventId = await ctx.db.insert("notificationEvents", {
      key: `announcement:${now}`,
      category: "announcement",
      title,
      body,
      href: "/notifications",
      createdAt: now,
      expiresAt: now + 86400000,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.fanOut, {
      eventId,
      cursor: null,
    });
  },
});

export const fanOut = internalMutation({
  args: {
    eventId: v.id("notificationEvents"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.expiresAt <= Date.now()) return;
    const result = await (
      event.ownerId
        ? ctx.db
            .query("authUsers")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", event.ownerId))
        : ctx.db
            .query("authUsers")
            .withIndex("by_status", (q) => q.eq("status", "active"))
    ).paginate({ cursor: args.cursor, numItems: 50 });
    for (const user of result.page) {
      if (
        user.status !== "active" ||
        toUtcTimestamp(user.createdAt)! > event.createdAt
      )
        continue;
      if (event.ownerId && user.role === "viewer") continue;
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_user_event", (q) =>
          q.eq("userId", user._id).eq("eventId", event._id),
        )
        .unique();
      if (existing) continue;
      const saved = await ctx.db
        .query("notificationPreferences")
        .withIndex("by_user_category", (q) =>
          q.eq("userId", user._id).eq("category", event.category),
        )
        .unique();
      const choice = notificationChoice(event.category, saved ?? undefined);
      const notificationId = await ctx.db.insert("notifications", {
        userId: user._id,
        eventId: event._id,
        category: event.category,
        title: event.title,
        body: event.body,
        href: event.href,
        inbox: choice.inbox,
        read: false,
        createdAt: event.createdAt,
      });
      if (choice.push) {
        const devices = await ctx.db
          .query("pushSubscriptions")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .take(20);
        for (const device of devices)
          await ctx.scheduler.runAfter(0, internal.notificationPush.send, {
            notificationId,
            deviceId: device._id,
            attempt: 0,
          });
      }
    }
    if (!result.isDone)
      await ctx.scheduler.runAfter(0, internal.notifications.fanOut, {
        eventId: event._id,
        cursor: result.continueCursor,
      });
  },
});

export const delivery = internalQuery({
  args: {
    notificationId: v.id("notifications"),
    deviceId: v.id("pushSubscriptions"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId),
      device = await ctx.db.get(args.deviceId);
    if (!notification || notification.userId !== device?.userId) return null;
    const user = await ctx.db.get(notification.userId),
      event = await ctx.db.get(notification.eventId);
    if (user?.status !== "active" || !event || event.expiresAt <= Date.now())
      return null;
    if (
      event.ownerId &&
      (user.ownerId !== event.ownerId || user.role === "viewer")
    )
      return null;
    const saved = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_category", (q) =>
        q.eq("userId", user._id).eq("category", event.category),
      )
      .unique();
    if (!notificationChoice(event.category, saved ?? undefined).push)
      return null;
    if (
      event.editionId &&
      (await ctx.db.get(event.editionId))?.status !== "published"
    )
      return null;
    if (event.seasonId) {
      const season = await ctx.db.get(event.seasonId);
      if (!season) return null;
      if (
        event.category === "draft_start" &&
        toUtcTimestamp(season.draftStartAt) !== event.expiresAt
      )
        return null;
      if (
        event.category === "draft_complete" &&
        (await notificationClock(ctx, event.seasonId)).status !== "complete"
      )
        return null;
    }
    if (event.pickId) {
      const pick = await ctx.db.get(event.pickId);
      if (!pick) return null;
      if (event.category === "draft_pick") {
        if (
          !pick.playerId ||
          toUtcTimestamp(pick.onClockEndedAt) !== event.clockStartedAt
        )
          return null;
      } else {
        if (pick.playerId || pick.isSigning) return null;
        const clock = await notificationClock(ctx, pick.seasonId);
        if (clock.status !== "on_clock") return null;
        if (event.category === "draft_upcoming") {
          if (
            !clock.upcomingPicks
              .slice(0, 2)
              .some((upcoming) => upcoming.id === String(pick._id))
          )
            return null;
        } else if (
          clock.activePick?.id !== String(pick._id) ||
          toUtcTimestamp(clock.clockStartedAt) !== event.clockStartedAt
        )
          return null;
        const team = pick.gshlTeamId ? await ctx.db.get(pick.gshlTeamId) : null;
        const franchise = team ? await ctx.db.get(team.franchiseId) : null;
        if (franchise?.ownerId !== event.ownerId) return null;
      }
    }
    return { notification, device, expiresAt: event.expiresAt };
  },
});

export const expiredDevice = internalMutation({
  args: { deviceId: v.id("pushSubscriptions"), updatedAt: v.number() },
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (device?.updatedAt === args.updatedAt) await ctx.db.delete(device._id);
  },
});
