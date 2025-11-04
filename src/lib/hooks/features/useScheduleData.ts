"use client";

import { useMemo } from "react";
import {
  type GSHLTeam,
  type Matchup,
  MatchupType,
  type Season,
  type Week,
} from "@gshl-types";

// Helper function to map game type categories to actual MatchupType values
const getGameTypeFilter = (gameTypeCategory: string): MatchupType[] => {
  switch (gameTypeCategory) {
    case "RS": // Regular Season
      return [MatchupType.CONFERENCE, MatchupType.NON_CONFERENCE];
    case "CC": // Conference
      return [MatchupType.CONFERENCE];
    case "NC": // Non-Conference
      return [MatchupType.NON_CONFERENCE];
    case "PO": // Playoffs
      return [
        MatchupType.QUATER_FINAL,
        MatchupType.SEMI_FINAL,
        MatchupType.FINAL,
      ];
    case "LT": // Losers Tournament
      return [MatchupType.LOSERS_TOURNAMENT];
    default:
      return []; // For "All" or any other values, return empty array (no filtering)
  }
};

interface UseScheduleDataParams {
  ownerID?: string;
  seasonID?: number;
  gameType?: string;
  oppOwnerID?: number;
}

interface UseScheduleDataReturn {
  data:
    | (Matchup & { week: Week | undefined; season: Season | undefined })[]
    | undefined;
}

export const useScheduleData = (
  params: UseScheduleDataParams,
  allMatchups?: Matchup[],
  teams?: GSHLTeam[],
  weeks?: Week[],
  seasons?: Season[],
): UseScheduleDataReturn => {
  const filteredSchedule = useMemo(() => {
    if (!allMatchups || !teams) return undefined;

    let filtered = allMatchups.map((m) => {
      return {
        ...m,
        week: weeks?.find((w) => w.id === m.weekId),
        season: seasons?.find((s) => s.id === m.seasonId),
      };
    });

    // Filter by owner ID
    if (params.ownerID) {
      filtered = filtered.filter((matchup) => {
        const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
        const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);
        return (
          homeTeam?.ownerId === params.ownerID ||
          awayTeam?.ownerId === params.ownerID
        );
      });
    }

    // Filter by season
    if (params.seasonID && params.seasonID > 0) {
      filtered = filtered.filter(
        (matchup) => +matchup.seasonId === params.seasonID,
      );
    }

    // Filter by game type
    if (params.gameType && params.gameType !== "") {
      const gameTypeFilter = getGameTypeFilter(params.gameType);
      if (gameTypeFilter.length > 0) {
        filtered = filtered.filter((matchup) =>
          gameTypeFilter.includes(matchup.gameType),
        );
      }
    }

    // Filter by opponent owner ID
    if (params.oppOwnerID && params.oppOwnerID > 0) {
      filtered = filtered.filter((matchup) => {
        const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
        const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);

        // If the current team is home, check if the opponent owner is away
        // If the current team is away, check if the opponent owner is home
        if (homeTeam?.ownerId === params.ownerID) {
          return awayTeam?.ownerId === params.oppOwnerID;
        } else if (awayTeam?.ownerId === params.ownerID) {
          return homeTeam?.ownerId === params.oppOwnerID;
        }
        return false;
      });
    }

    // Sort by season and then by week number for consistent display
    return filtered.sort((a, b) => {
      if (a.seasonId !== b.seasonId) {
        return +b.seasonId - +a.seasonId; // Most recent season first
      }
      return +a.weekId - +b.weekId; // Early weeks first within the same season
    });
  }, [
    allMatchups,
    teams,
    params.ownerID,
    params.seasonID,
    params.gameType,
    params.oppOwnerID,
    weeks,
    seasons,
  ]);

  return {
    data: filteredSchedule
      ?.sort((a, b) => (a.week?.weekNum ?? 0) - (b.week?.weekNum ?? 0))
      .sort((a, b) => +a.seasonId - +b.seasonId),
  };
};
