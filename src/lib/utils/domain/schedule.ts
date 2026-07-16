/**
 * Schedule Domain Utilities
 * -------------------------
 * Domain-specific constants and utilities for game schedules, conferences, and matchups.
 * Used across team-schedule and weekly-schedule features.
 */

import type { Matchup, Week } from "@gshl-types";

/**
 * Game type abbreviations used throughout the schedule system.
 * Covers regular season, conference championships, and all playoff rounds.
 */
export const GAME_TYPES = {
  QUARTER_FINAL: "QF",
  SEMI_FINAL: "SF",
  FINAL: "F",
  LOSERS_TOURNAMENT: "LT",
  REGULAR_SEASON: "RS",
  CONFERENCE_CHAMPIONSHIP: "CC",
  NON_CONFERENCE: "NC", // Used by weekly schedule
} as const;

/**
 * Conference abbreviations for Sunview and Hickory Hotel.
 */
export const CONFERENCE_ABBR = {
  SUNVIEW: "SV",
  HICKORY_HOTEL: "HH",
} as const;

/**
 * Conference configurations with display properties.
 * Used by team-schedule for styling conference-specific elements.
 */
export const CONFERENCES = {
  HICKORY_HOTEL: {
    abbr: "HH" as const,
    textColor: "text-hotel-800",
  },
  SUNVIEW: {
    abbr: "SV" as const,
    textColor: "text-sunview-800",
  },
} as const;

/**
 * Game location constants (home/away).
 */
export const GAME_LOCATIONS = {
  HOME: "HOME",
  AWAY: "AWAY",
} as const;

/**
 * Threshold for displaying team rankings in schedule views.
 * Only teams ranked 8 or better will show their rank badge.
 */
export const RANKING_DISPLAY_THRESHOLD = 8;

/**
 * Team logo dimensions used across schedule components.
 */
export const TEAM_LOGO_DIMENSIONS = {
  width: 64,
  height: 64,
} as const;

type MatchupFilterOptions = {
  teamId?: string | null;
  weekId?: string | number | null;
};

type MatchupSortOptions = {
  by: "rating" | "week";
  direction?: "asc" | "desc";
  weeks?: Week[];
};

type ScheduleCompletionOptions = {
  matchup?: Pick<Matchup, "awayScore" | "homeScore">;
  mode: "scores" | "weekEnd";
  referenceDate?: Date;
  week?: Pick<Week, "endDate">;
};

type MatchupOutcomeClassOptions = {
  defaultClass?: string;
  isLoser?: boolean;
  isWinner?: boolean;
  lossClass?: string;
  result?: string | null;
  winClass?: string;
};

type MatchupScoreFormatOptions = {
  matchup: Pick<Matchup, "awayScore" | "awayTeamId" | "homeScore" | "homeTeamId">;
  perspectiveTeamId: string;
};

type RankDisplayOptions = {
  threshold?: number;
};

/**
 * Checks whether empty filter value.
 *
 * @param value - The source value to process.
 * @returns True when empty filter value; otherwise false.
 */
function isEmptyFilterValue(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Filters matchups.
 *
 * @param matchups - The matchups to use.
 * @param options - Configuration options for the operation.
 * @returns The filtered matchups.
 */
export function filterMatchups(
  matchups: Matchup[] | undefined,
  options: MatchupFilterOptions = {},
): Matchup[] {
  if (!matchups?.length) return [];

  const requestedTeamFilter = "teamId" in options;
  const requestedWeekFilter = "weekId" in options;
  const { teamId, weekId } = options;

  if (
    (requestedTeamFilter && isEmptyFilterValue(teamId)) ||
    (requestedWeekFilter && isEmptyFilterValue(weekId))
  ) {
    return [];
  }

  return matchups.filter((matchup) => {
    if (
      teamId &&
      matchup.homeTeamId !== teamId &&
      matchup.awayTeamId !== teamId
    ) {
      return false;
    }

    if (!isEmptyFilterValue(weekId) && matchup.weekId !== weekId) {
      return false;
    }

    return true;
  });
}

/**
 * Sorts matchups.
 *
 * @param matchups - The matchups to use.
 * @param options - Configuration options for the operation.
 * @returns The sorted matchups.
 */
export function sortMatchups(
  matchups: Matchup[],
  options: MatchupSortOptions,
): Matchup[] {
  const { by, direction = "asc", weeks = [] } = options;
  const directionFactor = direction === "desc" ? -1 : 1;

  if (by === "rating") {
    return [...matchups].sort(
      (left, right) =>
        ((left.rating ?? 0) - (right.rating ?? 0)) * directionFactor,
    );
  }

  const weekNumById = new Map(weeks.map((week) => [week.id, week.weekNum]));
  return [...matchups].sort((left, right) => {
    const leftWeekNum = weekNumById.get(left.weekId) ?? 0;
    const rightWeekNum = weekNumById.get(right.weekId) ?? 0;
    return (leftWeekNum - rightWeekNum) * directionFactor;
  });
}

/**
 * Determines whether to display rank.
 *
 * @param rank - The rank to use.
 * @param options - Configuration options for the operation.
 * @returns True when display rank; otherwise false.
 */
export function shouldDisplayRank(
  rank: string | number | null | undefined,
  options: RankDisplayOptions = {},
): boolean {
  const threshold = options.threshold ?? RANKING_DISPLAY_THRESHOLD;
  const rankNum = typeof rank === "number" ? rank : Number(rank);
  return Number.isFinite(rankNum) && rankNum > 0 && rankNum <= threshold;
}

/**
 * Checks whether schedule item complete.
 *
 * @param options - Configuration options for the operation.
 * @returns True when schedule item complete; otherwise false.
 */
export function isScheduleItemComplete(
  options: ScheduleCompletionOptions,
): boolean {
  if (options.mode === "scores") {
    return (
      options.matchup?.homeScore !== null &&
      options.matchup?.homeScore !== undefined &&
      options.matchup?.awayScore !== null &&
      options.matchup?.awayScore !== undefined
    );
  }

  if (!options.week?.endDate) {
    return false;
  }

  return new Date(options.week.endDate) < (options.referenceDate ?? new Date());
}

/**
 * Returns matchup outcome class.
 *
 * @param options - Configuration options for the operation.
 * @returns The requested matchup outcome class.
 */
export function getMatchupOutcomeClass(
  options: MatchupOutcomeClassOptions = {},
): string {
  const {
    defaultClass = "",
    isLoser,
    isWinner,
    lossClass = "",
    result,
    winClass = "",
  } = options;

  if (result === "W" || isWinner) return winClass;
  if (result === "L" || isLoser) return lossClass;
  return defaultClass;
}

/**
 * Formats matchup score for display.
 *
 * @returns The formatted matchup score.
 */
export function formatMatchupScore({
  matchup,
  perspectiveTeamId,
}: MatchupScoreFormatOptions): string {
  return matchup.homeTeamId === perspectiveTeamId
    ? `${matchup.homeScore} - ${matchup.awayScore}`
    : `${matchup.awayScore} - ${matchup.homeScore}`;
}

