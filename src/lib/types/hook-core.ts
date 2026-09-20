import type {
  Franchise,
  GSHLTeam,
  PlayerDayStatLine,
  PlayerSplitStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
} from "./database";
import type { ContractFilters, ContractSortOption } from "./contracts";
import type { ReadQueryResult, QueryState } from "./hook-query";

export interface UseAwardsOptions {
  awardId?: string;
  winnerId?: string;
  seasonId?: string;
  award?: string;
  enabled?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
}

export interface UsePlayerAwardsOptions {
  playerId?: string;
  seasonId?: string;
  award?: string;
  enabled?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
}

export interface UseTeamAwardsOptions {
  teamId?: string;
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
  ownerId?: string | null;
  position?: string | null;
  lineupPos?: string | null;
  nhlTeam?: string | null;
  isActive?: boolean;
  enabled?: boolean;
}

export interface UsePlayerPagesOptions {
  active?: boolean;
  positionGroup?: string;
  enabled?: boolean;
  limit?: number;
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
  extends Omit<UsePlayersOptions, "ownerId"> {
  ownerId?: string | null;
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
    daily: ReadQueryResult<PlayerDayStatLine[]>;
    weekly: ReadQueryResult<PlayerWeekStatLine[]>;
    splits: ReadQueryResult<PlayerSplitStatLine[]>;
    totals: ReadQueryResult<PlayerTotalStatLine[]>;
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

export interface UseTeamsOptions {
  teamId?: string | null;
  seasonId?: string | null;
  franchiseId?: string | null;
  conferenceId?: string | null;
  ownerId?: string | null;
  isActive?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export interface UseNHLTeamsOptions {
  teamId?: string | null;
  isActive?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export interface UseFranchisesOptions extends UseNHLTeamsOptions {
  ownerId?: string | null;
}

export interface UseTeamSeasonStatsOptions {
  teamId?: string | null;
  seasonId?: string | null;
  seasonType?: string | null;
  orderBy?: Record<string, "asc" | "desc">;
  enabled?: boolean;
}

export interface UseTeamWeekStatsOptions extends UseTeamSeasonStatsOptions {
  weekId?: string | null;
}

export interface UseTeamDayStatsOptions extends UseTeamSeasonStatsOptions {
  date?: Date | string | null;
}

export interface EnrichedFranchise extends Franchise {
  teams?: GSHLTeam[];
}

export interface UseContractsOptions {
  filters?: ContractFilters;
  sort?: ContractSortOption;
  take?: number;
  enabled?: boolean;
}
