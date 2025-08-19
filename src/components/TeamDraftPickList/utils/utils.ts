import type { Contract, DraftPick, GSHLTeam, Player } from "@gshl-types";

/**
 * Format a draft pick into human-readable round / overall string.
 * Example: Round 1, 3 Overall
 * @param draftPick Draft pick entity.
 * @returns String description (no trailing punctuation).
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
  draftPick: DraftPick,
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
 * Determine if a draft pick slot is still available (no contract/player selected yet).
 * Logic: Remaining picks after current index exceed number of contracts (selected players).
 * @remarks Assumes contracts are ordered from earliest selection to latest mapping end.
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
