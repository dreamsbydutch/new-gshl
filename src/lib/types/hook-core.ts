import type {
  Contract,
  Franchise,
  GSHLTeam,
  PlayerDayStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
} from "./database";
import type { ContractFilters, ContractSortOption } from "./contracts";
import type { QueryLike, QueryState } from "./hook-query";

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
