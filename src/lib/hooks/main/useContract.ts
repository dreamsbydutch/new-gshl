"use client";

import { useCallback, useMemo } from "react";
import { type Contract, type GSHLTeam, type Player, type Season, type NHLTeam, ContractStatus } from "@gshl-types";
import { api } from "src/trpc/react";
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
} from "@gshl-utils";
import type {
  ContractFilters,
  ContractSortOption,
} from "@gshl-utils";

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
}

export interface CapSpaceEntry {
  label: string;
  year: number;
  remaining: number;
}

export interface ContractHistoryRowType {
  id: string;
  signingFranchiseId: string;
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
}

export interface UseContractDataResult {
  table: {
    sortedContracts: Contract[];
    capSpaceWindow: CapSpaceEntry[];
    ready: boolean;
  };
  history: {
    rows: ContractHistoryRowType[];
    franchiseById: Map<string, GSHLTeam>;
    hasData: boolean;
  };
  teamContracts: Contract[];
  isLoading: boolean;
  error: Error | null;
}

export function useContractData(
  options: UseContractDataOptions = {},
): UseContractDataResult {
  const {
    currentSeason,
    currentTeam,
    ownerId,
    teams,
    allTeams,
    players,
    nhlTeams,
    seasons,
  } = options;

  const { data: contracts } = useAllContracts();

  const teamContracts = useMemo(() => {
    if (!currentTeam?.franchiseId || !contracts) return [];
    return contracts.filter(
      (contract) =>
        contract.currentFranchiseId === currentTeam.franchiseId &&
        new Date(contract.capHitEndDate) > new Date(),
    );
  }, [currentTeam?.franchiseId, contracts]);

  const sortedContracts = useMemo(() => {
    if (!teamContracts?.length) return [];

    return [...teamContracts].sort((a, b) => +b.capHit - +a.capHit);
  }, [teamContracts]);

  const capSpaceWindow = useMemo(() => {
    const seasonStartYear = currentSeason?.name
      ? +currentSeason.year
      : new Date().getFullYear();

    const dataset = sortedContracts.length ? sortedContracts : teamContracts;

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
      const total = active.reduce((sum, c) => sum + +c.capHit, 0);
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
  }, [sortedContracts, teamContracts, currentSeason]);

  const teamPool = useMemo(() => allTeams ?? teams ?? [], [allTeams, teams]);

  const ownerFranchiseIds = useMemo(() => {
    if (!ownerId) return [] as string[];
    return teamPool
      .filter((t) => t.ownerId === ownerId)
      .map((t) => t.franchiseId)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }, [teamPool, ownerId]);

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
      map.set(team.franchiseId, team);
    });
    return map;
  }, [teamPool]);

  const seasonById = useMemo(() => {
    const map = new Map<string, Season>();
    seasons?.forEach((season) => {
      map.set(season.id, season);
    });
    return map;
  }, [seasons]);

  const historyRows = useMemo(() => {
    if (!contracts || !ownerId) return [] as ContractHistoryRowType[];

    const seenIds = new Set<string>();
    const seenFallbackKeys = new Set<string>();

    return (contracts ?? [])
      .filter((contract) =>
        ownerFranchiseIds.includes(contract.signingFranchiseId),
      )
      .filter((contract) => {
        if (contract.id) {
          if (seenIds.has(contract.id)) {
            return false;
          }
          seenIds.add(contract.id);
          return true;
        }

        const key = getContractDedupeKey(contract);
        if (seenFallbackKeys.has(key)) {
          return false;
        }
        seenFallbackKeys.add(key);
        return true;
      })
      .sort((a, b) => b.signingDate.localeCompare(a.signingDate))
      .map((contract) => {
        const player = playerById.get(contract.playerId);
        const season = seasonById.get(contract.seasonId);

        return {
          id: contract.id,
          signingFranchiseId: contract.signingFranchiseId,
          playerName: player?.fullName ?? "Unknown",
          season: season?.name ?? String(contract.seasonId),
          type: Array.isArray(contract.contractType)
            ? contract.contractType.join(", ")
            : contract.contractType
              ? String(contract.contractType)
              : "-",
          length: contract.contractLength,
          salary: contract.contractSalary,
          capHit: contract.capHit,
          start: formatDate(contract.startDate),
          end: formatDate(contract.expiryDate),
          signingStatus: contract.signingStatus,
          expiryStatus: contract.expiryStatus,
          buyoutEnd:
            contract.expiryStatus === ContractStatus.BUYOUT
              ? formatDate(contract.capHitEndDate)
              : undefined,
        };
      });
  }, [contracts, ownerId, ownerFranchiseIds, playerById, seasonById]);

  const sortedHistoryRows = useMemo(
    () => historyRows.slice().sort((a, b) => b.salary - a.salary),
    [historyRows],
  );

  const tableReady = Boolean(
    currentSeason &&
      currentTeam &&
      teamContracts &&
      players?.length &&
      nhlTeams?.length,
  );
  return {
    table: {
      sortedContracts,
      capSpaceWindow,
      ready: tableReady,
    },
    history: {
      rows: sortedHistoryRows,
      franchiseById,
      hasData: historyRows.length > 0,
    },
    teamContracts,
    isLoading: false,
    error: null,
  };
}
