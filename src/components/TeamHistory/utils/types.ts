// These types should match the actual types from your project
// I'm making assumptions based on the usage in the component

import type { GSHLTeam, Matchup, MatchupType, Season, Week } from "@gshl-types";

export type GameType = MatchupType;
export type WinLoss = "W" | "L" | "T";

export interface MatchupDataType {
  id: number;
  Season: number;
  WeekNum: number;
  GameType: GameType;
  HomeTeam: number;
  AwayTeam: number;
  HomeOwner: number;
  AwayOwner: number;
  HomeScore?: number;
  AwayScore?: number;
  HomeWL: WinLoss;
  AwayWL: WinLoss;
  HomeRank?: string;
  AwayRank?: string;
}

export interface TeamHistoryProps {
  teamInfo: GSHLTeam;
}

export interface FilterDropdownsProps {
  seasonValue: string;
  setSeasonValue: (value: string) => void;
  gameTypeValue: string;
  setGameTypeValue: (value: string) => void;
  ownerValue: string;
  setOwnerValue: (value: string) => void;
  seasonOptions: Season[] | undefined;
  gameTypeOptions: string[][];
  ownerOptions: string[][];
}

export interface RecordDisplayProps {
  winLossRecord: [number, number, number];
}

export interface MatchupListProps {
  schedule: (Matchup & {
    week: Week | undefined;
    season: Season | undefined;
  })[];
  teams: GSHLTeam[];
  teamInfo: GSHLTeam;
}

export interface TeamHistoryMatchupLineProps {
  matchup: Matchup & { week: Week | undefined; season: Season | undefined };
  teams: GSHLTeam[];
  teamInfo: GSHLTeam;
}
