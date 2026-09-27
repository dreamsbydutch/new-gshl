"use client";

import { useState } from "react";
import { useNHLGame } from "../main/useNHL";
import { useNHLMatchupRoster } from "../main/useNHLMatchupRoster";
import { useAppSearchParams } from "../main/useNextNavigation";
import { buildNHLMatchupPlayers } from "@gshl-utils/features/nhl-matchup";
import { buildScheduleNavigationHref } from "@gshl-utils/features/contextual-navigation";

export function useNHLMatchupData(gameId: string) {
  const query = useNHLGame(gameId);
  const roster = useNHLMatchupRoster(query.data);
  const { searchParams } = useAppSearchParams();
  const [side, setSide] = useState<"away" | "home">("away");
  const players = query.data
    ? buildNHLMatchupPlayers({ game: query.data, ...roster })
    : [];
  return {
    ...query,
    game: query.data,
    players: players.filter((player) => player.side === side),
    side,
    setSide,
    rosterLoading: roster.isLoading,
    rosterError: roster.error,
    hasSeason: Boolean(roster.season),
    backHref: buildScheduleNavigationHref("", {
      view: "nhl",
      season: roster.season?.id ?? searchParams.get("season"),
      week: searchParams.get("week"),
    }),
  };
}
