// Conference abbreviations
export const CONFERENCES = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

// Game types
export const GAME_TYPES = {
  REGULAR_SEASON: "RS",
  CONFERENCE_CHAMPIONSHIP: "CC",
  NON_CONFERENCE: "NC",
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
} as const;

// Background class mappings for different game/conference combinations
export const BACKGROUND_CLASSES = {
  // Sunview intra-conference games
  RSSVSV: "bg-sunview-50/50",
  CCSVSV: "bg-sunview-50/50",

  // Hickory Hotel intra-conference games
  RSHHHH: "bg-hotel-50/50",
  CCHHHH: "bg-hotel-50/50",

  // Inter-conference games
  RSSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  NCSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  RSHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",
  NCHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",

  // Playoff games - Quarter Finals
  QFSVSV: "bg-orange-200/30",
  QFHHHH: "bg-orange-200/30",
  QFHHSV: "bg-orange-200/30",
  QFSVHH: "bg-orange-200/30",

  // Playoff games - Semi Finals
  SFSVSV: "bg-slate-200/30",
  SFHHHH: "bg-slate-200/30",
  SFHHSV: "bg-slate-200/30",
  SFSVHH: "bg-slate-200/30",

  // Playoff games - Finals
  FSVSV: "bg-yellow-200/30",
  FHHHH: "bg-yellow-200/30",
  FHHSV: "bg-yellow-200/30",
  FSVHH: "bg-yellow-200/30",

  // Losers Tournament
  LTSVSV: "bg-brown-200/40",
  LTHHHH: "bg-brown-200/40",
  LTHHSV: "bg-brown-200/40",
  LTSVHH: "bg-brown-200/40",
} as const;

// Default background class
export const DEFAULT_BACKGROUND_CLASS = "bg-gray-100";

// Ranking threshold for displaying team rankings
export const RANKING_DISPLAY_THRESHOLD = 8;

// Image dimensions
export const TEAM_LOGO_DIMENSIONS = {
  width: 64,
  height: 64,
} as const;
