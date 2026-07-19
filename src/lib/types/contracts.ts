import type {
  Contract,
  DraftPick,
  GSHLTeam,
  NHLTeam,
  Player,
  Season,
} from "./database";
import type { ContractStatus } from "./enums";

export type MaybeArray<T> = T | T[] | null | undefined;
export type ContractLength = 1 | 2 | 3;

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

export interface FranchiseDraftPickSummaryProps {
  groups: FranchiseDraftPickGroupType[];
  hasData: boolean;
}

export interface FranchiseContractHistoryProps {
  rows: FranchiseContractHistoryRowType[];
  hasData: boolean;
}

export interface TeamBuyoutTableProps {
  buyoutContracts: BuyoutContractType[];
  currentTeam: GSHLTeam;
  players: Player[];
  nhlTeams: NHLTeam[];
  ready: boolean;
}

export interface PlayerContractRowSkeletonProps {
  contract: Contract;
}

export interface ContractTableProps {
  currentSeason: Season | undefined;
  players: Player[];
  nhlTeams: NHLTeam[];
  contracts: Contract[];
  currentTeam: GSHLTeam;
  sortedContracts: Contract[];
  capSpaceWindow: CapSpaceEntry[];
  ready: boolean;
}

export interface PlayerContractRowProps {
  contract: Contract;
  player?: Player;
  currentSeason: Season;
  nhlTeams: NHLTeam[];
}

export interface TableHeaderProps {
  currentSeason: Season | undefined;
}

export interface CapSpaceRowProps {
  currentTeam: GSHLTeam;
  capSpaceWindow: CapSpaceEntry[];
}

export type TeamContractTableProps = ContractTableProps;
