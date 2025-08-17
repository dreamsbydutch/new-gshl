import type { Contract, GSHLTeam, Player, Season, NHLTeam } from "@gshl-types";

/**
 * ContractTableProps
 * All props optional at first render; component shows skeleton until hook marks ready.
 */

export interface ContractTableProps {
  currentSeason?: Season; // allow undefined so parent can still show skeleton via simple check
  currentTeam?: GSHLTeam;
  contracts?: Contract[];
  players?: Player[];
  nhlTeams?: NHLTeam[]; // passed in to avoid internal data fetching
}

/** Props for an individual player contract line item. */
export interface PlayerContractRowProps {
  contract: Contract;
  player?: Player;
  currentSeason: Season;
  nhlTeams: NHLTeam[];
}

/** Props for the dynamic header row. */
export interface TableHeaderProps {
  currentSeason: Season;
}

/** Props for the cap space summary row. */
export interface CapSpaceRowProps {
  currentTeam: GSHLTeam;
  capSpaceByYear: {
    currentYear: number;
    year2026: number;
    year2027: number;
    year2028: number;
  };
}
