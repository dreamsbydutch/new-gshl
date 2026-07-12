import type { AwardsList, SeasonType } from "./enums";
import type {
  Awards,
  GSHLTeam,
  NHLTeam,
  Player,
  PlayerCareerSplitStatLine,
  PlayerTotalStatLine,
  Season,
} from "./database";

export interface FranchiseCareerRow {
  playerId: string;
  seasonType: SeasonType;
  posGroup: string;
  nhlPos: string[];
  nhlTeam: string;
  days: number;
  GP: number;
  GS: number;
  G: number;
  A: number;
  P: number;
  PM: number;
  PIM: number;
  PPP: number;
  SOG: number;
  HIT: number;
  BLK: number;
  W: number;
  GA: number;
  SV: number;
  SA: number;
  SO: number;
  TOI: number;
  GAA: number | null;
  SVP: number | null;
}

export type RecordStatKey =
  | "days"
  | "GP"
  | "G"
  | "A"
  | "P"
  | "PM"
  | "PIM"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "W"
  | "SV"
  | "SO"
  | "GAA"
  | "SVP";

export interface AwardSummaryRow {
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  totalAwards: number;
  firstTeamAllStars: number;
  secondTeamAllStars: number;
  playoffAllStars: number;
  latestYear: number | string;
  breakdown: string;
}

export interface RecordLeader {
  key: string;
  label: string;
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  displayValue: string;
  note?: string;
}

export interface TeamRecordBookProps {
  allAwards: Awards[];
  allTeams: GSHLTeam[];
  careerSplits: PlayerCareerSplitStatLine[];
  currentTeam: GSHLTeam;
  nhlTeams: NHLTeam[];
  playerTotals: PlayerTotalStatLine[];
  players: Player[];
  seasons: Season[];
}

export interface PlayerAwardBreakdown {
  playerId: string;
  counts: Map<AwardsList, number>;
  totalAwards: number;
  firstTeamAllStars: number;
  secondTeamAllStars: number;
  playoffAllStars: number;
  latestYear: number | string;
}
