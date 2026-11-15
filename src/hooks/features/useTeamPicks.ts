"use client";

import { useState } from "react";
import { useDraftPicks, usePlayersByIds } from "../main";
import type { GSHLTeam, Season } from "@gshl-types";
import { resolveDraftHubSeason } from "@gshl-utils";

export function useTeamPicks(
  team: GSHLTeam,
  teams: GSHLTeam[],
  seasons: Season[],
) {
  const [selection, selectSeason] = useState<string | null>(null);
  const season =
    seasons.find((item) => item.id === selection) ??
    resolveDraftHubSeason(seasons) ??
    seasons.find((item) => item.id === team.seasonId);
  const picks = useDraftPicks({
    seasonId: season?.id,
    enabled: Boolean(season),
  });
  const franchiseTeamIds = new Set(
    teams
      .filter((item) => item.franchiseId === team.franchiseId)
      .map((item) => item.id),
  );
  const ownedPicks = picks.data.filter((pick) =>
    franchiseTeamIds.has(pick.gshlTeamId),
  );
  const players = usePlayersByIds(
    ownedPicks.flatMap((pick) => (pick.playerId ? [pick.playerId] : [])),
  );
  return {
    season,
    selectSeason,
    picks: ownedPicks,
    players: players.data,
    isLoading: picks.isLoading || players.isLoading,
  };
}
