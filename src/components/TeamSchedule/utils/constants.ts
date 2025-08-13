import { GameTypeDisplay } from "./types";

// Game types
export const GAME_TYPES = {
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
  REGULAR_SEASON: "RS",
  CONFERENCE_CHAMPIONSHIP: "CC",
} as const;

// Game locations
export const GAME_LOCATIONS = {
  HOME: "HOME",
  AWAY: "AWAY",
} as const;

// Conference abbreviations and colors
export const CONFERENCES = {
  HICKORY_HOTEL: {
    abbr: "HH",
    textColor: "text-hotel-800",
  },
  SUNVIEW: {
    abbr: "SV",
    textColor: "text-sunview-800",
  },
} as const;

// Game type styling configurations
export const GAME_TYPE_STYLES: Record<string, GameTypeDisplay> = {
  QF: {
    label: "QF",
    className: "text-orange-800 bg-orange-100",
  },
  SF: {
    label: "SF",
    className: "text-slate-700 bg-slate-100",
  },
  F: {
    label: "F",
    className: "text-yellow-800 bg-yellow-100",
  },
  LT: {
    label: "LT",
    className: "text-brown-800 bg-brown-100",
  },
} as const;

// Ranking display threshold
export const RANKING_DISPLAY_THRESHOLD = 8;

// Win/Loss styling classes
export const RESULT_STYLES = {
  WIN: "font-semibold text-emerald-700",
  LOSS: "text-rose-800",
  DEFAULT: "text-gray-500",
} as const;
