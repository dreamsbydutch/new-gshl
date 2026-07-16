import type {
  Contract,
  DraftPick,
  GSHLTeam,
  Matchup,
  NHLTeam,
  Player,
  PlayerWeekStatLine,
  Season,
  TeamSeasonStatLine,
  TeamWeekStatLine,
  Week,
} from "./database";
import type {
  BuyoutContractType,
  CapSpaceEntry,
  FranchiseContractHistoryRowType,
  FranchiseDraftPickGroupType,
} from "./contracts";
import type { ProcessedDraftPick } from "./draft-ui";
import type { TeamStatsLevel, UseTeamsOptions } from "./hook-core";
import type { QueryLike, QueryState } from "./hook-query";
import type { StandingsGroup } from "./standings";

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

export interface UseSeasonDataBundleOptions {
  seasonId?: string | null;
  weekId?: string | null;
  includeWeeks?: boolean;
  teamStatsLevel?: Exclude<TeamStatsLevel, "none"> | null;
  useNavigation?: boolean;
  weeksOrderBy?: Record<string, "asc" | "desc">;
  teamQueryOptions?: Partial<
    Pick<
      UseTeamsOptions,
      "staleTime" | "gcTime" | "refetchOnMount" | "refetchOnWindowFocus"
    >
  >;
}

export interface UseSeasonDataBundleResult<TTeamStats = never> {
  seasonId: string | null;
  weekId: string | null;
  matchups: Matchup[];
  teams: GSHLTeam[];
  weeks: Week[];
  teamStats: TTeamStats[];
  status: QueryState;
  ready: boolean;
  error: Error | null;
  matchupsQuery: QueryLike<Matchup[]>;
  teamsQuery: QueryLike<GSHLTeam[]>;
  weeksQuery?: QueryLike<Week[]>;
  teamStatsQuery?: QueryLike<TTeamStats[]>;
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
