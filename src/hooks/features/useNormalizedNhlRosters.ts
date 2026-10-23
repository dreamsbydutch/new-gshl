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
import conditionalJson from "../../lib/data/nhl-conditional-talent.json";
import {
  parseConditionalNhlTalentArtifact,
  predictConditionalNhlTalent,
} from "../../lib/utils/domain/nhl-conditional-talent";
import { rankConditionalNhlRosterTalent } from "../../lib/utils/domain/nhl-conditional-roster-talent";

const forecast = parseNhlTalentForecastArtifact(forecastJson);
const conditional = parseConditionalNhlTalentArtifact(conditionalJson);

export function useNormalizedNhlRosters() {
  const [seasonStartYear, setSeasonStartYear] = useState(() => {
    const now = new Date();
    return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  });
  const [search, setSearch] = useState("");
  const [projectionBasis, setProjectionBasis] = useState<
    "conditional" | "expected"
  >("conditional");
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
  const conditionalTeams = useMemo(() => {
    if (
      seasonStartYear !== data.currentYear ||
      seasonStartYear !== conditional.cutoffYear
    )
      return [];
    const identities = new Map(
      data.players.map((player) => [player.id, player.nhlPlayerId]),
    );
    return rankConditionalNhlRosterTalent(
      teams
        .filter((team) => team.id !== "unassigned")
        .map((team) => ({
          id: team.id,
          name: team.name,
          abbr: team.abbr,
          roster: team.roster.map((player) => {
            const nhlPlayerId = identities.get(player.id) ?? null;
            const prediction = nhlPlayerId
              ? predictConditionalNhlTalent(
                  conditional,
                  nhlPlayerId,
                  seasonStartYear + 1,
                )
              : null;
            const matches = prediction?.position === player.position;
            return {
              id: player.id,
              nhlPlayerId,
              playerName: player.playerName,
              position: player.position,
              ratePer60: matches ? prediction.ratePer60 : null,
              status: matches ? prediction.status : ("unavailable" as const),
            };
          }),
        })),
    );
  }, [teams, data.players, data.currentYear, seasonStartYear]);
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
    projectionBasis,
    setProjectionBasis,
    talentTeams: (seasonStartYear === data.currentYear &&
    projectionBasis === "conditional"
      ? conditionalTeams
      : talentTeams
    ).filter((team) => matchingTeams.has(team.id)),
    talentBasis:
      seasonStartYear < data.currentYear
        ? ("historical" as const)
        : projectionBasis === "conditional"
          ? ("conditional" as const)
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
