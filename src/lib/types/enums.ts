// Enums and constants used throughout the application

export enum RosterPosition {
  BN = "BN",
  IR = "IR",
  IRplus = "IRplus",
  LW = "LW",
  C = "C",
  RW = "RW",
  D = "D",
  G = "G",
  Util = "Util",
}

export enum ResignableStatus {
  DRAFT = "DRAFT",
  RFA = "RFA",
  UFA = "UFA",
}

export enum PositionGroup {
  F = "F",
  D = "D",
  G = "G",
  TEAM = "TEAM", // Team-level stats (not individual player)
}

export enum SeasonType {
  REGULAR_SEASON = "RS",
  PLAYOFFS = "PO",
  LOSERS_TOURNAMENT = "LT",
}

export enum MatchupType {
  CONFERENCE = "CC",
  NON_CONFERENCE = "NC",
  QUATER_FINAL = "QF",
  SEMI_FINAL = "SF",
  FINAL = "F",
  LOSERS_TOURNAMENT = "LT",
}

export enum PlayerPosition {
  CENTER = "C",
  LEFT_WING = "LW",
  RIGHT_WING = "RW",
  DEFENSE = "D",
  GOALIE = "G",
}

export enum EventType {
  DRAFT = "DRAFT",
  SUMMER_MEETINGS = "MEETINGS",
}

export enum ContractType {
  STANDARD = "STANDARD",
  EXTENSION = "EXTENSION",
}
export enum ContractStatus {
  DRAFTED = "Drafted",
  RFA = "RFA",
  UFA = "UFA",
  BUYOUT = "Buyout",
  RETIRED = "Retired",
  INJURED = "Injured",
}

export const SALARY_CAP = 25_000_000;

export const STAT_CATEGORIES = {
  FORWARD: ["G", "A", "P", "SOG", "HIT", "BLK", "PPP", "PM", "PIM"],
  DEFENSE: ["G", "A", "P", "SOG", "HIT", "BLK", "PPP", "PM", "PIM"],
  GOALIE: ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"],
} as const;

export type StatCategory =
  (typeof STAT_CATEGORIES)[keyof typeof STAT_CATEGORIES][number];

export enum AwardsList {
  "HART" = "Hart",
  "ROCKET" = "Rocket",
  "ART_ROSS" = "Art Ross",
  "LOSER" = "Loser",
  "PRESIDENTS_TROPHY" = "Presidents Trophy",
  "GSHL_CUP" = "GSHL Cup",
  "TWO_SEVEN_SIX" = "Two Seven Six",
  "UNIT_FOUR" = "Unit Four",
  "VEZINA" = "Vezina",
  "NORRIS" = "Norris",
  "CALDER" = "Calder",
  "SELKE" = "Selke",
  "LADY_BYNG" = "Lady Byng",
  "CONN_SMYTHE" = "Conn Smythe",
  "JACK_ADAMS" = "Jack Adams",
  "GM_OF_THE_YEAR" = "GMOY",
}
