/**
 * @fileoverview UI Component Type Definitions
 *
 * This module contains all type definitions for UI components,
 * including props interfaces for feature components.
 *
 * @module types/ui-components
 */

import type {
  Contract,
  DraftPick,
  GSHLTeam,
  Matchup,
  Player,
  Season,
  NHLTeam,
  TeamSeasonStatLine,
  Week,
  TeamWeekStatLine,
  Franchise,
  PlayerWeekStatLine,
} from "./database";
import type { MatchupType, RosterPosition } from "./enums";
import type { ToggleItem } from "./nav";

/* ============================================================================
 * CONTRACT TABLE TYPES
 * ========================================================================= */

/**
 * ContractTableProps
 * All props optional at first render; component shows skeleton until hook marks ready.
 */
export interface ContractTableProps {
  currentSeason: Season | undefined;
  players: Player[];
  nhlTeams: NHLTeam[];
  contracts: Contract[];
  currentTeam: GSHLTeam;
  sortedContracts: Contract[];
  capSpaceWindow: { label: string; year: number; remaining: number }[];
  ready: boolean;
}

/** Props for an individual player contract line item. */
export interface PlayerContractRowProps {
  contract: Contract;
  player?: Player;
  currentSeason: Season;
  nhlTeams: NHLTeam[];
}

/** Props for the dynamic header row. */
export interface TableHeaderProps {
  currentSeason: Season;
}

/** Props for the cap space summary row. */
export interface CapSpaceRowProps {
  currentTeam: GSHLTeam;
  capSpaceWindow: { label: string; year: number; remaining: number }[];
}

/* ============================================================================
 * DRAFT BOARD LIST TYPES
 * ========================================================================= */

export interface DraftBoardToolbarProps {
  toolbarKeys: ToggleItem<string | null>[];
  activeKey: string | null;
  className?: [string?, string?, string?];
}

/**
 * Allow for legacy single-position string as well as current array form
 */
export type DraftBoardPlayer = Player & {
  nhlPos: RosterPosition[] | RosterPosition;
};

/* ============================================================================
 * LOCKER ROOM HEADER TYPES
 * ========================================================================= */

/**
 * Props for the LockerRoomHeader orchestrator component.
 */
export interface LockerRoomHeaderProps {
  currentTeam: GSHLTeam;
}

/**
 * Props for the TeamLogo presentational component.
 */
export interface TeamLogoProps {
  currentTeam: GSHLTeam;
}

/**
 * Props for the TeamInfo presentational component.
 */
export interface TeamInfoProps {
  currentTeam: GSHLTeam;
  formattedOwnerName: string;
}

/* ============================================================================
 * STANDINGS CONTAINER TYPES
 * ========================================================================= */

export type StandingsType = "overall" | "conference" | "wildcard";

export type StandingsOption =
  | "Overall"
  | "Conference"
  | "Wildcard"
  | "LosersTourney";

export interface StandingsGroup {
  title: string;
  teams: (GSHLTeam & {
    franchise?: Franchise;
    seasonStats?: TeamSeasonStatLine;
  })[];
}

export interface StandingsContainerProps {
  standingsType: string;
}

export interface StandingsItemProps {
  team: GSHLTeam & { franchise?: Franchise; seasonStats?: TeamSeasonStatLine };
  season: Season;
  standingsType: string;
  matchups?: Matchup[];
  weeks?: Week[];
}

export interface StandingsTeamInfoProps {
  teamProb: PlayoffProbType;
  standingsType: StandingsOption;
}

export interface PlayoffProbType {
  OneSeed: number;
  TwoSeed: number;
  ThreeSeed: number;
  FourSeed: number;
  FiveSeed: number;
  SixSeed: number;
  SevenSeed: number;
  EightSeed: number;
  NineSeed: number;
  TenSeed: number;
  ElevenSeed: number;
  TwelveSeed: number;
  ThirteenSeed: number;
  FourteenSeed: number;
  FifteenSeed: number;
  SixteenSeed: number;
  OneConf: number;
  TwoConf: number;
  ThreeConf: number;
  FourConf: number;
  FiveConf: number;
  SixConf: number;
  SevenConf: number;
  EightConf: number;
  PlayoffsPer: number;
  LoserPer: number;
  SFPer: number;
  FinalPer: number;
  CupPer: number;
  "1stPickPer": number;
  "3rdPickPer": number;
  "4thPickPer": number;
  "8thPickPer": number;
}

/* ============================================================================
 * TEAM DRAFT PICK LIST TYPES
 * ========================================================================= */

export interface TeamDraftPickListProps {
  teams: GSHLTeam[];
  allTeams: GSHLTeam[];
  draftPicks: DraftPick[] | undefined;
  contracts: Contract[];
  players: Player[] | undefined;
  seasons?: Season[];
  gshlTeamId: string;
  selectedSeasonId: string;
}

export interface ProcessedDraftPick {
  draftPick: DraftPick;
  originalTeam: GSHLTeam | undefined;
  isAvailable: boolean;
  selectedPlayer: Player | undefined;
}

export interface DraftPickItemProps {
  processedPick: ProcessedDraftPick;
  teams: GSHLTeam[];
}

/* ============================================================================
 * TEAM HISTORY TYPES
 * ========================================================================= */

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

/* ============================================================================
 * TEAM ROSTER TYPES
 * ========================================================================= */

export interface TeamRosterProps {
  players: Player[] | undefined;
  contracts: Contract[];
  currentTeam: GSHLTeam;
}

export interface PlayerCardProps {
  player: Player;
  nhlTeam?: NHLTeam;
}

export interface BenchPlayersProps {
  players: Player[];
  nhlTeams: NHLTeam[];
}

export interface RosterLineupProps {
  teamLineup: (Player | null)[][][];
  contracts: Contract[];
  showSalaries: boolean;
}

export interface RosterCapSpaceDisplayProps {
  capSpace: number;
  capCeiling: number;
}

/* ============================================================================
 * TEAM SCHEDULE TYPES
 * ========================================================================= */

export interface TeamScheduleItemProps {
  matchup: Matchup;
  week: Week | undefined;
  teams: GSHLTeam[];
  selectedTeamId: string;
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

/* ============================================================================
 * WEEKLY SCHEDULE TYPES
 * ========================================================================= */

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
