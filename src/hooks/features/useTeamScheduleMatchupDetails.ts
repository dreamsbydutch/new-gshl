"use client";

import { useMemo } from "react";
import type {
  TeamScheduleMatchupSummary,
  TeamScheduleTeamSummary,
  TeamScheduleWeekSummary,
} from "@gshl-types";
import { getGameLocation, getGameTypeDisplay } from "@gshl-utils";
import { useTeamScheduleStats } from "../main";

export function useTeamScheduleMatchupDetails({
  enabled,
  matchup,
  week,
  teams,
  selectedTeamId,
}: {
  enabled: boolean;
  matchup: TeamScheduleMatchupSummary;
  week: TeamScheduleWeekSummary | null | undefined;
  teams: TeamScheduleTeamSummary[];
  selectedTeamId: string;
}) {
  const homeTeam = useMemo(
    () => teams.find((team) => team.id === matchup.homeTeamId),
    [matchup.homeTeamId, teams],
  );
  const awayTeam = useMemo(
    () => teams.find((team) => team.id === matchup.awayTeamId),
    [matchup.awayTeamId, teams],
  );
  const gameLocation = useMemo(
    () => getGameLocation(matchup, selectedTeamId),
    [matchup, selectedTeamId],
  );

  const isHomeTeamSelected =
    String(matchup.homeTeamId) === String(selectedTeamId);
  const selectedTeam = isHomeTeamSelected ? homeTeam : awayTeam;
  const opponentTeam = isHomeTeamSelected ? awayTeam : homeTeam;
  const hasRecordedScore =
    matchup.homeScore !== null || matchup.awayScore !== null;

  const statsQuery = useTeamScheduleStats({
    seasonId: String(matchup.seasonId),
    weekId: String(matchup.weekId),
    homeTeamId: String(matchup.homeTeamId),
    awayTeamId: String(matchup.awayTeamId),
    enabled: enabled && hasRecordedScore,
  });
  const homeTeamStats = statsQuery.data.home;
  const awayTeamStats = statsQuery.data.away;

  const selectedTeamStats = isHomeTeamSelected ? homeTeamStats : awayTeamStats;
  const opponentStats = isHomeTeamSelected ? awayTeamStats : homeTeamStats;
  const selectedTeamScore = isHomeTeamSelected
    ? matchup.homeScore
    : matchup.awayScore;
  const opponentScore = isHomeTeamSelected
    ? matchup.awayScore
    : matchup.homeScore;

  const gameDisplay = useMemo(
    () =>
      getGameTypeDisplay(
        String(matchup.gameType),
        week ?? undefined,
        gameLocation,
        awayTeam,
        homeTeam,
      ),
    [awayTeam, gameLocation, homeTeam, matchup.gameType, week],
  );

  return {
    awayTeam,
    canExpand: hasRecordedScore,
    gameDisplay,
    gameLocation,
    hasStats: Boolean(selectedTeamStats && opponentStats),
    homeTeam,
    isLoadingStats: statsQuery.isLoading,
    opponentScore: opponentScore ?? null,
    opponentStats,
    opponentTeam,
    selectedTeam,
    selectedTeamScore: selectedTeamScore ?? null,
    selectedTeamStats,
  };
}
