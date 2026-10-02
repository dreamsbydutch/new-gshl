"use client";

import type { MatchupDetailsPayload } from "@gshl-types";
import {
  getMatchupTodayGames,
  isMatchupInPlay,
} from "@gshl-utils/features/matchup-details";
import { useNHLHomeSchedule } from "./useNHLHomeSchedule";

export function useMatchupNHLGames(details: MatchupDetailsPayload) {
  const schedule = useNHLHomeSchedule(3);
  return {
    ...schedule,
    isActive: isMatchupInPlay(
      details.matchup,
      details.week,
      schedule.selectedDay?.date,
    ),
    rows: getMatchupTodayGames(
      schedule.games,
      details.players.away,
      details.players.home,
    ),
  };
}
