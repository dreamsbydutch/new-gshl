"use client";

import type { MatchupDetailsPayload } from "@gshl-types";
import {
  getMatchupTodayGames,
  isMatchupInPlay,
} from "@gshl-utils/features/matchup-details";
import { useNHLHomeSchedule } from "./useNHLHomeSchedule";
import { isMatchupUpcoming } from "@gshl-utils/features/matchup-preview";

export function useMatchupNHLGames(details: MatchupDetailsPayload) {
  const schedule = useNHLHomeSchedule(3);
  return {
    ...schedule,
    isUpcoming: isMatchupUpcoming(
      details.matchup,
      details.week,
      schedule.selectedDay?.date,
    ),
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
