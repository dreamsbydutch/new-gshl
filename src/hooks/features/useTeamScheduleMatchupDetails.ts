"use client";

import { useMemo } from "react";
import type { GSHLTeam, Matchup, TeamWeekStatLine, Week } from "@gshl-types";
import { getGameLocation, getGameTypeDisplay } from "@gshl-utils";
import { findTeamById } from "@gshl-utils/domain/team";
import { useTeams } from "../main";

export function useTeamScheduleMatchupDetails({
  matchup,
  week,
  teams,
  selectedTeamId,
}: {
  matchup: Matchup;
  week: Week | undefined;
  teams: GSHLTeam[];
  selectedTeamId: string;
}) {
  const homeTeam = useMemo(
    () => findTeamById(teams, matchup.homeTeamId),
    [matchup.homeTeamId, teams],
  );
  const awayTeam = useMemo(
    () => findTeamById(teams, matchup.awayTeamId),
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

  const { data: teamWeeksRaw = [], isLoading: teamWeeksLoading } = useTeams({
    statsLevel: "weekly",
    weekId: String(matchup.weekId),
    enabled: hasRecordedScore && Boolean(matchup.weekId),
  });

  const teamWeeks = teamWeeksRaw as TeamWeekStatLine[];
  const homeTeamStats = useMemo(
    () =>
      teamWeeks.find(
        (teamWeek) => String(teamWeek.gshlTeamId) === String(matchup.homeTeamId),
      ),
    [matchup.homeTeamId, teamWeeks],
  );
  const awayTeamStats = useMemo(
    () =>
      teamWeeks.find(
        (teamWeek) => String(teamWeek.gshlTeamId) === String(matchup.awayTeamId),
      ),
    [matchup.awayTeamId, teamWeeks],
  );

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
        week,
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
    isLoadingStats: teamWeeksLoading,
    opponentScore: opponentScore ?? null,
    opponentStats,
    opponentTeam,
    selectedTeam,
    selectedTeamScore: selectedTeamScore ?? null,
    selectedTeamStats,
  };
}
