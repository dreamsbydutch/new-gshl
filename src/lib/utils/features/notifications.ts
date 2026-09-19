import type {
  NotificationCategory,
  NotificationChoice,
} from "../../types/notifications";

export const DRAFT_REMINDER_CATEGORIES: readonly NotificationCategory[] = [
  "draft_start",
  "draft_turn",
  "draft_upcoming",
  "draft_clock",
];

export const NOTIFICATION_OPTIONS: readonly {
  key: NotificationCategory;
  label: string;
  description: string;
  defaultPush: boolean;
}[] = [
  {
    key: "draft_start",
    label: "Draft starting",
    description: "A reminder 15 minutes before the draft.",
    defaultPush: true,
  },
  {
    key: "draft_turn",
    label: "On the clock",
    description: "When it is your turn to pick.",
    defaultPush: true,
  },
  {
    key: "draft_upcoming",
    label: "Up next",
    description: "When your pick is two selections away.",
    defaultPush: true,
  },
  {
    key: "draft_clock",
    label: "Clock running low",
    description: "When you have one minute left to pick.",
    defaultPush: true,
  },
  {
    key: "draft_pick",
    label: "Pick confirmation",
    description: "After your team makes a selection.",
    defaultPush: false,
  },
  {
    key: "draft_complete",
    label: "Draft complete",
    description: "When the final selection is made.",
    defaultPush: false,
  },
  {
    key: "announcement",
    label: "League announcements",
    description: "Important updates from the commissioner.",
    defaultPush: true,
  },
  {
    key: "press_box",
    label: "Press Box",
    description: "When a new edition is published.",
    defaultPush: false,
  },
];

export function notificationChoice(
  category: NotificationCategory,
  saved?: NotificationChoice,
): NotificationChoice {
  return (
    saved ?? {
      inbox: true,
      push:
        NOTIFICATION_OPTIONS.find((option) => option.key === category)
          ?.defaultPush ?? false,
    }
  );
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "wns.windows.com" ||
        url.hostname.endsWith(".notify.windows.com") ||
        url.hostname.endsWith(".wns.windows.com"))
    );
  } catch {
    return false;
  }
}
