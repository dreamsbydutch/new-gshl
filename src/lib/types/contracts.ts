import type { Contract } from "./database";
import type { ContractStatus } from "./enums";

export type MaybeArray<T> = T | T[] | null | undefined;

export interface ContractFilters {
  ids?: MaybeArray<string>;
  excludeIds?: MaybeArray<string>;
  playerIds?: MaybeArray<string>;
  ownerIds?: MaybeArray<string>;
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
