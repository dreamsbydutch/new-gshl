"use client";
import { useMemo, useState } from "react";
import { useNhlRosterAnalytics } from "../main/useNhlRosterAnalytics";
import { buildNormalizedNhlRosters } from "../../lib/utils/domain/normalized-nhl-rosters";

export function useNormalizedNhlRosters() {
  const [seasonStartYear, setSeasonStartYear] = useState(() => {
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
      seasonStartYear > data.currentYear
        ? "future"
        : seasonStartYear < data.currentYear
          ? "historical"
          : "current",
    );
  }, [data.caps, data.teams, data.players, data.currentYear, seasonStartYear]);
  const term = search.trim().toLowerCase();
  return {
    seasonStartYear,
    setSeasonStartYear,
    mode:
      seasonStartYear > data.currentYear
        ? "future"
        : seasonStartYear < data.currentYear
          ? "historical"
          : "current",
    seasons: [
      ...new Set([
        ...(data.seasons ?? [])
          .map((row) => row.seasonStartYear)
          .filter((year) => year < data.currentYear),
        ...Array.from({ length: 6 }, (_, index) => data.currentYear + index),
      ]),
    ].sort((a, b) => a - b),
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
    calculatedPlayers: teams.reduce(
      (sum, team) => sum + team.calculatedPlayers,
      0,
    ),
    unassignedPlayers:
      teams.find((team) => team.id === "unassigned")?.roster.length ?? 0,
  };
}
