import type { Contract, DraftPick, GSHLTeam, Player } from "@gshl-types";

export const formatDraftPickDescription = (draftPick: DraftPick) => {
  const roundText = `${draftPick.round} Round`;
  const overallText = Number.isInteger(+draftPick.pick)
    ? `, ${draftPick.pick} Overall`
    : "";

  return `${roundText}${overallText}`;
};

export const getOriginalTeamName = (
  draftPick: DraftPick,
  teams: GSHLTeam[],
  originalTeam: GSHLTeam | undefined,
) => {
  if (!originalTeam) return "";

  const teamName = teams.find(
    (team) => team.franchiseId === originalTeam.franchiseId,
  )?.name;

  return teamName ? ` (via ${teamName})` : "";
};

export const isDraftPickAvailable = (
  draftPicks: DraftPick[],
  contracts: Contract[],
  index: number,
) => {
  return draftPicks.length - index > contracts.length;
};

export const getSelectedPlayer = (
  contracts: Contract[],
  players: Player[],
  draftPicks: DraftPick[],
  index: number,
) => {
  const contractIndex = draftPicks.length - index - 1;
  const contract = contracts[contractIndex];

  if (!contract) return undefined;

  return players.find((player) => player.id === contract.playerId);
};
