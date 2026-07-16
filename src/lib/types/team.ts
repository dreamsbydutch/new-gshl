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
  playerAwards: PlayerAward[];
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
