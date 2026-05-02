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
  toNumber,
} from "@gshl-utils";
import type { ContractFilters, ContractSortOption } from "@gshl-utils";

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
  signingFranchiseId: string;
  currentFranchiseId: string;
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
  signedHere: boolean;
  heldHere: boolean;
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
    franchiseById: Map<string, GSHLTeam>;
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

  const { data: contracts } = useAllContracts({ enabled });
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

  const heldContracts = useMemo(() => {
    if (!currentFranchiseId) return [] as Contract[];
    return dedupeContracts(
      (contracts ?? []).filter(
        (contract) =>
          String(contract.currentFranchiseId) === currentFranchiseId,
      ),
    );
  }, [contracts, currentFranchiseId]);

  const signedHereContracts = useMemo(() => {
    if (!currentFranchiseId) return [] as Contract[];
    return dedupeContracts(
      (contracts ?? []).filter(
        (contract) =>
          String(contract.signingFranchiseId) === currentFranchiseId,
      ),
    );
  }, [contracts, currentFranchiseId]);

  const franchiseRelevantContracts = useMemo(
    () => dedupeContracts([...heldContracts, ...signedHereContracts]),
    [heldContracts, signedHereContracts],
  );

  const currentContracts = useMemo(() => {
    return heldContracts
      .filter(
        (contract) =>
          contract.expiryStatus !== ContractStatus.BUYOUT &&
          hasCurrentOrFutureCapImpact(contract, activeSeasonEndYear),
      )
      .sort((a, b) => toNumber(b.capHit, 0) - toNumber(a.capHit, 0));
  }, [heldContracts, activeSeasonEndYear]);

  const buyoutContracts = useMemo(() => {
    return heldContracts
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
  }, [heldContracts, activeSeasonEndYear]);

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

  const currentContractKeys = useMemo(
    () => new Set(currentContracts.map(getContractUniqueKey)),
    [currentContracts],
  );
  const buyoutContractKeys = useMemo(
    () => new Set(buyoutContracts.map(getContractUniqueKey)),
    [buyoutContracts],
  );

  const expiredRows = useMemo(() => {
    if (!currentFranchiseId) return [] as FranchiseContractHistoryRowType[];

    return franchiseRelevantContracts
      .filter((contract) => {
        const key = getContractUniqueKey(contract);
        return !currentContractKeys.has(key) && !buyoutContractKeys.has(key);
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
        createHistoryRow(contract, currentFranchiseId, playerById, seasonById),
      );
  }, [
    buyoutContractKeys,
    currentContractKeys,
    currentFranchiseId,
    franchiseRelevantContracts,
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
      franchiseById,
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
    isLoading: false,
    error: null,
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

function getDateYear(value: Date | string | null | undefined): number | null {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  const matches = String(value).match(/\d{4}/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
}

function createHistoryRow(
  contract: Contract,
  currentFranchiseId: string,
  playerById: Map<string, Player>,
  seasonById: Map<string, Season>,
): FranchiseContractHistoryRowType {
  const player = playerById.get(String(contract.playerId));
  const season = seasonById.get(String(contract.seasonId));
  const signingFranchiseId = String(contract.signingFranchiseId ?? "");
  const heldFranchiseId = String(contract.currentFranchiseId ?? "");

  return {
    id: contract.id,
    signingFranchiseId,
    currentFranchiseId: heldFranchiseId,
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
    signedHere: signingFranchiseId === currentFranchiseId,
    heldHere: heldFranchiseId === currentFranchiseId,
  };
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
  const previousSeason =
    currentIndex > 0 ? ordered[currentIndex - 1] : undefined;

  return [currentSeason, previousSeason].filter((season): season is Season =>
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
