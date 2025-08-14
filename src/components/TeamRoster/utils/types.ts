import type { Contract, GSHLTeam, Player } from "@gshl-types";

export interface TeamRosterProps {
  players: Player[] | undefined;
  contracts: Contract[] | undefined;
  currentTeam: GSHLTeam | undefined;
}

export interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
}

export interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export interface RosterLineupProps {
  teamLineup: (Player | null)[][][];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}

export interface CapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
}
