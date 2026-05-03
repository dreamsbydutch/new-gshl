"use client";

import { useCallback, useMemo } from "react";
import {
  type Contract,
  type DraftPick,
  type GSHLTeam,
  type NHLTeam,
  type Player,
  type Season,
  ContractStatus,
} from "@gshl-types";
import {
  applyContractFilters,
  sortContracts,
  mergeContractFilters,
  computeContractSummary,
  identity,
  getContractDedupeKey,
  CAP_CEILING,
  CAP_SEASON_END_DAY,
  CAP_SEASON_END_MONTH,
  formatDate,
  toNumber,
} from "@gshl-utils";
import type { ContractFilters, ContractSortOption } from "@gshl-utils";
import { api } from "@gshl-trpc/react";

export type {
  ContractFilters,
  ContractSortOption,
  ContractSummary,
} from "@gshl-utils";

const EMPTY_CONTRACTS: Contract[] = Object.freeze([]) as unknown as Contract[];
const DEFAULT_SELECT_DEPS: readonly unknown[] = Object.freeze([]);

type ScopedOptions<U> = {
  filters?: ContractFilters;
  sort?: ContractSortOption;
  take?: number;
  map?: (contract: Contract) => U;
};

export interface ContractSelectionContext<T> {
  allContracts: Contract[];
  filteredContracts: Contract[];
  getContracts: <U = T>(options?: ScopedOptions<U>) => U[];
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

/**
 * Hook for fetching and filtering contracts with advanced options.
 *
 * This hook provides comprehensive contract filtering, sorting, mapping, and selection
 * capabilities with client-side data transformation and aggregation.
 *
 * @template T - Resulting item shape after applying the optional `map` transform
 * @template S - Derived selection return value produced by the optional `select` callback
 * @param options - Configuration object controlling how the contract list is transformed
 * @returns React Query state combined with transformed data and helper utilities
 *
 * @example
 * ```tsx
 * // Fetch all contracts
 * const { data: contracts, isLoading } = useContracts();
 *
 * // Filter contracts by player
 * const { data: contracts } = useContracts({
 *   filters: { playerIds: 'player-123' },
 * });
 *
 * // Filter active contracts only
 * const { data: activeContracts } = useContracts({
 *   filters: { activeOnly: true },
 * });
 *
 * // Filter and sort contracts
 * const { data: contracts } = useContracts({
 *   filters: { seasonIds: 'season-456' },
 *   sort: { by: 'capHit', direction: 'desc' },
 * });
 *
 * // Get contract summary
 * const { data: contracts, summary } = useContracts({
 *   filters: { activeOnly: true },
 *   withSummary: true,
 * });
 *
 * // Map contracts to custom shape
 * const { data: simplified } = useContracts({
 *   map: (contract) => ({
 *     id: contract.id,
 *     player: contract.playerId,
 *     salary: contract.contractSalary,
 *   }),
 * });
 *
 * // Advanced selection with context
 * const { selection } = useContracts({
 *   filters: { seasonIds: 'season-456' },
 *   select: (contracts, context) => ({
 *     byPlayer: groupBy(contracts, 'playerId'),
 *     total: context.filteredContracts.length,
 *   }),
 * });
 * ```
 */
export function useContracts<T = Contract, S = undefined>(
  options: UseContractsOptions<T, S> = {},
) {
  const {
    filters,
    sort,
    take,
    map,
    select,
    selectDeps = DEFAULT_SELECT_DEPS,
    withSummary,
    enabled,
  } = options;

  const queryOptions = enabled === undefined ? undefined : { enabled };
  const { data: queryData, ...queryRest } = api.contract.getAll.useQuery(
    {},
    queryOptions,
  );

  const rawContracts = queryData ?? EMPTY_CONTRACTS;

  const filteredContracts = useMemo(
    () => applyContractFilters(rawContracts, filters),
    [rawContracts, filters],
  );

  const sortedContracts = useMemo(
    () => sortContracts(filteredContracts, sort),
    [filteredContracts, sort],
  );

  const limitedContracts = useMemo(() => {
    if (typeof take === "number") {
      return sortedContracts.slice(0, take);
    }
    return sortedContracts;
  }, [sortedContracts, take]);

  const finalData = useMemo(() => {
    if (map) return limitedContracts.map(map);
    return limitedContracts as unknown as T[];
  }, [limitedContracts, map]);

  const summary = useMemo(() => {
    if (!withSummary) return undefined;
    return computeContractSummary(limitedContracts);
  }, [limitedContracts, withSummary]);

  const getContracts = useCallback(
    <U = T>({
      filters: scopedFilters,
      sort: scopedSort,
      take: scopedTake,
      map: scopedMap,
    }: ScopedOptions<U> = {}): U[] => {
      const mergedFilters = mergeContractFilters(filters, scopedFilters);
      const base = applyContractFilters(rawContracts, mergedFilters);
      const ordered = sortContracts(base, scopedSort ?? sort);
      const sliced =
        typeof scopedTake === "number"
          ? ordered.slice(0, scopedTake)
          : typeof take === "number"
            ? ordered.slice(0, take)
            : ordered;
      const mapper =
        scopedMap ??
        (map as unknown as ((contract: Contract) => U) | undefined) ??
        (identity as unknown as (contract: Contract) => U);
      return sliced.map(mapper);
    },
    [filters, rawContracts, sort, take, map],
  );

  const selection = useMemo(() => {
    if (!select) return undefined;
    return select(finalData, {
      allContracts: rawContracts,
      filteredContracts: limitedContracts,
      getContracts,
      deps: selectDeps,
    });
  }, [
    select,
    finalData,
    rawContracts,
    limitedContracts,
    getContracts,
    selectDeps,
  ]);

  return {
    ...queryRest,
    data: finalData,
    allContracts: rawContracts,
    filteredContracts: limitedContracts,
    summary,
    selection,
    getContracts,
  } as const;
}

/**
 * Convenience wrapper around {@link useContracts} for fetching all contracts.
 * Provides backward compatibility for components expecting simple contract list.
 *
 * @returns React Query state combined with contract data and helper utilities
 */
export function useAllContracts<T = Contract, S = undefined>(
  options?: UseContractsOptions<T, S>,
) {
  return useContracts(options);
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
  /** When false, skips fetching contracts from the server. Defaults to true. */
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

export function useContractData(
  options: UseContractDataOptions = {},
): UseContractDataResult {
  const {
    ownerId,
    currentSeason,
    currentTeam,
    teams,
    allTeams,
    players,
    nhlTeams,
    seasons,
    draftPicks,
    enabled = true,
  } = options;

  const {
    data: contracts,
    isLoading: contractsLoading,
    error: contractsError,
  } = useAllContracts({ enabled });
  const currentOwnerId = ownerId
    ? String(ownerId)
    : currentTeam?.ownerId
      ? String(currentTeam.ownerId)
      : null;
  const currentFranchiseId = currentTeam?.franchiseId
    ? String(currentTeam.franchiseId)
    : null;
  const activeSeasonEndYear = useMemo(
    () => getSeasonEndYear(currentSeason),
    [currentSeason],
  );
  const teamPool = useMemo(() => allTeams ?? teams ?? [], [allTeams, teams]);

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players?.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player);
      }
    });
    return map;
  }, [players]);

  const franchiseById = useMemo(() => {
    const map = new Map<string, GSHLTeam>();
    teamPool.forEach((team) => {
      if (team.franchiseId) {
        map.set(String(team.franchiseId), team);
      }
    });
    return map;
  }, [teamPool]);

  const teamById = useMemo(() => {
    const map = new Map<string, GSHLTeam>();
    teamPool.forEach((team) => {
      if (team.id) {
        map.set(String(team.id), team);
      }
    });
    return map;
  }, [teamPool]);

  const seasonById = useMemo(() => {
    const map = new Map<string, Season>();
    seasons?.forEach((season) => {
      map.set(String(season.id), season);
    });
    return map;
  }, [seasons]);

  const {
    data: playerNhlStatLines = [],
    isLoading: playerNhlStatsLoading,
    error: playerNhlStatsError,
  } = api.playerStats.nhl.getAll.useQuery(
    {},
    {
      enabled,
      staleTime: 5 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  );

  const ownerContracts = useMemo(() => {
    if (!currentOwnerId) return [] as Contract[];
    return dedupeContracts(
      (contracts ?? []).filter(
        (contract) => String(contract.ownerId) === currentOwnerId,
      ),
    );
  }, [contracts, currentOwnerId]);

  const franchiseRelevantContracts = useMemo(
    () => dedupeContracts(ownerContracts),
    [ownerContracts],
  );

  const relevantPlayerIds = useMemo(() => {
    return new Set(
      franchiseRelevantContracts
        .map((contract) => String(contract.playerId ?? ""))
        .filter(Boolean),
    );
  }, [franchiseRelevantContracts]);

  const relevantSeasonEndYears = useMemo(() => {
    const years = new Set<number>();
    franchiseRelevantContracts.forEach((contract) => {
      getContractActiveSeasonEndYears(contract, seasonById).forEach((year) => {
        years.add(year);
      });
    });
    return years;
  }, [franchiseRelevantContracts, seasonById]);

  const nhlSalaryByPlayerSeasonEndYear = useMemo(() => {
    const map = new Map<string, number>();

    playerNhlStatLines.forEach((row) => {
      const playerId = String(row.playerId ?? "");
      if (!playerId || !relevantPlayerIds.has(playerId)) return;

      const season = seasonById.get(String(row.seasonId));
      const seasonEndYear = getSeasonEndYear(season);
      if (
        seasonEndYear === null ||
        !relevantSeasonEndYears.has(seasonEndYear)
      ) {
        return;
      }

      map.set(
        getPlayerSeasonValueKey(playerId, seasonEndYear),
        toNumber(row.salary, 0),
      );
    });

    return map;
  }, [
    playerNhlStatLines,
    relevantPlayerIds,
    relevantSeasonEndYears,
    seasonById,
  ]);

  const currentContracts = useMemo(() => {
    return ownerContracts
      .filter((contract) =>
        shouldDisplayInCurrentContracts(
          contract,
          currentSeason,
          activeSeasonEndYear,
        ),
      )
      .sort((a, b) => toNumber(b.capHit, 0) - toNumber(a.capHit, 0));
  }, [ownerContracts, currentSeason, activeSeasonEndYear]);

  const activeCurrentContracts = useMemo(() => {
    return ownerContracts.filter((contract) =>
      hasCurrentOrFutureCapImpact(contract, activeSeasonEndYear),
    );
  }, [ownerContracts, activeSeasonEndYear]);

  const buyoutContracts = useMemo(() => {
    return ownerContracts
      .filter((contract) => contract.expiryStatus === ContractStatus.BUYOUT)
      .map((contract) => ({
        ...contract,
        isActiveBuyout: hasCurrentOrFutureCapImpact(
          contract,
          activeSeasonEndYear,
        ),
      }))
      .sort((a, b) => {
        if (a.isActiveBuyout !== b.isActiveBuyout) {
          return a.isActiveBuyout ? -1 : 1;
        }
        return toNumber(b.capHit, 0) - toNumber(a.capHit, 0);
      });
  }, [ownerContracts, activeSeasonEndYear]);

  const sortedContracts = useMemo(() => {
    return [...currentContracts];
  }, [currentContracts]);

  const capSpaceWindow = useMemo(() => {
    const seasonStartYear = activeSeasonEndYear ?? new Date().getFullYear();
    const dataset = sortedContracts;

    const calcRemaining = (year: number) => {
      const cutoffDate = new Date(
        year,
        CAP_SEASON_END_MONTH,
        CAP_SEASON_END_DAY,
      );
      const active = dataset.filter(
        (c) =>
          new Date(c.capHitEndDate) >= cutoffDate &&
          !(new Date(c.startDate) > cutoffDate),
      );
      const total = active.reduce((sum, c) => sum + toNumber(c.capHit, 0), 0);
      return CAP_CEILING - total;
    };

    return Array.from({ length: 5 }).map((_, idx) => {
      const year = seasonStartYear + idx;
      return {
        label: `${year}`,
        year,
        remaining: calcRemaining(year),
      };
    });
  }, [sortedContracts, activeSeasonEndYear]);

  const activeCurrentContractKeys = useMemo(
    () => new Set(activeCurrentContracts.map(getContractUniqueKey)),
    [activeCurrentContracts],
  );
  const activeBuyoutContractKeys = useMemo(
    () =>
      new Set(
        buyoutContracts
          .filter((contract) => contract.isActiveBuyout)
          .map(getContractUniqueKey),
      ),
    [buyoutContracts],
  );

  const expiredRows = useMemo(() => {
    if (!currentOwnerId) return [] as FranchiseContractHistoryRowType[];

    return franchiseRelevantContracts
      .filter((contract) => {
        const key = getContractUniqueKey(contract);
        return (
          !activeCurrentContractKeys.has(key) &&
          !activeBuyoutContractKeys.has(key)
        );
      })
      .sort((a, b) => {
        const signingDateDelta =
          new Date(b.signingDate).getTime() - new Date(a.signingDate).getTime();
        if (!Number.isNaN(signingDateDelta) && signingDateDelta !== 0) {
          return signingDateDelta;
        }
        return toNumber(b.contractSalary, 0) - toNumber(a.contractSalary, 0);
      })
      .map((contract) =>
        createHistoryRow(
          contract,
          playerById,
          seasonById,
          nhlSalaryByPlayerSeasonEndYear,
        ),
      );
  }, [
    activeCurrentContractKeys,
    activeBuyoutContractKeys,
    currentOwnerId,
    franchiseRelevantContracts,
    nhlSalaryByPlayerSeasonEndYear,
    playerById,
    seasonById,
  ]);

  const draftPickGroups = useMemo(() => {
    if (!currentFranchiseId || !currentSeason) {
      return [] as FranchiseDraftPickGroupType[];
    }

    const seasonWindow = getDraftSeasonWindow(seasons, currentSeason);
    return seasonWindow.map((season) => {
      const seasonTeam = teamPool.find(
        (team) =>
          String(team.franchiseId) === currentFranchiseId &&
          String(team.seasonId) === String(season.id),
      );
      const teamIdentifiers = new Set(
        [seasonTeam?.id, seasonTeam?.franchiseId]
          .filter(Boolean)
          .map((value) => String(value)),
      );
      const picks = (draftPicks ?? [])
        .filter(
          (draftPick) =>
            String(draftPick.seasonId) === String(season.id) &&
            teamIdentifiers.has(String(draftPick.gshlTeamId)),
        )
        .sort((a, b) => {
          if (toNumber(a.round, 0) !== toNumber(b.round, 0)) {
            return toNumber(a.round, 0) - toNumber(b.round, 0);
          }
          return toNumber(a.pick, 0) - toNumber(b.pick, 0);
        })
        .map((draftPick) => ({
          draftPick,
          selectedPlayer: draftPick.playerId
            ? playerById.get(String(draftPick.playerId))
            : undefined,
          originalTeam: resolveTeamReference(
            draftPick.originalTeamId,
            teamById,
            franchiseById,
          ),
          seasonTeam,
        }));

      return {
        seasonId: String(season.id),
        seasonName: season.name,
        picks,
      };
    });
  }, [
    currentFranchiseId,
    currentSeason,
    draftPicks,
    franchiseById,
    playerById,
    seasons,
    teamById,
    teamPool,
  ]);

  const tableReady = Boolean(
    currentSeason && currentTeam && players?.length && nhlTeams?.length,
  );
  return {
    table: {
      sortedContracts,
      capSpaceWindow,
      ready: tableReady,
    },
    history: {
      rows: expiredRows,
      hasData: expiredRows.length > 0,
    },
    draft: {
      groups: draftPickGroups,
      hasData: draftPickGroups.some((group) => group.picks.length > 0),
    },
    currentContracts,
    buyoutContracts,
    expiredRows,
    draftPickGroups,
    isLoading: contractsLoading || playerNhlStatsLoading,
    error:
      (contractsError as Error | null | undefined) ??
      (playerNhlStatsError as Error | null | undefined) ??
      null,
  };
}

function getContractUniqueKey(contract: Contract): string {
  return contract.id || getContractDedupeKey(contract);
}

function dedupeContracts(contracts: Contract[]): Contract[] {
  const seenKeys = new Set<string>();
  return contracts.filter((contract) => {
    const key = getContractUniqueKey(contract);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function getSeasonEndYear(season?: Season): number | null {
  if (!season) return null;

  const explicitYear = toNumber(season.year, Number.NaN);
  if (Number.isFinite(explicitYear)) {
    return Math.trunc(explicitYear);
  }

  const match = /^(\d{4})/.exec(season.name ?? "");
  if (!match) return null;
  return Number(match[1]) + 1;
}

function getContractCapHitEndYear(contract: Contract): number | null {
  return getDateYear(contract.capHitEndDate);
}

function hasCurrentOrFutureCapImpact(
  contract: Contract,
  activeSeasonEndYear: number | null,
): boolean {
  if (activeSeasonEndYear === null) return true;
  const endYear = getContractCapHitEndYear(contract);
  if (endYear === null) return true;
  return endYear >= activeSeasonEndYear;
}

function shouldDisplayInCurrentContracts(
  contract: Contract,
  currentSeason: Season | undefined,
  activeSeasonEndYear: number | null,
  referenceDate: Date = new Date(),
): boolean {
  if (hasCurrentOrFutureCapImpact(contract, activeSeasonEndYear)) {
    return true;
  }

  return shouldShowRecentExpiryStatus(
    contract,
    currentSeason,
    activeSeasonEndYear,
    referenceDate,
  );
}

function shouldShowRecentExpiryStatus(
  contract: Contract,
  currentSeason: Season | undefined,
  activeSeasonEndYear: number | null,
  referenceDate: Date,
): boolean {
  if (!currentSeason || activeSeasonEndYear === null) return false;
  if (contract.expiryStatus === ContractStatus.BUYOUT) return false;

  const signingDeadline = parseDateValue(currentSeason.signingEndDate);
  if (!signingDeadline || referenceDate > signingDeadline) return false;

  const expiryYear =
    getDateYear(contract.expiryDate) ?? getContractCapHitEndYear(contract);
  if (expiryYear === null) return false;

  return expiryYear === activeSeasonEndYear - 1;
}

function getDateYear(value: Date | string | null | undefined): number | null {
  if (!value) return null;

  const parsed = parseDateValue(value);
  if (parsed) {
    return parsed.getFullYear();
  }

  const matches = String(value).match(/\d{4}/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}

function parseDateValue(value: Date | string | null | undefined): Date | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function createHistoryRow(
  contract: Contract,
  playerById: Map<string, Player>,
  seasonById: Map<string, Season>,
  nhlSalaryByPlayerSeasonEndYear: Map<string, number>,
): FranchiseContractHistoryRowType {
  const player = playerById.get(String(contract.playerId));
  const season = seasonById.get(String(contract.seasonId));
  const ownerId = String(contract.ownerId ?? "");
  const contractValue = calculateContractValue(
    contract,
    seasonById,
    nhlSalaryByPlayerSeasonEndYear,
  );

  return {
    id: contract.id,
    ownerId,
    playerName: player?.fullName ?? "Unknown",
    season: season?.name ?? String(contract.seasonId),
    type: Array.isArray(contract.contractType)
      ? contract.contractType.join(", ")
      : contract.contractType
        ? String(contract.contractType)
        : "-",
    length: toNumber(contract.contractLength, 0),
    salary: toNumber(contract.contractSalary, 0),
    capHit: toNumber(contract.capHit, 0),
    start: formatDate(contract.startDate),
    end: formatDate(contract.expiryDate),
    signingStatus: String(contract.signingStatus ?? "-"),
    expiryStatus: String(contract.expiryStatus ?? "-"),
    buyoutEnd:
      contract.expiryStatus === ContractStatus.BUYOUT
        ? formatDate(contract.capHitEndDate)
        : undefined,
    contractValue,
  };
}

function calculateContractValue(
  contract: Contract,
  seasonById: Map<string, Season>,
  nhlSalaryByPlayerSeasonEndYear: Map<string, number>,
): number | null {
  const playerId = String(contract.playerId ?? "");
  if (!playerId) return null;

  const activeSeasonEndYears = getContractActiveSeasonEndYears(
    contract,
    seasonById,
  );
  if (!activeSeasonEndYears.length) return null;

  const contractSalary = toNumber(contract.contractSalary, 0);
  const salaryDiffs = activeSeasonEndYears.map((seasonEndYear) => {
    const seasonSalary = nhlSalaryByPlayerSeasonEndYear.get(
      getPlayerSeasonValueKey(playerId, seasonEndYear),
    );

    if (seasonSalary === undefined) {
      return null;
    }

    return seasonSalary - contractSalary;
  });

  if (salaryDiffs.some((value) => value === null)) {
    return null;
  }

  return (salaryDiffs as number[]).reduce((sum, value) => sum + value, 0);
}

function getContractActiveSeasonEndYears(
  contract: Contract,
  seasonById: Map<string, Season>,
): number[] {
  const length = Math.max(0, toNumber(contract.contractLength, 0));
  if (length <= 0) return [];

  const firstSeasonEndYear = getSeasonEndYear(
    seasonById.get(String(contract.seasonId)),
  );
  if (firstSeasonEndYear !== null) {
    return Array.from({ length }, (_, index) => firstSeasonEndYear + index);
  }

  const expiryYear = getDateYear(contract.expiryDate);
  if (expiryYear !== null) {
    const startYear = expiryYear - length + 1;
    return Array.from({ length }, (_, index) => startYear + index);
  }

  return [];
}

function getPlayerSeasonValueKey(
  playerId: string,
  seasonEndYear: number,
): string {
  return `${playerId}:${seasonEndYear}`;
}

function getDraftSeasonWindow(
  seasons: Season[] | undefined,
  currentSeason: Season,
): Season[] {
  const ordered = [...(seasons ?? [])].sort((a, b) => {
    const aYear = getSeasonEndYear(a) ?? 0;
    const bYear = getSeasonEndYear(b) ?? 0;
    if (aYear !== bYear) return aYear - bYear;
    return String(a.id).localeCompare(String(b.id));
  });
  const currentIndex = ordered.findIndex(
    (season) => String(season.id) === String(currentSeason.id),
  );
  const nextSeason = currentIndex > 0 ? ordered[currentIndex + 1] : undefined;

  return [currentSeason, nextSeason].filter((season): season is Season =>
    Boolean(season),
  );
}

function resolveTeamReference(
  referenceId: string | null | undefined,
  teamById: Map<string, GSHLTeam>,
  franchiseById: Map<string, GSHLTeam>,
): GSHLTeam | undefined {
  if (!referenceId) return undefined;
  const key = String(referenceId);
  return teamById.get(key) ?? franchiseById.get(key);
}
