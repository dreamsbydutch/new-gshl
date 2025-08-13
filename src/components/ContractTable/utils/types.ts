import { Contract, GSHLTeam, Player, Season } from "@gshl-types";

export interface ContractTableProps {
  currentSeason: Season | undefined;
  currentTeam: GSHLTeam | undefined;
  contracts: Contract[] | undefined;
  players: Player[] | undefined;
}

export interface PlayerContractRowProps {
  contract: Contract;
  player: Player | undefined;
  currentSeason: Season;
  currentTeam: GSHLTeam | undefined;
}

export interface TableHeaderProps {
  currentSeason: Season;
}

export interface CapSpaceRowProps {
  contracts: Contract[];
  currentTeam: GSHLTeam;
}
