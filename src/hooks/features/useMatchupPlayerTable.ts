"use client";

import { useState } from "react";
import type {
  MatchupDetailsMatchup,
  MatchupDetailsWeek,
  MatchupPlayerDayRow,
  MatchupPlayerWeekRow,
} from "@gshl-types";
import { useNHLHomeSchedule } from "./useNHLHomeSchedule";
import {
  isMatchupInPlay,
  buildPlayerStatColumns,
} from "@gshl-utils/features/matchup-details";
import {
  sortMatchupPlayers,
  todayPlayerRows,
  type MatchupPlayerSort,
  type MatchupPlayerView,
} from "@gshl-utils/features/matchup-activity";

export function useMatchupPlayerTable(input: {
  matchup: MatchupDetailsMatchup;
  week: MatchupDetailsWeek | null;
  players: MatchupPlayerWeekRow[];
  playerDays: MatchupPlayerDayRow[];
  categories?: readonly string[];
}) {
  const schedule = useNHLHomeSchedule(3);
  const isActive = isMatchupInPlay(
    input.matchup,
    input.week,
    schedule.selectedDay?.date,
  );
  const [chosenView, setView] = useState<MatchupPlayerView>("today");
  const [chosenSort, setSort] = useState<MatchupPlayerSort>("activity");
  const [advanced, setAdvanced] = useState(false);
  const view = isActive ? chosenView : "week";
  const sort =
    !isActive && chosenSort === "activity"
      ? "rating"
      : view === "today" && chosenSort === "rating"
        ? "activity"
        : chosenSort;
  const date = schedule.selectedDay?.date ?? "";
  const today = todayPlayerRows(input.players, input.playerDays, date);
  const todayIds = new Set(
    input.playerDays.filter((p) => p.date === date).map((p) => p.id),
  );
  const players = sortMatchupPlayers(
    view === "today" ? today : input.players,
    schedule.games,
    sort,
  );
  const columns = buildPlayerStatColumns({
    players,
    categories: input.categories,
  })
    .filter((column) => column.key !== "nhlTeam")
    .filter(
      (column) =>
        view !== "today" ||
        !["Rating", "days", "GS", "GP"].includes(column.key),
    )
    .filter(
      (column) =>
        advanced ||
        !["days", "MG", "MS", "BS", "ADD", "IR", "IRplus"].includes(column.key),
    )
    .map((column) =>
      column.key === "Rating"
        ? { ...column, label: "Week rating / 100" }
        : column,
    );
  if (view === "today")
    columns.splice(2, 0, { key: "dailyPos", label: "Slot" });
  return {
    schedule,
    isActive,
    view,
    setView,
    sort,
    setSort,
    advanced,
    setAdvanced,
    players,
    columns,
    hasToday: todayIds.size > 0,
    todayIds,
  };
}
