"use node";

import webPush from "web-push";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { isAllowedPushEndpoint } from "../src/lib/utils/features/notifications";

export const send = internalAction({
  args: {
    notificationId: v.id("notifications"),
    deviceId: v.id("pushSubscriptions"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const publicKey = process.env.WEB_PUSH_PUBLIC_KEY,
      privateKey = process.env.WEB_PUSH_PRIVATE_KEY,
      subject = process.env.WEB_PUSH_SUBJECT;
    if (!publicKey || !privateKey || !subject) return;
    const delivery = await ctx.runQuery(internal.notifications.delivery, {
      notificationId: args.notificationId,
      deviceId: args.deviceId,
    });
    if (!delivery || !isAllowedPushEndpoint(delivery.device.endpoint)) return;
    const { device, notification, expiresAt } = delivery;
    try {
      await webPush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          href: notification.href,
          tag: notification._id,
        }),
        {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: Math.max(
            0,
            Math.min(86400, Math.floor((expiresAt - Date.now()) / 1000)),
          ),
          timeout: 10000,
          urgency:
            notification.category === "draft_turn" ||
            notification.category === "draft_clock"
              ? "high"
              : "normal",
        },
      );
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 0;
      if (status === 404 || status === 410)
        await ctx.runMutation(internal.notifications.expiredDevice, {
          deviceId: device._id,
          updatedAt: device.updatedAt,
        });
      else if (
        (status === 0 || status === 429 || status >= 500) &&
        args.attempt < 3
      )
        await ctx.scheduler.runAfter(
          10000 * 2 ** args.attempt,
          internal.notificationPush.send,
          { ...args, attempt: args.attempt + 1 },
        );
      // Push errors can contain endpoint credentials; never log the raw error.
      else
        console.warn("Push delivery failed", { status, attempt: args.attempt });
    }
  },
});
