/**
 * Contract Domain Utilities
 * -------------------------
 * Business domain-specific functions for contract calculations and operations.
 */

import type { Contract, ContractStatus } from "@gshl-types";
import { SALARY_CAP } from "@gshl-types";
import { formatDate } from "../core/date";

export type MaybeArray<T> = T | T[] | null | undefined;

export const identity = <Value>(value: Value) => value;

export function toArray<T>(value: MaybeArray<T>): T[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value.filter((item) => item != null) : [value];
}

export function toSet<T>(value: MaybeArray<T>): Set<T> | undefined {
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
  activeOn?: string;
  includeExpiryStatuses?: MaybeArray<ContractStatus>;
  excludeExpiryStatuses?: MaybeArray<ContractStatus>;
  includeSigningStatuses?: MaybeArray<ContractStatus>;
  excludeSigningStatuses?: MaybeArray<ContractStatus>;
  predicate?: (contract: Contract) => boolean;
}

export type ContractSortKey =
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

function getComparableValue(value: unknown): number | string | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

export function applyContractFilters(
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
    ? (filters.activeOn ?? formatDate(new Date()))
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

    if (cutoff && contract.capHitEndDate <= cutoff) {
      return false;
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

export function sortContracts(
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

export function mergeContractFilters(
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

export function computeContractSummary(contracts: Contract[]): ContractSummary {
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

export const isValidContractDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const getTimestampToken = (value: unknown) => {
  if (isValidContractDate(value)) {
    return String(value.getTime());
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "na";
};

export const getContractDedupeKey = (contract: Contract) =>
  [
    contract.id ?? "no-id",
    contract.playerId ?? "no-player",
    getTimestampToken(contract.capHitEndDate),
    String(contract.capHit ?? "0"),
    String(contract.signingStatus ?? "no-status"),
  ].join("|");

/**
 * Calculates the remaining cap space for a team based on their contracts.
 *
 * @param contracts - Array of contracts with CapHit property
 * @returns The remaining cap space (salary cap - total cap hit)
 */
export function calculateCapSpace(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return SALARY_CAP - totalCapHit;
}

/**
 * Calculates the percentage of salary cap used by a team's contracts.
 *
 * @param contracts - Array of contracts with CapHit property
 * @returns The percentage of salary cap used (0-100)
 */
export function calculateCapPercentage(
  contracts: Array<{ CapHit?: string | null }>,
): number {
  const totalCapHit = contracts.reduce((sum, contract) => {
    const capHit = parseFloat(contract.CapHit ?? "0");
    return sum + (Number.isNaN(capHit) ? 0 : capHit);
  }, 0);

  return (totalCapHit / SALARY_CAP) * 100;
}
