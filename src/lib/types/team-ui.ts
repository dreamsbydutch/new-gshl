import type {
  GSHLTeam,
  Matchup,
  Player,
  PlayerWeekStatLine,
  Season,
  TeamAward,
  TeamWeekStatLine,
  Week,
} from "./database";
import type { AwardsList, MatchupType } from "./enums";
import type { MatchupCategoryConfig } from "./team";

export interface LockerRoomHeaderProps {
  currentTeam: GSHLTeam;
}

export interface TeamLogoProps {
  currentTeam: GSHLTeam;
}

export interface TeamInfoProps {
  currentTeam: GSHLTeam;
  formattedOwnerName: string;
}

export type AwardGroupKey = "TEAM TROPHIES" | "TIER 1 AWARDS" | "TIER 2 AWARDS";

export interface AwardCatalogEntry {
  key: AwardsList;
  group: AwardGroupKey;
  fullName: string;
  imageUrl: string;
  summaryLabel: string;
  sortOrder: number;
}

export interface TrophyCaseCard {
  id: string;
  award: TeamAward;
  catalog: AwardCatalogEntry;
  seasonYear: number | string;
  franchiseLogoUrl: string | null;
}

export interface TrophyCaseSummaryLine {
  awardKey: AwardsList;
  group: AwardGroupKey;
  sortOrder: number;
  text: string;
}

export interface TrophyCaseProps {
  teamAwards: TeamAward[];
  allTeams: GSHLTeam[];
  currentTeam: GSHLTeam;
  seasons: Season[];
}

export type TeamHistoryGameType = MatchupType;
export type WinLoss = "W" | "L" | "T";

export interface MatchupDataType {
  matchup: Matchup;
  matchupType: MatchupType;
  weekId: string;
  weekNumber: number;
  opponentId: string;
  opponentName: string;
  opponentAbbr: string;
  opponentLogo: string;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  result: WinLoss;
  isPlayoffs: boolean;
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

export interface TeamScheduleItemProps {
  matchup: Matchup;
  week: Week | undefined;
  teams: GSHLTeam[];
  selectedTeamId: string;
  categories: MatchupCategoryConfig[];
}

export interface OpponentDisplayProps {
  matchup: Matchup;
  homeTeam: GSHLTeam | undefined;
  awayTeam: GSHLTeam | undefined;
  gameLocation: GameLocation;
}

export interface GameResultProps {
  matchup: Matchup;
  selectedTeamId: string;
  week: Week | undefined;
}

export interface WeekDisplayProps {
  week: Week | undefined;
  gameType: string;
}

export type GameLocation = "HOME" | "AWAY";

export type TeamScheduleGameType = "QF" | "SF" | "F" | "LT" | "RS" | "CC";

export interface GameTypeDisplay {
  label: string | number | undefined;
  className: string;
}

export interface ConferenceConfig {
  name: string;
  abbr: string;
}

export interface WeekScheduleItemProps {
  matchup: Matchup;
  teams: GSHLTeam[];
  teamWeekStatsByTeam: Record<string, TeamWeekStatLine>;
  playerWeekStatsByTeam: Record<string, (PlayerWeekStatLine & Player)[]>;
  showPlusMinus?: boolean;
}

export interface TeamDisplayProps {
  team: GSHLTeam;
  rank: number | string | undefined;
  isAway?: boolean;
}

export interface ScoreDisplayProps {
  matchup: Matchup;
}

export type WeeklyGameType = "RS" | "CC" | "NC" | "QF" | "SF" | "F" | "LT";

export type ConferenceAbbr = "SV" | "HH";

export interface GameTypeConfig {
  label: string;
  color: string;
}
