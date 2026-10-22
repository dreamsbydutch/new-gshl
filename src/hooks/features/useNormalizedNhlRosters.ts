"use client";
import { useMemo, useState } from "react";
import { useNhlRosterAnalytics } from "../main/useNhlRosterAnalytics";
import { buildNormalizedNhlRosters } from "../../lib/utils/domain/normalized-nhl-rosters";
import { rankNhlRosterTalent } from "../../lib/utils/domain/nhl-roster-talent";
import { buildHistoricalNhlRosterTalent } from "../../lib/utils/domain/nhl-historical-roster-talent";
import {
  parseNhlTalentForecastArtifact,
  predictNhlContractTalent,
} from "../../lib/utils/domain/nhl-contract-talent-forecast";
import forecastJson from "../../lib/data/nhl-contract-talent-forecast.json";

const forecast = parseNhlTalentForecastArtifact(forecastJson);

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
  const talentTeams = useMemo(() => {
    if (seasonStartYear < data.currentYear)
      return data.talentPopulation
        ? buildHistoricalNhlRosterTalent(
            teams,
            data.players,
            data.talentPopulation,
          )
        : [];
    if (
      seasonStartYear !== data.currentYear ||
      seasonStartYear !== forecast.cutoffYear
    )
      return [];
    const byId = new Map(data.players.map((player) => [player.id, player]));
    return rankNhlRosterTalent(
      teams
        .filter((team) => team.id !== "unassigned")
        .map((team) => ({
          id: team.id,
          name: team.name,
          abbr: team.abbr,
          roster: team.roster.map((player) => {
            const nhlPlayerId = byId.get(player.id)?.nhlPlayerId ?? null;
            const prediction =
              nhlPlayerId === null
                ? null
                : predictNhlContractTalent(forecast, {
                    nhlPlayerId,
                    targetYear: seasonStartYear + 1,
                  });
            return {
              id: player.id,
              nhlPlayerId,
              playerName: player.playerName,
              position: player.position,
              gar:
                prediction?.position === player.position &&
                prediction.status !== "unavailable"
                  ? prediction.valuePer82
                  : null,
              status:
                prediction?.position === player.position &&
                prediction.valuePer82 !== null
                  ? prediction.status
                  : ("unavailable" as const),
            };
          }),
        })),
    );
  }, [
    teams,
    data.players,
    data.currentYear,
    data.talentPopulation,
    seasonStartYear,
  ]);
  const term = search.trim().toLowerCase();
  const matchingTeams = new Set(
    teams
      .filter(
        (team) =>
          `${team.name} ${team.abbr}`.toLowerCase().includes(term) ||
          team.roster.some((player) =>
            player.playerName.toLowerCase().includes(term),
          ),
      )
      .map((team) => team.id),
  );
  return {
    currentYear: data.currentYear,
    latestHistoricalYear: data.seasons
      ?.filter((s) => s.seasonStartYear < data.currentYear)
      .at(-1)?.seasonStartYear,
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
    talentTeams: talentTeams.filter((team) => matchingTeams.has(team.id)),
    talentBasis:
      seasonStartYear < data.currentYear
        ? ("historical" as const)
        : ("projected" as const),
    talentNeedsRefresh:
      seasonStartYear === data.currentYear &&
      seasonStartYear !== forecast.cutoffYear,
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
