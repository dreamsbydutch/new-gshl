import type {
  Contract,
  DraftPick,
  Franchise,
  GSHLTeam,
  Matchup,
  NHLTeam,
  Player,
  PlayerDayStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
  Season,
  TeamSeasonStatLine,
  TeamWeekStatLine,
  Week,
} from "./database";
import type { ProcessedDraftPick, StandingsGroup } from "./ui-components";
import type {
  ContractFilters,
  ContractSortOption,
  ContractSummary,
} from "./contracts";

export type QueryLike<TData> = {
  data: TData | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  error?: unknown;
};

export type QueryState = {
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
};

export interface QueryAdapterOptions<TData, TMapped> {
  fallback: TMapped;
  map?: (data: TData | undefined) => TMapped;
}

export interface UseAwardsOptions {
  awardId?: string;
  winnerId?: string;
  seasonId?: string;
  award?: string;
  enabled?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
}

export interface UseDraftPicksOptions {
  pickId?: string;
  seasonId?: string;
  teamId?: string;
  round?: number;
  enabled?: boolean;
}

export interface UseMatchupsOptions {
  matchupId?: string | null;
  weekId?: string | null;
  seasonId?: string | null;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export interface UsePlayersOptions {
  playerId?: string | null;
  teamId?: string | null;
  gshlTeamId?: string | null;
  position?: string | null;
  lineupPos?: string | null;
  nhlTeam?: string | null;
  isActive?: boolean;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
}

export type PlayerRankField = "overallRk" | "seasonRk" | "preDraftRk";

export interface UseRankedPlayersOptions extends UsePlayersOptions {
  rankField?: PlayerRankField;
  minRank?: number;
  maxRank?: number;
  limit?: number;
  sortDirection?: "asc" | "desc";
}

export interface UseRosterPlayersOptions
  extends Omit<UsePlayersOptions, "gshlTeamId" | "teamId"> {
  gshlTeamId?: string | null;
  includeInactive?: boolean;
  rankField?: PlayerRankField;
  limit?: number;
  minimumRosterSize?: number;
}

export interface UsePlayerStatsOptions {
  playerId?: string | null;
  seasonId?: string | null;
  weekId?: string | null;
  includeDaily?: boolean;
  includeWeekly?: boolean;
  includeSplits?: boolean;
  includeTotals?: boolean;
  enabled?: boolean;
}

export interface UsePlayerStatsResult {
  daily: PlayerDayStatLine[];
  weekly: PlayerWeekStatLine[];
  splits: PlayerSplitStatLine[];
  totals: PlayerTotalStatLine[];
  ready: boolean;
  status: QueryState;
  queries: {
    daily: QueryLike<PlayerDayStatLine[]>;
    weekly: QueryLike<PlayerWeekStatLine[]>;
    splits: QueryLike<PlayerSplitStatLine[]>;
    totals: QueryLike<PlayerTotalStatLine[]>;
  };
}

export interface UseSeasonsOptions {
  seasonId?: string | null;
  year?: number;
  active?: boolean;
  current?: boolean;
  referenceDate?: Date;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export interface UseSeasonStateOptions {
  autoSelect?: boolean;
  referenceDate?: Date;
}

export type WeekTimeMode = "current" | "previous" | "next";

export interface UseWeeksOptions {
  weekId?: string | null;
  seasonId?: string | null;
  isPlayoffs?: boolean;
  timeMode?: WeekTimeMode;
  referenceDate?: Date;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export type TeamStatsLevel = "none" | "daily" | "weekly" | "season";
export type TeamType = "gshl" | "nhl" | "franchise";

export interface UseTeamsOptions {
  teamId?: string | null;
  seasonId?: string | null;
  franchiseId?: string | null;
  conferenceId?: string | null;
  weekId?: string | null;
  date?: Date | string | null;
  ownerId?: string | null;
  isActive?: boolean;
  statsLevel?: TeamStatsLevel;
  teamType?: TeamType;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
}

export interface EnrichedFranchise extends Franchise {
  teams?: GSHLTeam[];
}

export interface ContractSelectionContext<T> {
  allContracts: Contract[];
  filteredContracts: Contract[];
  getContracts: <U = T>(options?: {
    filters?: ContractFilters;
    sort?: ContractSortOption;
    take?: number;
    map?: (contract: Contract) => U;
  }) => U[];
  deps: readonly unknown[];
}

export interface UseContractsOptions<T = Contract, S = undefined> {
  filters?: ContractFilters;
  sort?: ContractSortOption;
  take?: number;
  map?: (contract: Contract) => T;
  select?: (contracts: T[], context: ContractSelectionContext<T>) => S;
  selectDeps?: ReadonlyArray<unknown>;
  withSummary?: boolean;
  enabled?: boolean;
}

export interface UseContractDataOptions {
  currentSeason?: Season;
  currentTeam?: GSHLTeam;
  ownerId?: string;
  teams?: GSHLTeam[];
  allTeams?: GSHLTeam[];
  players?: Player[];
  nhlTeams?: NHLTeam[];
  seasons?: Season[];
  draftPicks?: DraftPick[];
  enabled?: boolean;
}

export interface CapSpaceEntry {
  label: string;
  year: number;
  remaining: number;
}

export interface FranchiseContractHistoryRowType {
  id: string;
  ownerId: string;
  playerName: string;
  season: string;
  type: string;
  length: number;
  salary: number;
  capHit: number;
  start: string;
  end: string;
  signingStatus: string;
  expiryStatus: string;
  buyoutEnd?: string;
  contractValue: number | null;
}

export type BuyoutContractType = Contract & {
  isActiveBuyout: boolean;
};

export interface FranchiseDraftPickRowType {
  draftPick: DraftPick;
  selectedPlayer?: Player;
  originalTeam?: GSHLTeam;
  seasonTeam?: GSHLTeam;
}

export interface FranchiseDraftPickGroupType {
  seasonId: string;
  seasonName: string;
  picks: FranchiseDraftPickRowType[];
}

export interface UseContractDataResult {
  table: {
    sortedContracts: Contract[];
    capSpaceWindow: CapSpaceEntry[];
    ready: boolean;
  };
  history: {
    rows: FranchiseContractHistoryRowType[];
    hasData: boolean;
  };
  draft: {
    groups: FranchiseDraftPickGroupType[];
    hasData: boolean;
  };
  currentContracts: Contract[];
  buyoutContracts: BuyoutContractType[];
  expiredRows: FranchiseContractHistoryRowType[];
  draftPickGroups: FranchiseDraftPickGroupType[];
  isLoading: boolean;
  error: Error | null;
}

export interface UseStandingsDataOptions {
  standingsType?: string;
  seasonId?: string;
}

export interface UseScheduleDataEnhancedMatchup extends Matchup {
  week: Week | undefined;
  season: Season | undefined;
}

export interface UseScheduleDataOptions {
  ownerID?: string;
  seasonID?: number;
  gameType?: string;
  oppOwnerID?: number;
  allMatchups?: Matchup[];
  teams?: GSHLTeam[];
  weeks?: Week[];
  seasons?: Season[];
}

export interface UseScheduleDataResult {
  data: UseScheduleDataEnhancedMatchup[];
  ready: boolean;
  isLoading: boolean;
  error: Error | null;
}

export interface UseSeasonMatchupsAndTeamsOptions {
  seasonId: string | null;
  weekId?: string | null;
}

export interface UseSeasonMatchupsAndTeamsResult {
  matchups: Matchup[];
  teams: GSHLTeam[];
  status: QueryState;
  matchupsQuery: QueryLike<Matchup[]>;
  teamsQuery: QueryLike<GSHLTeam[]>;
  isWeekScoped: boolean;
}

export interface UseDraftCountdownProps {
  draftDate: Date;
}

export interface DraftCountdownState {
  now: Date;
  isLive: boolean;
  isPast: boolean;
  countdown: string | null;
}

export interface UseFreeAgencyDataOptions {
  minRating?: number;
  sortDirection?: "asc" | "desc";
}

export interface UseDraftBoardDataOptions {
  seasonId: string;
  selectedType?: string | null;
}

export interface UseDraftAdminListOptions {
  seasonId?: string;
}

export interface DraftAdminListViewModel {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  draftingPlayerId: string | null;
  filteredFreeAgents: Player[];
  freeAgentsCount: number;
  nhlTeams: NHLTeam[];
  playersLoading: boolean;
  playersReady: boolean;
  activeDraftPick: DraftPick | null;
  activeDraftTeam: GSHLTeam | null;
  lastCompletedPlayer: Player | null;
  isDraftPending: boolean;
  isUndoPending: boolean;
  isPlayerUpdatePending: boolean;
  undoDisabled: boolean;
  handleDraftPlayer: (player: Player) => Promise<void>;
  handleUndoLastPick: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export interface UseTeamHistoryDataOptions {
  teamInfo: GSHLTeam;
}

export interface UseTeamRosterDataOptions {
  players?: Player[];
  contracts?: Contract[];
  currentTeam?: GSHLTeam;
}

export interface UseTeamRosterDataResult {
  currentRoster: Player[];
  teamLineup: Array<Array<Array<Player | null>>>;
  benchPlayers: Player[];
  totalCapHit: number;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseTeamDraftPickListDataOptions {
  teams?: GSHLTeam[];
  draftPicks?: DraftPick[];
  contracts?: Contract[];
  players?: Player[];
  seasons?: Season[];
  gshlTeamId?: string;
  selectedSeasonId?: string;
  allTeams?: GSHLTeam[];
}

export interface UseTeamDraftPickListDataResult {
  processedDraftPicks: ProcessedDraftPick[];
  ready: boolean;
  activeSeason?: Season;
  resolvedTeamId?: string;
  isLoading: boolean;
  error: Error | null;
}

export interface UseTeamScheduleEnhancedMatchup {
  matchup: Matchup;
  week: Week | undefined;
}

export interface UseTeamScheduleDataOptions {
  seasonId?: string | null;
  ownerId?: string | null;
}

export interface UseTeamScheduleDataResult {
  selectedSeasonId: string | null;
  selectedOwnerId: string | null;
  selectedTeam: GSHLTeam | null;
  matchups: UseTeamScheduleEnhancedMatchup[];
  teams: GSHLTeam[];
  weeks: Week[];
  allMatchups: Matchup[];
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseWeeklyScheduleDataOptions {
  seasonId?: string | null;
  weekId?: string | null;
}

export interface UseWeeklyScheduleDataResult {
  selectedSeasonId: string | null;
  selectedWeekId: string | null;
  matchups: Matchup[];
  teams: GSHLTeam[];
  teamWeekStats: TeamWeekStatLine[];
  teamWeekStatsByTeam: Record<string, TeamWeekStatLine>;
  playerWeekStatsByTeam: Record<string, (PlayerWeekStatLine & Player)[]>;
  allMatchups: Matchup[];
  isPrefetching: boolean;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseTeamHistoryDataResult {
  gameTypeValue: string;
  setGameTypeValue: (value: string) => void;
  seasonValue: string;
  setSeasonValue: (value: string) => void;
  ownerValue: string;
  setOwnerValue: (value: string) => void;
  gameTypeOptions: string[][];
  seasonOptions: Season[];
  ownerOptions: string[][];
  schedule: UseScheduleDataEnhancedMatchup[];
  teams: GSHLTeam[];
  fullSchedule: Matchup[];
  winLossRecord: [number, number, number];
  isDataReady: boolean;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export interface UseStandingsDataResult {
  selectedSeason: Season | null | undefined;
  selectedSeasonId: string | null | undefined;
  matchups: Matchup[];
  weeks: Week[];
  teams: GSHLTeam[];
  groups: StandingsGroup[];
  stats: TeamSeasonStatLine[];
  standingsType: string;
  isLoading: boolean;
  error: Error | null;
  ready: boolean;
}

export type { ContractFilters, ContractSortOption, ContractSummary };
