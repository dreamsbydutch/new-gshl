import type { Contract, GSHLTeam, NHLTeam, Player } from "./database";

export interface TeamRosterProps {
  players: Player[] | undefined;
  contracts: Contract[];
  currentTeam: GSHLTeam;
  showSalaries?: boolean;
}

export interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface RosterLineupProps {
  teamLineup: Array<Array<Array<Player | null>>>;
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export interface RosterCapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  totalCapHit: number;
}

export type CapSpaceDisplayProps = RosterCapSpaceDisplayProps;
