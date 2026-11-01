"use client";

import { useState } from "react";
import type {
  MatchupDetailsMatchup,
  MatchupDetailsWeek,
  MatchupPlayerDayRow,
  MatchupPlayerWeekRow,
  PlayerStatRow,
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
  type MatchupPlayerSortDirection,
  type MatchupPlayerView,
} from "@gshl-utils/features/matchup-activity";

import { matchupRosterForDate } from "@gshl-utils/features/matchup-roster";

export function useMatchupPlayerTable(input: {
  matchup: MatchupDetailsMatchup;
  week: MatchupDetailsWeek | null;
  players: MatchupPlayerWeekRow[];
  playerDays: MatchupPlayerDayRow[];
  categories?: readonly string[];
  currentRoster?: PlayerStatRow[];
}) {
  const schedule = useNHLHomeSchedule(3);
  const isActive = isMatchupInPlay(
    input.matchup,
    input.week,
    schedule.selectedDay?.date,
  );
  const [chosenView, setView] = useState<MatchupPlayerView>("week");
  const [sort, setSort] = useState<MatchupPlayerSort>("Rating");
  const [sortDirection, setSortDirection] =
    useState<MatchupPlayerSortDirection>("desc");
  const [advanced, setAdvanced] = useState(false);
  const view = isActive ? chosenView : "week";
  const date = schedule.selectedDay?.date ?? "";
  const today = todayPlayerRows(input.players, input.playerDays, date);
  const todayIds = new Set(
    input.playerDays.filter((p) => p.date === date).map((p) => p.id),
  );
  const roster =
    input.currentRoster ??
    matchupRosterForDate(input.players, input.playerDays, date);
  const source = view === "today" ? today : input.players;
  const allPlayers = new Map<string, PlayerStatRow>(
    source.map((player) => [player.id, player]),
  );
  if (isActive) {
    for (const member of roster) {
      const existing = allPlayers.get(member.id);
      allPlayers.set(
        member.id,
        existing
          ? { ...existing, dailyPos: existing.dailyPos ?? member.dailyPos }
          : member,
      );
    }
    for (const former of input.players) {
      if (!allPlayers.has(former.id))
        allPlayers.set(former.id, {
          id: former.id,
          fullName: former.fullName,
          nhlPos: former.nhlPos,
          posGroup: former.posGroup,
          nhlTeam: former.nhlTeam,
          currentNhlTeam: former.currentNhlTeam,
        });
    }
  }
  const players = sortMatchupPlayers(
    [...allPlayers.values()],
    schedule.games,
    sort,
    sortDirection,
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
    sortDirection,
    toggleSort: (nextSort: MatchupPlayerSort) => {
      if (nextSort === sort) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setSort(nextSort);
      setSortDirection(
        nextSort === "player" || nextSort === "pos" ? "asc" : "desc",
      );
    },
    advanced,
    setAdvanced,
    players,
    columns,
    hasToday: todayIds.size > 0,
    todayIds,
    roster,
    rosterIds: new Set(roster.map((player) => player.id)),
  };
}
