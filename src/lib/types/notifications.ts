export type NotificationCategory =
  | "draft_start"
  | "draft_turn"
  | "draft_upcoming"
  | "draft_clock"
  | "draft_pick"
  | "draft_complete"
  | "announcement"
  | "press_box"
  | "trade_block";

export type NotificationChoice = { inbox: boolean; push: boolean };
