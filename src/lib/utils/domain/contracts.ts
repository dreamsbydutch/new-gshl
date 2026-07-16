/**
 * Contract Domain Utilities
 * -------------------------
 * Business domain-specific functions for contract calculations and operations.
 */

import type {
  Contract,
  ContractFilters,
  ContractSortOption,
  ContractSummary,
  MaybeArray,
} from "@gshl-types";
import { SALARY_CAP } from "@gshl-types";
import { formatDate } from "../core/date";

type ContractComparableValue = Date | number | string | null | undefined;

/**
 * Identity.
 *
 * @param value - The source value to process.
 */
export const identity = <Value>(value: Value) => value;

/**
 * Converts input into array.
 *
 * @param value - The source value to process.
 * @returns The converted array.
 */
export function toArray<T>(value: MaybeArray<T>): T[] | undefined {
  if (value == null) return undefined;
  return Array.isArray(value) ? value.filter((item) => item != null) : [value];
}

/**
 * Converts input into set.
 *
 * @param value - The source value to process.
 * @returns The converted set.
 */
export function toSet<T>(value: MaybeArray<T>): Set<T> | undefined {
  const arr = toArray(value);
  return arr ? new Set(arr) : undefined;
}

/**
 * Returns comparable value.
 *
 * @param value - The source value to process.
 * @returns The requested comparable value.
 */
function getComparableValue(
  value: ContractComparableValue,
): number | string | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  return undefined;
}

/**
 * Applies contract filters.
 *
 * @param contracts - The contracts to use.
 * @param filters - The filter definitions to apply.
 * @returns The updated contract filters.
 */
export function applyContractFilters(
  contracts: Contract[],
  filters?: ContractFilters,
): Contract[] {
  if (!filters) return contracts;

  const ids = toSet(filters.ids);
  const excludeIds = toSet(filters.excludeIds);
  const playerIds = toSet(filters.playerIds);
  const ownerIds = toSet(filters.ownerIds);
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
    if (ownerIds?.has(contract.ownerId) === false) return false;
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

/**
 * Sorts contracts.
 *
 * @param contracts - The contracts to use.
 * @param sort - The sort to use.
 * @returns The sorted contracts.
 */
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

/**
 * Merges contract filters.
 *
 * @param base - The base to use.
 * @param overrides - The overrides to use.
 * @returns The merged contract filters.
 */
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

/**
 * Computes contract summary.
 *
 * @param contracts - The contracts to use.
 * @returns The calculated contract summary.
 */
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

/**
 * Checks whether valid contract date.
 *
 * @param value - The source value to process.
 * @returns The resulting valid contract date.
 */
export const isValidContractDate = (
  value: ContractComparableValue,
): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Returns timestamp token.
 *
 * @param value - The source value to process.
 */
export const getTimestampToken = (value: ContractComparableValue) => {
  if (isValidContractDate(value)) {
    return String(value.getTime());
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "na";
};

/**
 * Returns contract dedupe key.
 *
 * @param contract - The contract to use.
 */
export const getContractDedupeKey = (contract: Contract) =>
  [
    contract.id ?? "no-id",
    contract.playerId ?? "no-player",
    getTimestampToken(contract.capHitEndDate),
    String(contract.capHit ?? "0"),
    String(contract.signingStatus ?? "no-status"),
  ].join("|");

/**
 * Calculates cap space.
 *
 * @param contracts - The contracts to use.
 * @returns The calculated cap space.
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
 * Calculates cap percentage.
 *
 * @param contracts - The contracts to use.
 * @returns The calculated cap percentage.
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
