import type {
  AwardsList as AwardsListType,
  ContractStatus as ContractStatusType,
  ContractType as ContractTypeType,
  EventType as EventTypeType,
  MatchupType as MatchupTypeType,
  PlayerPosition as PlayerPositionType,
  PositionGroup as PositionGroupType,
  ResignableStatus as ResignableStatusType,
  RosterPosition as RosterPositionType,
  SeasonType as SeasonTypeType,
  StatCategory,
} from "@gshl-types";

export const RosterPosition = {
  BN: "BN",
  IR: "IR",
  IRplus: "IRplus",
  LW: "LW",
  C: "C",
  RW: "RW",
  D: "D",
  G: "G",
  Util: "Util",
} as const satisfies Record<string, RosterPositionType>;

export const ResignableStatus = {
  DRAFT: "DRAFT",
  RFA: "RFA",
  UFA: "UFA",
} as const satisfies Record<string, ResignableStatusType>;

export const PositionGroup = {
  F: "F",
  D: "D",
  G: "G",
  TEAM: "TEAM",
} as const satisfies Record<string, PositionGroupType>;

export const SeasonType = {
  REGULAR_SEASON: "RS",
  PLAYOFFS: "PO",
  LOSERS_TOURNAMENT: "LT",
} as const satisfies Record<string, SeasonTypeType>;

export const MatchupType = {
  CONFERENCE: "CC",
  NON_CONFERENCE: "NC",
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
} as const satisfies Record<string, MatchupTypeType>;

export const PlayerPosition = {
  CENTER: "C",
  LEFT_WING: "LW",
  RIGHT_WING: "RW",
  DEFENSE: "D",
  GOALIE: "G",
} as const satisfies Record<string, PlayerPositionType>;

export const EventType = {
  DRAFT: "DRAFT",
  SUMMER_MEETINGS: "MEETINGS",
} as const satisfies Record<string, EventTypeType>;

export const ContractType = {
  STANDARD: "STANDARD",
  EXTENSION: "EXTENSION",
} as const satisfies Record<string, ContractTypeType>;

export const ContractStatus = {
  DRAFTED: "Drafted",
  RFA: "RFA",
  UFA: "UFA",
  TRADE: "Trade",
  BUYOUT: "Buyout",
  RETIRED: "Retired",
  INJURED: "Injured",
} as const satisfies Record<string, ContractStatusType>;

export const SALARY_CAP = 25_000_000;

export const STAT_CATEGORIES = {
  FORWARD: ["G", "A", "P", "SOG", "HIT", "BLK", "PPP", "PM", "PIM"],
  DEFENSE: ["G", "A", "P", "SOG", "HIT", "BLK", "PPP", "PM", "PIM"],
  GOALIE: ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"],
} as const satisfies Record<string, readonly StatCategory[]>;

export const AwardsList = {
  HART: "hart",
  ROCKET: "rocket",
  ART_ROSS: "artRoss",
  SELKE: "selke",
  VEZINA: "vezina",
  NORRIS: "norris",
  CALDER: "calder",
  GM_OF_THE_YEAR: "gmoy",
  JACK_ADAMS: "jackAdams",
  LADY_BYNG: "ladyByng",
  GSHL_CUP: "gshlCup",
  BROPHY: "brophy",
  PRESIDENT: "president",
  SUNVIEW: "sunview",
  HICKORY: "hickory",
  FIRST_AS: "firstAS",
  SECOND_AS: "secondAS",
  PLAYOFF_AS: "playoffAS",
  CROSBY: "crosby",
  ORR: "orr",
  BRODEUR: "brodeur",
  GRETZKY: "gretzky",
  OVECHKIN: "ovechkin",
} as const satisfies Record<string, AwardsListType>;
