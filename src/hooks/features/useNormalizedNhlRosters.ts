"use client";
import { useMemo, useState } from "react";
import { useNhlRosterAnalytics } from "../main/useNhlRosterAnalytics";
import { buildNormalizedNhlRosters } from "../../lib/utils/domain/normalized-nhl-rosters";

export function useNormalizedNhlRosters() {
  const [seasonStartYear] = useState(() => {
    const now = new Date();
    return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  });
  const [search, setSearch] = useState("");
  const data = useNhlRosterAnalytics(seasonStartYear);
  const teams = useMemo(() => {
    const caps: Record<number, number> = { ...data.caps?.defaults };
    for (const row of data.caps?.overrides ?? [])
      caps[row.seasonStartYear] = row.salaryCap;
    return buildNormalizedNhlRosters(
      data.teams ?? [],
      data.players,
      seasonStartYear,
      caps,
    );
  }, [data.caps, data.teams, data.players, seasonStartYear]);
  const term = search.trim().toLowerCase();
  return {
    seasonStartYear,
    search,
    setSearch,
    isLoading: data.isLoading,
    loaded: data.players.length,
    teams: teams.filter(
      (team) =>
        `${team.name} ${team.abbr}`.toLowerCase().includes(term) ||
        team.roster.some((player) =>
          player.playerName.toLowerCase().includes(term),
        ),
    ),
    teamCount: teams.filter((team) => team.id !== "unassigned").length,
    playerCount: teams.reduce((sum, team) => sum + team.roster.length, 0),
  };
}
