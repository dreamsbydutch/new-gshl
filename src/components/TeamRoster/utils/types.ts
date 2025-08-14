import type { Contract, GSHLTeam, Player, PlayerNHLStatLine } from "@gshl-types";

export interface TeamRosterProps {
  nhlPlayerStats: PlayerNHLStatLine[] | undefined;
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
