export type RosterPosition =
  | "BN"
  | "IR"
  | "IRplus"
  | "LW"
  | "C"
  | "RW"
  | "D"
  | "G"
  | "Util";

export type ResignableStatus = "DRAFT" | "RFA" | "UFA";

export type PositionGroup = "F" | "D" | "G" | "TEAM";

export type SeasonType = "RS" | "PO" | "LT";

export type MatchupType = "CC" | "NC" | "QF" | "SF" | "F" | "LT";

export type PlayerPosition = "C" | "LW" | "RW" | "D" | "G";

export type EventType = "DRAFT" | "MEETINGS";

export type ContractType = "STANDARD" | "EXTENSION";

export type ContractStatus =
  | "Drafted"
  | "RFA"
  | "UFA"
  | "Trade"
  | "Buyout"
  | "Retired"
  | "Injured";

export type StatCategory =
  | "G"
  | "A"
  | "P"
  | "SOG"
  | "HIT"
  | "BLK"
  | "PPP"
  | "PM"
  | "PIM"
  | "W"
  | "GA"
  | "GAA"
  | "SV"
  | "SA"
  | "SVP"
  | "SO";

export type AwardsList =
  | "hart"
  | "rocket"
  | "artRoss"
  | "selke"
  | "vezina"
  | "norris"
  | "calder"
  | "gmoy"
  | "jackAdams"
  | "ladyByng"
  | "gshlCup"
  | "brophy"
  | "president"
  | "sunview"
  | "hickory"
  | "firstAS"
  | "secondAS"
  | "playoffAS"
  | "crosby"
  | "orr"
  | "brodeur"
  | "gretzky"
  | "ovechkin";
