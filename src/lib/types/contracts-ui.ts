import type {
  Contract,
  GSHLTeam,
  NHLTeam,
  Player,
  Season,
} from "./database";
import type {
  BuyoutContractType,
  FranchiseContractHistoryRowType,
  FranchiseDraftPickGroupType,
} from "./hooks";

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

export interface TeamContractTableProps {
  currentSeason: Season | undefined;
  players: Player[];
  nhlTeams: NHLTeam[];
  contracts: Contract[];
  currentTeam: GSHLTeam;
  sortedContracts: Contract[];
  capSpaceWindow: { label: string; year: number; remaining: number }[];
  ready: boolean;
}
