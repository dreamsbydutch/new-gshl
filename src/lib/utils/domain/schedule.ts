/**
 * Schedule Domain Utilities
 * -------------------------
 * Domain-specific constants and utilities for game schedules, conferences, and matchups.
 * Used across team-schedule and weekly-schedule features.
 */

import {
  isIsoDateInRange,
  normalizeDateOnlyValue,
  toLocalIsoDateOnly,
} from "../core/date";
import type {
  GameLocation,
  GameTypeDisplay,
  GSHLTeam,
  Matchup,
  TeamScheduleMatchupSummary,
  TeamScheduleTeamSummary,
  Week,
} from "@gshl-types";
import { getTeamMatchupResult } from "./team";

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
  week?: { endDate: string | null };
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
  matchup: Pick<
    Matchup,
    "awayScore" | "awayTeamId" | "homeScore" | "homeTeamId"
  >;
  perspectiveTeamId: string;
};

type RankDisplayOptions = {
  threshold?: number;
};

type ScheduleGameTypeDisplayOptions = {
  awayTeam?: Pick<GSHLTeam, "confAbbr">;
  gameType: string;
  homeTeam?: Pick<GSHLTeam, "confAbbr">;
  location: GameLocation;
  week?: { weekNum: number | string };
};

type ScheduleOpponentDisplayOptions = {
  awayTeam?: Pick<TeamScheduleTeamSummary, "name">;
  homeTeam?: Pick<TeamScheduleTeamSummary, "name">;
  location: GameLocation;
  matchup: Pick<TeamScheduleMatchupSummary, "awayRank" | "homeRank">;
};

type ScheduleBackgroundClassOptions = {
  awayTeamConference: string;
  gameType: string;
  homeTeamConference: string;
};

type ScheduleMatchupValidityOptions = {
  awayTeam?: Pick<GSHLTeam, "id">;
  homeTeam?: Pick<GSHLTeam, "id">;
  matchup: Pick<Matchup, "awayTeamId" | "homeTeamId">;
};

type TeamScheduleResultClassOptions = {
  matchup: Pick<
    TeamScheduleMatchupSummary,
    "awayTeamId" | "awayWin" | "homeTeamId" | "homeWin" | "tie"
  >;
  selectedTeamId: string;
};

const SCHEDULE_GAME_TYPE_STYLES: Record<string, GameTypeDisplay> = {
  QF: { label: "QF", className: "text-orange-800 bg-orange-100" },
  SF: { label: "SF", className: "text-slate-700 bg-slate-100" },
  F: { label: "F", className: "text-yellow-800 bg-yellow-100" },
  LT: { label: "LT", className: "text-brown-800 bg-brown-100" },
};

const SCHEDULE_BACKGROUND_CLASSES = {
  RSSVSV: "bg-sunview-50/50",
  CCSVSV: "bg-sunview-50/50",
  RSHHHH: "bg-hotel-50/50",
  CCHHHH: "bg-hotel-50/50",
  RSSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  NCSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  RSHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",
  NCHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",
  QFSVSV: "bg-orange-200/30",
  QFHHHH: "bg-orange-200/30",
  QFHHSV: "bg-orange-200/30",
  QFSVHH: "bg-orange-200/30",
  SFSVSV: "bg-slate-200/30",
  SFHHHH: "bg-slate-200/30",
  SFHHSV: "bg-slate-200/30",
  SFSVHH: "bg-slate-200/30",
  FSVSV: "bg-yellow-200/30",
  FHHHH: "bg-yellow-200/30",
  FHHSV: "bg-yellow-200/30",
  FSVHH: "bg-yellow-200/30",
  LTSVSV: "bg-brown-200/40",
  LTHHHH: "bg-brown-200/40",
  LTHHSV: "bg-brown-200/40",
  LTSVHH: "bg-brown-200/40",
} as const;

const DEFAULT_SCHEDULE_BACKGROUND_CLASS = "bg-gray-100";

const TEAM_SCHEDULE_RESULT_STYLES = {
  defaultClass: "text-gray-500",
  lossClass: "text-rose-800",
  winClass: "font-semibold text-emerald-700",
} as const;

type WeekDateRange = Pick<Week, "endDate" | "id" | "startDate">;

type NormalizedWeekDateRange<TWeek extends WeekDateRange> = {
  endDate: string;
  startDate: string;
  week: TWeek;
};

type SelectWeekForReferenceDateOptions<TWeek extends WeekDateRange> = {
  /**
   * The weeks to evaluate. They may be in any order and are never mutated.
   */
  weeks: readonly TWeek[];
  /**
   * The instant whose local calendar day determines the selection. Week dates
   * are date-only values, so this deliberately uses the caller's local day.
   */
  referenceDate: Date;
  /**
   * Whether an unmatched reference date resolves to the first supplied week.
   */
  fallback?: "first" | "none";
};
/**
 * Checks whether empty filter value.
 *
 * @param value - The source value to process.
 * @returns True when empty filter value; otherwise false.
 */
function isEmptyFilterValue(
  value: string | number | null | undefined,
): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Selects the week most relevant to a reference date.
 *
 * Selection prefers a week containing the reference date, then the nearest
 * upcoming week, then the most recently completed week. Weeks can arrive in
 * any order; this function sorts a copy and leaves the caller's array intact.
 * When no dated week applies, callers can opt into the first supplied week as
 * a fallback.
 */
export function selectWeekForReferenceDate<TWeek extends WeekDateRange>({
  weeks,
  referenceDate,
  fallback = "none",
}: SelectWeekForReferenceDateOptions<TWeek>): TWeek | null {
  if (!weeks.length) return null;

  const referenceDay = toLocalIsoDateOnly(referenceDate);
  const chronologicalWeeks = weeks
    .flatMap((week): NormalizedWeekDateRange<TWeek>[] => {
      const startDate = normalizeDateOnlyValue(week.startDate);
      const endDate = normalizeDateOnlyValue(week.endDate);
      if (!startDate || !endDate || startDate > endDate) return [];

      return [{ endDate, startDate, week }];
    })
    .sort((left, right) =>
      left.startDate.localeCompare(right.startDate),
    );
  const currentWeek = chronologicalWeeks.find(({ endDate, startDate }) =>
    isIsoDateInRange(referenceDay, startDate, endDate),
  );
  if (currentWeek) return currentWeek.week;

  const nextWeek = chronologicalWeeks.find(
    (week) => week.startDate > referenceDay,
  );
  if (nextWeek) return nextWeek.week;

  const previousWeek = chronologicalWeeks
    .filter((week) => week.endDate < referenceDay)
    .at(-1);
  if (previousWeek) return previousWeek.week;

  return fallback === "first" ? (weeks[0] ?? null) : null;
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

/** Returns the selected team's location in a schedule matchup. */
export function getScheduleGameLocation({
  matchup,
  selectedTeamId,
}: {
  matchup: Pick<TeamScheduleMatchupSummary, "homeTeamId">;
  selectedTeamId: string;
}): GameLocation {
  return matchup.homeTeamId === selectedTeamId ? "HOME" : "AWAY";
}

/** Returns the display label and class for a team-schedule matchup. */
export function getScheduleGameTypeDisplay({
  awayTeam,
  gameType,
  homeTeam,
  location,
  week,
}: ScheduleGameTypeDisplayOptions): GameTypeDisplay {
  const gameTypeStyle = SCHEDULE_GAME_TYPE_STYLES[String(gameType)];
  if (gameTypeStyle) return gameTypeStyle;

  const opponentConference =
    location === "HOME" ? awayTeam?.confAbbr : homeTeam?.confAbbr;
  const className =
    opponentConference === CONFERENCES.HICKORY_HOTEL.abbr
      ? CONFERENCES.HICKORY_HOTEL.textColor
      : CONFERENCES.SUNVIEW.textColor;

  return { label: week?.weekNum, className };
}

/** Formats a schedule opponent label from the selected team's perspective. */
export function formatScheduleOpponent({
  awayTeam,
  homeTeam,
  location,
  matchup,
}: ScheduleOpponentDisplayOptions): string {
  if (location === "HOME") {
    const rankPrefix = shouldDisplayRank(matchup.awayRank)
      ? `#${matchup.awayRank} `
      : "";
    return rankPrefix + (awayTeam?.name ?? "Away Team");
  }

  const rankPrefix = shouldDisplayRank(matchup.homeRank)
    ? `#${matchup.homeRank} `
    : "";
  return "@ " + rankPrefix + (homeTeam?.name ?? "Home Team");
}

/** Returns the weekly-schedule background class for a matchup. */
export function getScheduleBackgroundClass({
  awayTeamConference,
  gameType,
  homeTeamConference,
}: ScheduleBackgroundClassOptions): string {
  const key = `${gameType}${awayTeamConference}${homeTeamConference}`;
  return (
    SCHEDULE_BACKGROUND_CLASSES[
      key as keyof typeof SCHEDULE_BACKGROUND_CLASSES
    ] ?? DEFAULT_SCHEDULE_BACKGROUND_CLASS
  );
}

/** Checks that a schedule matchup has two different resolved teams. */
export function isValidScheduleMatchup({
  awayTeam,
  homeTeam,
}: ScheduleMatchupValidityOptions): boolean {
  return Boolean(homeTeam && awayTeam && homeTeam.id !== awayTeam.id);
}

/** Returns the result class for a team-schedule row. */
export function getTeamScheduleResultClass({
  matchup,
  selectedTeamId,
}: TeamScheduleResultClassOptions): string {
  return getMatchupOutcomeClass({
    defaultClass: TEAM_SCHEDULE_RESULT_STYLES.defaultClass,
    lossClass: TEAM_SCHEDULE_RESULT_STYLES.lossClass,
    result: getTeamMatchupResult(matchup, selectedTeamId),
    winClass: TEAM_SCHEDULE_RESULT_STYLES.winClass,
  });
}
