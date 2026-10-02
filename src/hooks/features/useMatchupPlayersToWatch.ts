"use client";

import { useTeams } from "../main/useTeam";
import { useRosterPlayers } from "../main/usePlayer";
import { selectPlayersToWatch } from "@gshl-utils/features/matchup-preview";

export function useMatchupPlayersToWatch(teamId: string) {
  const team = useTeams({ teamId, enabled: Boolean(teamId) });
  const ownerId =
    team.data.find((row) => row.id === teamId)?.ownerId ?? undefined;
  const roster = useRosterPlayers({ ownerId, includeInactive: true });
  return {
    players: selectPlayersToWatch(roster.data),
    isLoading: team.isLoading || roster.isLoading,
  };
}
