import type {
  GSHLTeam,
  Matchup,
  NHLTeam,
  Season,
  TeamAward,
  Week,
} from "./database";
import type { AwardsList, MatchupType } from "./enums";
import type { MatchupCategoryConfig } from "./team";
import type {
  WeeklyScheduleMatchupSummary,
  WeeklyScheduleTeamSummary,
} from "./weekly-schedule";
import type {
  TeamScheduleMatchupSummary,
  TeamScheduleTeamSummary,
  TeamScheduleWeekSummary,
} from "./team-schedule";

export interface LockerRoomHeaderProps {
  currentTeam: GSHLTeam;
  headingLevel?: 1 | 2;
}

export interface TeamLogoProps {
  currentTeam: GSHLTeam;
}

export interface NHLLogoProps {
  team: Pick<NHLTeam, "name" | "logoUrl"> | undefined;
  size?: number;
  className?: string;
}

export interface TeamInfoProps {
  currentTeam: GSHLTeam;
  formattedOwnerName: string;
  headingLevel?: 1 | 2;
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
  franchiseName: string | null;
}

export interface TrophyCaseAwardSection {
  awardKey: AwardsList;
  catalog: AwardCatalogEntry;
  cards: TrophyCaseCard[];
  winnerLabel: string;
  seasonRange: string;
}

export interface TrophyCupPosition {
  itemIndex: number;
  slotIndex: number;
  offsetRatio: number;
  translateY: number;
  scale: number;
  zIndex: number;
}

export interface TrophyCupShowcaseLayout {
  maxWidth: number;
  positions: TrophyCupPosition[];
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
  matchup: TeamScheduleMatchupSummary;
  week: TeamScheduleWeekSummary | null | undefined;
  teams: TeamScheduleTeamSummary[];
  selectedTeamId: string;
  categories: MatchupCategoryConfig[];
  matchupHref?: string;
}

export interface OpponentDisplayProps {
  matchup: TeamScheduleMatchupSummary;
  homeTeam: TeamScheduleTeamSummary | undefined;
  awayTeam: TeamScheduleTeamSummary | undefined;
  gameLocation: GameLocation;
}

export interface GameResultProps {
  matchup: TeamScheduleMatchupSummary;
  selectedTeamId: string;
  week: TeamScheduleWeekSummary | null | undefined;
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
  matchup: WeeklyScheduleMatchupSummary;
  teams: WeeklyScheduleTeamSummary[];
  matchupHref: string;
}

export interface TeamDisplayProps {
  team: WeeklyScheduleTeamSummary;
  rank: number | string | undefined;
  isAway?: boolean;
}

export interface ScoreDisplayProps {
  matchup: WeeklyScheduleMatchupSummary;
}

export type WeeklyGameType = "RS" | "CC" | "NC" | "QF" | "SF" | "F" | "LT";

export type ConferenceAbbr = "SV" | "HH";

export interface GameTypeConfig {
  label: string;
  color: string;
}
