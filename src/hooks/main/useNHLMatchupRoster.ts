"use client";

import type { NHLGame } from "@gshl-lib/types/nhl";
import { nhlMatchupRosterSchema } from "@gshl-utils/features/nhl-matchup";
import { NHL_SCHEDULE_REFRESH_SECONDS } from "@gshl-utils/features/nhl";
import { useNHLResource } from "./useNHL";

export function useNHLMatchupRoster(game?: NHLGame) {
  const query = useNHLResource(
    game ? `/api/nhl/game/${game.id}/roster` : null,
    nhlMatchupRosterSchema,
    NHL_SCHEDULE_REFRESH_SECONDS,
  );
  return {
    ...query,
    season: query.data?.season,
    players: query.data?.players ?? [],
  };
}
