import type { Contract, GSHLTeam, Player, Season, NHLTeam } from "@gshl-types";

export const CAP_CEILING = 25000000;
export const CAP_SEASON_END_MONTH = 3; // April (0-indexed)
export const CAP_SEASON_END_DAY = 19;

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
  capSpaceWindow: { label: string; year: number; remaining: number }[]; // length 5 (current + next 4)
}

/**
 * Maps a contract expiry status to Tailwind utility classes for badge styling.
 * @param expiryStatus - Contract expiry status (e.g. "RFA", "UFA", "Buyout")
 * @returns Tailwind class string (empty string if no special styling)
 */
export const getExpiryStatusClass = (expiryStatus: string) => {
  if (expiryStatus === "RFA") {
    return "bg-orange-100 text-orange-700";
  }
  if (expiryStatus === "UFA") {
    return "bg-rose-100 text-rose-800";
  }
  return "";
};

/**
 * Produces a future season display label given a base season name and offset.
 * Assumes the season name begins with the 4-digit starting year (e.g. "2024-25").
 * @param seasonName - Base season name string
 * @param yearOffset - Number of seasons ahead to display (1 => next season)
 * @returns A label like "2025-26"
 */
export const getSeasonDisplay = (seasonName: string, yearOffset: number) => {
  const year = +seasonName.slice(0, 4) + yearOffset;
  return `${year}-${year - 1999}`;
};
