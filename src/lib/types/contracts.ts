import type {
  Contract,
  DraftPick,
  GSHLTeam,
  NHLTeam,
  Player,
  Season,
} from "./database";
import type { ContractStatus, ContractType } from "./enums";

export type MaybeArray<T> = T | T[] | null | undefined;
export type ContractLength = 1 | 2 | 3;
export type InteractiveContractAction = "sign" | "trade";

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

export interface ContractCreationTerms {
  signingSeason: Season;
  startSeason: Season;
  expirySeason: Season;
  contractType: ContractType;
  contractSalary: number;
  signingStatus: ContractStatus;
  expiryStatus: ContractStatus;
  startDate: string;
  expiryDate: string;
}

export interface ContractCapCheck {
  affordable: boolean;
  coveredSeasonIds: string[];
  limitingSeasonId: string | null;
  availableCapSpace: number;
  requiredSalary: number;
}

export interface PlayerNhlSalaryRow {
  playerId: string;
  seasonId: string;
  salary: number | string | null;
}

export interface CapSpaceEntry {
  label: string;
  year: number;
  remaining: number;
}

export interface CapScenarioImpactEntry {
  label: string;
  year: number;
  before: number;
  after: number;
  change: number;
}

export interface CapScenarioMoveListRow {
  id: string;
  name: string;
  detail: string;
  direction: "in" | "out";
  onUndo: () => void;
}

export interface InteractiveContractTableProps {
  currentSeason: Season | undefined;
  currentTeam: GSHLTeam;
  signablePlayers: Player[];
  tradePlayers: Player[];
  tradeContracts: Contract[];
  contractPlayers: Player[];
  nhlTeams: NHLTeam[];
  existingContracts: Contract[];
  seasons: Season[];
  ready: boolean;
}

export interface InteractiveContractSelection {
  id: string;
  player: Player;
  contract: Contract;
  contractLength: ContractLength;
  action: InteractiveContractAction;
}

export interface CapLabPlayerOption {
  player: Player;
  action: InteractiveContractAction;
  contract?: Contract;
}

export interface UseInteractiveContractTableOptions {
  currentSeason?: Season;
  ownerId?: string;
  signablePlayers: Player[];
  tradePlayers: Player[];
  tradeContracts: Contract[];
  existingContracts: Contract[];
  seasons: Season[];
}

export interface UseInteractiveContractTableResult {
  availablePlayers: CapLabPlayerOption[];
  contractLength: ContractLength;
  setContractLength: (length: ContractLength) => void;
  pickerError: string | null;
  addPlayer: (playerId: string) => void;
  removePlayer: (playerId: string) => void;
  resetContracts: () => void;
  restoreContract: (contractId: string) => void;
  selections: InteractiveContractSelection[];
  simulatedContracts: Contract[];
  contractGroups: Contract[][];
  capSpaceWindow: CapSpaceEntry[];
  baselineCapSpaceWindow: CapSpaceEntry[];
  capImpact: CapScenarioImpactEntry[];
  ghostContracts: Contract[];
  hasChanges: boolean;
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
  contractGroups: Contract[][];
  capSpaceWindow: CapSpaceEntry[];
  ready: boolean;
  title?: string;
  compact?: boolean;
  onRemovePlayer?: (playerId: string) => void;
  ghostContracts?: Contract[];
  onRestoreContract?: (contractId: string) => void;
}

export interface PlayerContractRowProps {
  contracts: Contract[];
  player?: Player;
  currentSeason: Season;
  nhlTeams: NHLTeam[];
  compact?: boolean;
  onRemovePlayer?: (playerId: string) => void;
  isGhost?: boolean;
  onRestoreContract?: (contractId: string) => void;
}

export interface TableHeaderProps {
  currentSeason: Season | undefined;
  compact?: boolean;
  showRemoveAction?: boolean;
}

export interface CapSpaceRowProps {
  currentTeam: GSHLTeam;
  capSpaceWindow: CapSpaceEntry[];
  compact?: boolean;
  showRemoveAction?: boolean;
}

export type TeamContractTableProps = ContractTableProps;
