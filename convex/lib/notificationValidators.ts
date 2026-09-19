import { v } from "convex/values";

export const notificationCategory = v.union(
  v.literal("draft_start"),
  v.literal("draft_turn"),
  v.literal("draft_upcoming"),
  v.literal("draft_clock"),
  v.literal("draft_pick"),
  v.literal("draft_complete"),
  v.literal("announcement"),
  v.literal("press_box"),
);
