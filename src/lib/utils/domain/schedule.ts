/**
 * Schedule Domain Utilities
 * -------------------------
 * Domain-specific constants and utilities for game schedules, conferences, and matchups.
 * Used across team-schedule and weekly-schedule features.
 */

/**
 * Game type abbreviations used throughout the schedule system.
 * Covers regular season, conference championships, and all playoff rounds.
 */
export const GAME_TYPES = {
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
  REGULAR_SEASON: "RS",
  CONFERENCE_CHAMPIONSHIP: "CC",
  NON_CONFERENCE: "NC", // Used by weekly schedule
} as const;

/**
 * Conference abbreviations for Sunview and Hickory Hotel.
 */
export const CONFERENCE_ABBR = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

/**
 * Conference configurations with display properties.
 * Used by team-schedule for styling conference-specific elements.
 */
export const CONFERENCES = {
  HICKORY_HOTEL: {
    abbr: "HH" as const,
    textColor: "text-hotel-800",
  },
  SUNVIEW: {
    abbr: "SV" as const,
    textColor: "text-sunview-800",
  },
} as const;

/**
 * Game location constants (home/away).
 */
export const GAME_LOCATIONS = {
  HOME: "HOME",
  AWAY: "AWAY",
} as const;

/**
 * Threshold for displaying team rankings in schedule views.
 * Only teams ranked 8 or better will show their rank badge.
 */
export const RANKING_DISPLAY_THRESHOLD = 8;

/**
 * Team logo dimensions used across schedule components.
 */
export const TEAM_LOGO_DIMENSIONS = {
  width: 64,
  height: 64,
} as const;

