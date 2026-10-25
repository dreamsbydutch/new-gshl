"use client";

import type { MatchupDetailsPayload } from "@gshl-types";
import { useNHLHomeSchedule } from "./useNHLHomeSchedule";
import { isMatchupInPlay } from "@gshl-utils/features/matchup-details";
import {
  matchupDayPlayers,
  matchupDaySummary,
} from "@gshl-utils/features/matchup-activity";

export function useMatchupActivity(details: MatchupDetailsPayload) {
  const schedule = useNHLHomeSchedule(3);
  const date = schedule.selectedDay?.date ?? "";
  return {
    schedule,
    date,
    isActive: isMatchupInPlay(details.matchup, details.week, date),
    teams: (["away", "home"] as const).map((side) => {
      const players = matchupDayPlayers(details.playerDays?.[side] ?? [], date);
      return {
        side,
        team: details.teams[side],
        available: players.length > 0,
        ...matchupDaySummary(players, schedule.games),
      };
    }),
  };
}
