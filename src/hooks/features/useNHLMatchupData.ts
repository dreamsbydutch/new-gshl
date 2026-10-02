"use client";

import { useState } from "react";
import { buildNHLGameEvents } from "@gshl-utils/features/nhl-events";
import { useNHLGame } from "../main/useNHL";
import { useNHLMatchupRoster } from "../main/useNHLMatchupRoster";
import { useAppSearchParams } from "../main/useNextNavigation";
import { buildScheduleNavigationHref } from "@gshl-utils/features/contextual-navigation";

export function useNHLMatchupData(gameId: string) {
  const query = useNHLGame(gameId);
  const roster = useNHLMatchupRoster(query.data);
  const { searchParams } = useAppSearchParams();
  const [side, setSide] = useState<"away" | "home">("away");
  const players = roster.players;
  return {
    ...query,
    game: query.data,
    events: buildNHLGameEvents(query.data?.eventFeed, players),
    players: players.filter((player) => player.side === side),
    side,
    setSide,
    rosterLoading: roster.isLoading,
    rosterError: roster.error,
    retryRoster: roster.retry,
    hasSeason: Boolean(roster.season),
    backHref: buildScheduleNavigationHref("", {
      view: "nhl",
      season: roster.season?.id ?? searchParams.get("season"),
      week: searchParams.get("week"),
    }),
  };
}
