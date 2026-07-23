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
  Player,
  Season,
} from "@gshl-types";
import {
  ContractStatus,
  ContractType,
  ResignableStatus,
  SALARY_CAP,
} from "@gshl-types";
import { formatDate, normalizeDateOnlyValue } from "../core/date";

type ContractComparableValue = Date | number | string | null | undefined;

export type ContractCreationTerms = {
  signingSeason: Season;
  startSeason: Season;
  expirySeason: Season;
  contractType: ContractType;
  contractSalary: number;
  signingStatus: ContractStatus;
  expiryStatus: ContractStatus;
  startDate: string;
  expiryDate: string;
};

export type ContractCapCheck = {
  affordable: boolean;
  coveredSeasonIds: string[];
  limitingSeasonId: string | null;
  availableCapSpace: number;
  requiredSalary: number;
};

const NON_PLAYING_CONTRACT_STATUSES = new Set<string>([
  String(ContractStatus.BUYOUT),
  String(ContractStatus.RETIRED),
  String(ContractStatus.INJURED),
]);

function seasonYear(season: Season): number {
  const year = Number(season.year);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
}

/** Returns the league-local date used for signing-period decisions. */
export function getTorontoDate(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Free agency opens on the first Toronto date after the signing deadline. */
export function isUfaFreeAgencyOpen(
  signingSeason: Pick<Season, "signingEndDate"> | null | undefined,
  referenceDate: Date = new Date(),
): boolean {
  const signingEndDate = normalizeDateOnlyValue(signingSeason?.signingEndDate);
  return Boolean(
    signingEndDate && getTorontoDate(referenceDate) > signingEndDate,
  );
}

/** Orders seasons chronologically, with their ids as a stable tie-breaker. */
export function orderContractSeasons(seasons: Season[]): Season[] {
  return [...seasons].sort((left, right) => {
    const yearDelta = seasonYear(left) - seasonYear(right);
    return yearDelta || String(left.id).localeCompare(String(right.id));
  });
}

/** Returns the seasons covered by a contract signed in season S for N years. */
export function getContractCoveredSeasonIds(
  contract: Pick<Contract, "seasonId" | "contractLength">,
  seasons: Season[],
): string[] {
  const ordered = orderContractSeasons(seasons);
  const signingIndex = ordered.findIndex(
    (season) => String(season.id) === String(contract.seasonId),
  );
  const length = Number(contract.contractLength);
  if (signingIndex < 0 || !Number.isInteger(length) || length < 1) return [];

  return ordered
    .slice(signingIndex + 1, signingIndex + 1 + length)
    .map((season) => String(season.id));
}

/** Checks a proposed contract against an owner's cap in every covered season. */
export function checkContractCapSpace(options: {
  ownerId: string;
  signingSeasonId: string;
  contractLength: 1 | 2 | 3;
  contractSalary: number;
  contracts: Contract[];
  seasons: Season[];
  salaryCap?: number;
}): ContractCapCheck {
  const {
    ownerId,
    signingSeasonId,
    contractLength,
    contractSalary,
    contracts,
    seasons,
    salaryCap = SALARY_CAP,
  } = options;
  const coveredSeasonIds = getContractCoveredSeasonIds(
    { seasonId: signingSeasonId, contractLength },
    seasons,
  );

  let limitingSeasonId: string | null = null;
  let availableCapSpace = salaryCap;

  for (const seasonId of coveredSeasonIds) {
    const committed = contracts.reduce((total, contract) => {
      if (String(contract.ownerId) !== String(ownerId)) return total;
      if (!getContractCoveredSeasonIds(contract, seasons).includes(seasonId)) {
        return total;
      }
      const capHit = Number(contract.capHit ?? contract.contractSalary ?? 0);
      return total + (Number.isFinite(capHit) ? capHit : 0);
    }, 0);
    const seasonCapSpace = salaryCap - committed;

    if (limitingSeasonId == null || seasonCapSpace < availableCapSpace) {
      limitingSeasonId = seasonId;
      availableCapSpace = seasonCapSpace;
    }
  }

  return {
    affordable:
      coveredSeasonIds.length === contractLength &&
      contractSalary <= availableCapSpace,
    coveredSeasonIds,
    limitingSeasonId,
    availableCapSpace,
    requiredSalary: contractSalary,
  };
}

/** Identifies contracts that represent a player occupying a roster spot. */
export function isPlayingContract(
  contract: Pick<Contract, "contractType" | "expiryStatus">,
): boolean {
  if (NON_PLAYING_CONTRACT_STATUSES.has(String(contract.expiryStatus))) {
    return false;
  }

  const types = Array.isArray(contract.contractType)
    ? contract.contractType.map(String)
    : [String(contract.contractType)];
  return types.some(
    (type) =>
      type === String(ContractType.STANDARD) ||
      type === String(ContractType.EXTENSION),
  );
}

/** Checks whether a prior playing contract covers the new signing season. */
export function hasContractContinuity(
  playerId: string,
  signingSeasonId: string,
  contracts: Contract[],
  seasons: Season[],
): boolean {
  return contracts.some(
    (contract) =>
      String(contract.playerId) === String(playerId) &&
      isPlayingContract(contract) &&
      getContractCoveredSeasonIds(contract, seasons).includes(
        String(signingSeasonId),
      ),
  );
}

/**
 * Returns whether a player is genuinely unsigned for the season being signed.
 *
 * Contracts created during signing season S begin in S+1. A player is
 * therefore a Summer UFA when no playing contract covers S+1. Contract history
 * is authoritative because the denormalized player signing flags may not yet
 * have been advanced when Summer Free Agency opens.
 */
export function isUnsignedForSigningSeason(
  playerId: string,
  signingSeasonId: string,
  contracts: Contract[],
  seasons: Season[],
): boolean {
  const ordered = orderContractSeasons(seasons);
  const signingIndex = ordered.findIndex(
    (season) => String(season.id) === String(signingSeasonId),
  );
  const contractSeason = ordered[signingIndex + 1];
  if (!contractSeason) return false;

  return !contracts.some(
    (contract) =>
      String(contract.playerId) === String(playerId) &&
      isPlayingContract(contract) &&
      getContractCoveredSeasonIds(contract, ordered).includes(
        String(contractSeason.id),
      ),
  );
}

/** Derives every business field needed to create a new contract. */
export function deriveContractCreationTerms(options: {
  player: Pick<Player, "id" | "salary" | "isResignable">;
  signingSeason: Season;
  contractLength: 1 | 2 | 3;
  contracts: Contract[];
  seasons: Season[];
}): ContractCreationTerms {
  const { player, signingSeason, contractLength, contracts, seasons } = options;
  const ordered = orderContractSeasons(seasons);
  const signingIndex = ordered.findIndex(
    (season) => String(season.id) === String(signingSeason.id),
  );
  if (signingIndex < 0)
    throw new Error("Signing season could not be resolved.");

  const startSeason = ordered[signingIndex + 1];
  const expirySeason = ordered[signingIndex + contractLength];
  if (!startSeason || !expirySeason) {
    throw new Error("The required future seasons have not been configured.");
  }
  if (!startSeason.startDate || !expirySeason.endDate) {
    throw new Error("The required future season dates are missing.");
  }

  const baseSalary = Number(player.salary);
  if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
    throw new Error("The player does not have a valid salary.");
  }

  const status = String(player.isResignable ?? "").toUpperCase();
  const continuous = hasContractContinuity(
    String(player.id),
    String(signingSeason.id),
    contracts,
    ordered,
  );

  let multiplier: number;
  let contractType: ContractType;
  let signingStatus: ContractStatus;
  let expiryStatus: ContractStatus;

  if (status === String(ResignableStatus.DRAFT)) {
    multiplier = 1;
    contractType = ContractType.STANDARD;
    signingStatus = ContractStatus.DRAFTED;
    expiryStatus = ContractStatus.RFA;
  } else if (status === String(ResignableStatus.RFA)) {
    multiplier = 1.15;
    contractType = ContractType.EXTENSION;
    signingStatus = ContractStatus.RFA;
    expiryStatus = ContractStatus.UFA;
  } else if (status === String(ResignableStatus.UFA)) {
    multiplier = 1.25;
    contractType = continuous ? ContractType.EXTENSION : ContractType.STANDARD;
    signingStatus = ContractStatus.UFA;
    expiryStatus = continuous ? ContractStatus.UFA : ContractStatus.RFA;
  } else {
    throw new Error("The player does not have a valid signing status.");
  }

  return {
    signingSeason,
    startSeason,
    expirySeason,
    contractType,
    contractSalary: Math.round(baseSalary * multiplier),
    signingStatus,
    expiryStatus,
    startDate: startSeason.startDate,
    expiryDate: expirySeason.endDate,
  };
}

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
): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

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
