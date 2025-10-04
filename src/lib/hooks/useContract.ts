import { useCallback, useMemo } from "react";
import type { Contract, ContractStatus } from "@gshl-types";
import { api } from "src/trpc/react";

const EMPTY_CONTRACTS: Contract[] = Object.freeze([]) as unknown as Contract[];
const DEFAULT_SELECT_DEPS: readonly unknown[] = Object.freeze([]);

type MaybeArray<T> = T | T[] | undefined | null;

const identity = <Value>(value: Value) => value;

function toArray<T>(value: MaybeArray<T>): T[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value.filter((item) => item != null) : [value];
}

function toSet<T>(value: MaybeArray<T>): Set<T> | undefined {
  const arr = toArray(value);
  return arr ? new Set(arr) : undefined;
}

export interface ContractFilters {
  ids?: MaybeArray<string>;
  excludeIds?: MaybeArray<string>;
  playerIds?: MaybeArray<string>;
  signingFranchiseIds?: MaybeArray<string>;
  currentFranchiseIds?: MaybeArray<string>;
  seasonIds?: MaybeArray<string>;
  activeOnly?: boolean;
  activeOn?: Date;
  includeExpiryStatuses?: MaybeArray<ContractStatus>;
  excludeExpiryStatuses?: MaybeArray<ContractStatus>;
  includeSigningStatuses?: MaybeArray<ContractStatus>;
  excludeSigningStatuses?: MaybeArray<ContractStatus>;
  predicate?: (contract: Contract) => boolean;
}

type ContractSortKey =
  | "capHit"
  | "contractSalary"
  | "signingDate"
  | "startDate"
  | "capHitEndDate"
  | "createdAt"
  | "updatedAt";

export interface ContractSortOption {
  by?: ContractSortKey;
  direction?: "asc" | "desc";
  comparator?: (a: Contract, b: Contract) => number;
}

export interface ContractSummary {
  count: number;
  totalCapHit: number;
  totalSalary: number;
  averageCapHit: number;
}

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

function applyFilters(
  contracts: Contract[],
  filters?: ContractFilters,
): Contract[] {
  if (!filters) return contracts;

  const ids = toSet(filters.ids);
  const excludeIds = toSet(filters.excludeIds);
  const playerIds = toSet(filters.playerIds);
  const signingFranchiseIds = toSet(filters.signingFranchiseIds);
  const currentFranchiseIds = toSet(filters.currentFranchiseIds);
  const seasonIds = toSet(filters.seasonIds);
  const includeExpiryStatuses = toSet(filters.includeExpiryStatuses);
  const excludeExpiryStatuses = toSet(filters.excludeExpiryStatuses);
  const includeSigningStatuses = toSet(filters.includeSigningStatuses);
  const excludeSigningStatuses = toSet(filters.excludeSigningStatuses);
  const cutoff = filters.activeOnly
    ? (filters.activeOn ?? new Date())
    : filters.activeOn;

  return contracts.filter((contract) => {
    if (ids?.has(contract.id) === false) return false;
    if (excludeIds?.has(contract.id)) return false;
    if (playerIds?.has(contract.playerId) === false) return false;
    if (signingFranchiseIds?.has(contract.signingFranchiseId) === false)
      return false;
    if (currentFranchiseIds?.has(contract.currentFranchiseId) === false)
      return false;
    if (seasonIds?.has(contract.seasonId) === false) return false;

    if (cutoff) {
      if (!(contract.capHitEndDate instanceof Date)) return false;
      if (contract.capHitEndDate <= cutoff) return false;
    }

    if (includeExpiryStatuses?.has(contract.expiryStatus) === false) {
      return false;
    }

    if (excludeExpiryStatuses?.has(contract.expiryStatus)) {
      return false;
    }

    if (includeSigningStatuses?.has(contract.signingStatus) === false) {
      return false;
    }

    if (excludeSigningStatuses?.has(contract.signingStatus)) {
      return false;
    }

    if (filters.predicate?.(contract) === false) return false;

    return true;
  });
}

function getComparableValue(value: unknown): number | string | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

function applySort(
  contracts: Contract[],
  sort?: ContractSortOption,
): Contract[] {
  if (!sort) return contracts;

  if (typeof sort.comparator === "function") {
    const copy = [...contracts];
    copy.sort(sort.comparator);
    return copy;
  }

  if (!sort.by) return contracts;

  const direction = sort.direction === "desc" ? -1 : 1;
  const key = sort.by;
  const copy = [...contracts];

  copy.sort((a, b) => {
    const aVal = getComparableValue(a[key]);
    const bVal = getComparableValue(b[key]);

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return -1 * direction;
    if (bVal == null) return 1 * direction;

    if (aVal < bVal) return -1 * direction;
    if (aVal > bVal) return 1 * direction;
    return 0;
  });

  return copy;
}

function mergeFilters(
  base?: ContractFilters,
  overrides?: ContractFilters,
): ContractFilters | undefined {
  if (!base) return overrides ? { ...overrides } : undefined;
  if (!overrides) return base;

  const merged: ContractFilters = { ...base, ...overrides };

  if (base.predicate || overrides.predicate) {
    merged.predicate = (contract) => {
      const baseResult = base.predicate ? base.predicate(contract) : true;
      const overrideResult = overrides.predicate
        ? overrides.predicate(contract)
        : true;
      return baseResult && overrideResult;
    };
  }

  return merged;
}

function computeSummary(contracts: Contract[]): ContractSummary {
  const count = contracts.length;
  const totalCapHit = contracts.reduce(
    (sum, contract) => sum + (contract.capHit ?? 0),
    0,
  );
  const totalSalary = contracts.reduce(
    (sum, contract) => sum + (contract.contractSalary ?? 0),
    0,
  );

  return {
    count,
    totalCapHit,
    totalSalary,
    averageCapHit: count > 0 ? totalCapHit / count : 0,
  };
}

/**
 * Fetches all contracts and applies optional client-side filtering, sorting, and projections.
 *
 * @template T Resulting item shape after applying the optional `map` transform
 * @template S Derived selection return value produced by the optional `select` callback
 * @param options Configuration object controlling how the contract list is transformed
 * @returns React Query state combined with transformed data and helper utilities
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
    () => applyFilters(rawContracts, filters),
    [rawContracts, filters],
  );

  const sortedContracts = useMemo(
    () => applySort(filteredContracts, sort),
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
    return computeSummary(limitedContracts);
  }, [limitedContracts, withSummary]);

  const getContracts = useCallback(
    <U = T>({
      filters: scopedFilters,
      sort: scopedSort,
      take: scopedTake,
      map: scopedMap,
    }: ScopedOptions<U> = {}): U[] => {
      const mergedFilters = mergeFilters(filters, scopedFilters);
      const base = applyFilters(rawContracts, mergedFilters);
      const ordered = applySort(base, scopedSort ?? sort);
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
 * Convenience wrapper around {@link useContracts} for callers that only need the default contract list.
 *
 * @template T Resulting item shape after applying the optional `map` transform
 * @template S Derived selection return value produced by the optional `select` callback
 * @param options Optional configuration forwarded to {@link useContracts}
 * @returns React Query state combined with transformed data and helper utilities
 */
export function useAllContracts<T = Contract, S = undefined>(
  options?: UseContractsOptions<T, S>,
) {
  return useContracts(options);
}
