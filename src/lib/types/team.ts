import type { AwardsList, SeasonType } from "./enums";
import type {
  PlayerAward,
  Conference,
  Contract,
  Franchise,
  GSHLTeam,
  NHLTeam,
  Owner,
  Player,
  PlayerCareerSplitStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  Season,
  TeamWeekStatLine,
} from "./database";

export type TeamRelations = {
  franchises?: Franchise[];
  conferences?: Conference[];
  owners?: Owner[];
};

export interface TeamPaletteCacheEntry {
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  palette: string[];
}

export interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
  avgR: number;
  avgG: number;
  avgB: number;
  saturation: number;
  brightness: number;
}

export type TeamPaletteResult = TeamPaletteCacheEntry;

export interface UseTeamColorResult {
  teamColor: string | null;
}

export interface TeamRosterProps {
  players: Player[] | undefined;
  contracts: Contract[];
  currentTeam: GSHLTeam;
  showSalaries?: boolean;
}

export interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface RosterLineupProps {
  teamLineup: Array<Array<Array<Player | null>>>;
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface RosterCapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  totalCapHit: number;
}

export type CapSpaceDisplayProps = RosterCapSpaceDisplayProps;

export type MatchupCategoryConfig = {
  field: keyof TeamWeekStatLine;
  label: string;
  isInverse?: boolean;
  precision?: number;
};

export interface TeamStatsRowProps {
  team?: GSHLTeam | null;
  teamStats: TeamWeekStatLine;
  opponentStats: TeamWeekStatLine;
  teamScore: number | null;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}

export interface MatchupStatsTableProps {
  selectedTeam: GSHLTeam | null;
  selectedTeamStats: TeamWeekStatLine;
  selectedTeamScore: number | null;
  opponentTeam: GSHLTeam | null;
  opponentStats: TeamWeekStatLine;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}

export interface RecordBookStatLine {
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

export type RecordBookStatKey = keyof RecordBookStatLine;

export interface FranchiseCareerRow extends RecordBookStatLine {
  playerId: string;
  seasonType: SeasonType;
  posGroup: string;
  nhlPos: string[];
  nhlTeam: string;
}

export interface FranchiseSeasonRow extends RecordBookStatLine {
  playerId: string;
  seasonId: string;
  seasonYear: number | string;
  seasonType: SeasonType;
  posGroup: string;
  nhlPos: string[];
  nhlTeam: string;
}

export interface RecordBookPlayerRow extends RecordBookStatLine {
  id: string;
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  positionGroup: string;
  seasonType: SeasonType;
  seasonId?: string;
  seasonYear?: number | string;
  seasonCount: number;
  firstSeason?: number | string;
  lastSeason?: number | string;
}

export interface RecordBookAwardRow {
  id: string;
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  seasonYear: number | string;
  award: AwardsList;
  awardLabel: string;
}

export type RecordBookView = "career" | "season" | "awards";
export type RecordBookGroup = "skater" | "goalie";
export type RecordBookSortDirection = "asc" | "desc";
export type RecordBookPlayerSortKey =
  | "playerName"
  | "positions"
  | "seasonYear"
  | "seasonCount"
  | RecordBookStatKey;
export type RecordBookAwardSortKey =
  | "playerName"
  | "positions"
  | "seasonYear"
  | "awardLabel";
export type RecordBookSortKey =
  | RecordBookPlayerSortKey
  | RecordBookAwardSortKey;

export interface RecordBookSortState {
  key: RecordBookSortKey;
  direction: RecordBookSortDirection;
}

export interface RecordBookStatColumn {
  key: RecordBookStatKey;
  label: string;
  title: string;
  precision?: number;
}

export type AllTimeRosterSlot = "C" | "LW" | "RW" | "D" | "G";

export interface AllTimeRosterEntry {
  slot: AllTimeRosterSlot;
  playerId: string;
  playerName: string;
  nhlTeam: NHLTeam | undefined;
  positions: string;
  row: FranchiseCareerRow;
}

export interface TeamRecordBookProps {
  playerAwards: PlayerAward[];
  allTeams: GSHLTeam[];
  careerSplits: PlayerCareerSplitStatLine[];
  currentTeam: GSHLTeam;
  nhlTeams: NHLTeam[];
  playerTotals: PlayerTotalStatLine[];
  players: Player[];
  seasonSplits: PlayerSplitStatLine[];
  seasons: Season[];
}

export interface BuildRecordBookPlayerRowsOptions {
  careerSplits: PlayerCareerSplitStatLine[];
  franchiseTeamIds: Set<string>;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
  playersById: Map<string, Player>;
  seasonSplits: PlayerSplitStatLine[];
  seasonsById: Map<string, number>;
}

export interface BuildRecordBookPlayerRowsResult {
  careerRows: RecordBookPlayerRow[];
  seasonRows: RecordBookPlayerRow[];
}

export interface BuildRecordBookAwardRowsOptions {
  allTeams: GSHLTeam[];
  currentTeam: GSHLTeam;
  nhlTeamsByAbbr: Map<string, NHLTeam>;
  playerAwards: PlayerAward[];
  playerTotals: PlayerTotalStatLine[];
  playersById: Map<string, Player>;
  seasonsById: Map<string, number>;
}

export interface RecordBookToolbarProps {
  awardCount: number;
  group: RecordBookGroup;
  onGroupChange: (group: RecordBookGroup) => void;
  onQueryChange: (query: string) => void;
  onSeasonTypeChange: (seasonType: SeasonType) => void;
  onViewChange: (view: RecordBookView) => void;
  playerCount: number;
  query: string;
  seasonType: SeasonType;
  seasonTypes: SeasonType[];
  view: RecordBookView;
}

export interface RecordBookSortableHeadProps {
  activeSort: RecordBookSortState;
  align?: "left" | "right";
  className?: string;
  label: string;
  onSort: (key: RecordBookSortKey) => void;
  sortKey: RecordBookSortKey;
  title?: string;
}

export interface RecordBookPlayerTableProps {
  columns: RecordBookStatColumn[];
  onSort: (key: RecordBookSortKey) => void;
  rows: RecordBookPlayerRow[];
  sort: RecordBookSortState;
  view: Exclude<RecordBookView, "awards">;
}

export interface RecordBookAwardsTableProps {
  onSort: (key: RecordBookSortKey) => void;
  rows: RecordBookAwardRow[];
  sort: RecordBookSortState;
}

export interface UseTeamRecordBookViewResult {
  awardRows: RecordBookAwardRow[];
  columns: RecordBookStatColumn[];
  group: RecordBookGroup;
  onGroupChange: (group: RecordBookGroup) => void;
  onSeasonTypeChange: (seasonType: SeasonType) => void;
  onSort: (key: RecordBookSortKey) => void;
  onViewChange: (view: RecordBookView) => void;
  playerRows: RecordBookPlayerRow[];
  query: string;
  seasonType: SeasonType;
  seasonTypes: SeasonType[];
  setQuery: (query: string) => void;
  sort: RecordBookSortState;
  view: RecordBookView;
}
