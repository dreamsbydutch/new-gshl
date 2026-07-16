import type {
  Contract,
  DraftPick,
  GSHLTeam,
  Player,
  Season,
} from "@gshl-types";
import type {
  TeamDraftPickListProps,
  ProcessedDraftPick,
  DraftPickItemProps,
} from "@gshl-types";
import { getSeasonString, toIsoDateOnly } from "../core";

// Re-export types for backward compatibility
export type { TeamDraftPickListProps, ProcessedDraftPick, DraftPickItemProps };

/**
 * Formats draft pick description for display.
 *
 * @param draftPick - The draft pick to use.
 * @returns The formatted draft pick description.
 */
export const formatDraftPickDescription = (draftPick: DraftPick): string => {
  const roundText = `${draftPick.round} Round`;
  const overallText = Number.isInteger(+draftPick.pick)
    ? `, ${draftPick.pick} Overall`
    : "";
  return `${roundText}${overallText}`;
};

/**
 * Provide a '(via Team Name)' suffix when the pick originated from another franchise.
 * @param draftPick Subject pick.
 * @param teams All teams (for name lookup by franchiseId).
 * @param originalTeam Original team entity when different from owning team.
 * @returns Suffix string or empty when no difference.
 */
export const getOriginalTeamName = (
  teams: GSHLTeam[],
  originalTeam: GSHLTeam | undefined,
): string => {
  if (!originalTeam) return "";
  const teamName = teams.find(
    (team) => team.franchiseId === originalTeam.franchiseId,
  )?.name;
  return teamName ? ` (via ${teamName})` : "";
};

/**
 * Checks whether draft pick available.
 *
 * @param draftPicks - The draft picks to use.
 * @param contracts - The contracts to use.
 * @param index - The index to use.
 * @returns True when draft pick available; otherwise false.
 */
export const isDraftPickAvailable = (
  draftPicks: DraftPick[],
  contracts: Contract[],
  index: number,
): boolean => draftPicks.length - index > contracts.length;

/**
 * Resolve the player chosen for an already-used draft pick.
 * Inverse maps pick index to contract index (latest picks correlate to last contracts).
 * @param contracts Ordered contracts corresponding to filled picks.
 * @param players Player entities for id -> player lookup.
 * @param draftPicks All draft picks (for length-based index mapping).
 * @param index Current pick index in ascending pick order.
 */
export const getSelectedPlayer = (
  contracts: Contract[],
  players: Player[],
  draftPicks: DraftPick[],
  index: number,
): Player | undefined => {
  const contractIndex = draftPicks.length - index - 1;
  const contract = contracts[contractIndex];
  if (!contract) return undefined;
  return players.find((player) => player.id === contract.playerId);
};

/**
 * Shifts season date.
 *
 * @param dateValue - The date value to use.
 * @param yearOffset - The year offset to use.
 * @returns The shifted season date.
 */
export function shiftSeasonDate(dateValue: string, yearOffset: number): string {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return dateValue;

  parsed.setFullYear(parsed.getFullYear() + yearOffset);
  return toIsoDateOnly(parsed);
}

/**
 * Builds synthetic season.
 *
 * @param previousSeason - The previous season to use.
 * @param id - The id to use.
 * @returns The assembled synthetic season.
 */
export function buildSyntheticSeason(
  previousSeason: Season,
  id: string,
): Season {
  const nextEndYear = Number(previousSeason.year) + 1;

  return {
    ...previousSeason,
    id,
    year: nextEndYear,
    name: getSeasonString(nextEndYear - 1),
    startDate: shiftSeasonDate(previousSeason.startDate, 1),
    endDate: shiftSeasonDate(previousSeason.endDate, 1),
    signingEndDate: shiftSeasonDate(previousSeason.signingEndDate, 1),
    isActive: false,
  };
}
