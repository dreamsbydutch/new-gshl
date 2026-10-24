"use client";
import { useMemo, useState } from "react";
import { useNhlRosterAnalytics } from "../main/useNhlRosterAnalytics";
import { useNhlOrganizations } from "../main/useNhlOrganizations";
import { buildNormalizedNhlRosters } from "../../lib/utils/domain/normalized-nhl-rosters";
import { rankNhlRosterTalent } from "../../lib/utils/domain/nhl-roster-talent";
import { buildHistoricalNhlRosterTalent } from "../../lib/utils/domain/nhl-historical-roster-talent";
import {
  parseNhlTalentForecastArtifact,
  predictNhlContractTalent,
} from "../../lib/utils/domain/nhl-contract-talent-forecast";
import forecastJson from "../../lib/data/nhl-contract-talent-forecast.json";
import conditionalJson from "../../lib/data/nhl-conditional-talent.json";
import usageJson from "../../lib/data/nhl-lineup-usage.json";
import { parseNhlLineupUsageArtifact } from "../../lib/utils/domain/nhl-lineup-usage";
import { parseConditionalNhlTalentArtifact } from "../../lib/utils/domain/nhl-conditional-talent";
import { buildProjectedNhlLineupGar } from "../../lib/utils/domain/nhl-projected-lineup-gar";

const forecast = parseNhlTalentForecastArtifact(forecastJson);
const conditional = parseConditionalNhlTalentArtifact(conditionalJson);
const usage = parseNhlLineupUsageArtifact(usageJson);

export function useNormalizedNhlRosters() {
  const [seasonStartYear, setSeasonStartYear] = useState(() => {
    const now = new Date();
    return now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  });
  const [search, setSearch] = useState("");
  const [projectionBasis, setProjectionBasis] = useState<
    "conditional" | "standard" | "expected"
  >("conditional");
  const data = useNhlRosterAnalytics(seasonStartYear);
  const organizations = useNhlOrganizations(
    seasonStartYear === data.currentYear ? seasonStartYear : null,
  );
  const organizationTeams = useMemo(() => {
    const ids = new Map(
      data.players
        .filter((p) => p.nhlPlayerId)
        .map((p) => [p.nhlPlayerId, p.id]),
    );
    return (organizations.data?.teams ?? []).map((team) => ({
      id:
        data.teams?.find((t) => t.abbr === team.abbr)?.id ?? `nhl:${team.abbr}`,
      name: team.name,
      abbr: team.abbr,
      selectionPolicy: "nhl-first" as const,
      roster: team.roster.map((player) => ({
        ...player,
        id: ids.get(player.nhlPlayerId) ?? `nhl:${player.nhlPlayerId}`,
      })),
    }));
  }, [organizations.data, data.players, data.teams]);
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
    return rankNhlRosterTalent(
      organizationTeams.map((team) => ({
        id: team.id,
        name: team.name,
        abbr: team.abbr,
        selectionPolicy: team.selectionPolicy,
        roster: team.roster.map((player) => {
          const nhlPlayerId = player.nhlPlayerId;
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
            membership: player.membership,
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
    organizationTeams,
    data.players,
    data.currentYear,
    data.talentPopulation,
    seasonStartYear,
  ]);
  const conditionalTeams = useMemo(() => {
    if (
      seasonStartYear !== data.currentYear ||
      seasonStartYear !== conditional.cutoffYear ||
      !organizations.data ||
      (projectionBasis === "conditional" &&
        seasonStartYear !== usage.cutoffYear)
    )
      return [];
    return buildProjectedNhlLineupGar(
      organizations.data,
      conditional,
      usage,
      seasonStartYear + 1,
      projectionBasis === "conditional" ? "projected" : "standard",
    ).map((team) => ({
      ...team,
      id: organizationTeams.find((t) => t.abbr === team.abbr)?.id ?? team.id,
    }));
  }, [
    organizations.data,
    organizationTeams,
    data.currentYear,
    seasonStartYear,
    projectionBasis,
  ]);
  const term = search.trim().toLowerCase();
  const matchingTeams = new Set(
    [...teams, ...organizationTeams]
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
    isLoading: data.isLoading || organizations.isLoading,
    organizationError: organizations.error,
    retryOrganizations: organizations.retry,
    loaded: data.players.length,
    projectionBasis,
    setProjectionBasis,
    talentTeams: (seasonStartYear === data.currentYear &&
    projectionBasis !== "expected"
      ? conditionalTeams
      : talentTeams
    ).filter((team) => matchingTeams.has(team.id)),
    talentBasis:
      seasonStartYear < data.currentYear
        ? ("historical" as const)
        : projectionBasis !== "expected"
          ? ("conditional" as const)
          : ("projected" as const),
    lineupUsageBasis:
      projectionBasis === "conditional"
        ? ("projected" as const)
        : ("standard" as const),
    talentNeedsRefresh:
      seasonStartYear === data.currentYear &&
      (projectionBasis === "expected"
        ? seasonStartYear !== forecast.cutoffYear
        : seasonStartYear !== conditional.cutoffYear ||
          (projectionBasis === "conditional" &&
            seasonStartYear !== usage.cutoffYear)),
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
