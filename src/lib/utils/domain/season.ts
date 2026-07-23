import type {
  OffseasonWindow,
  Season,
  SeasonSummary,
  TeamSeasonStatLine,
  Week,
} from "@gshl-types";
import { getSeasonString, safeParseSheetDate } from "../core/date";
import { formatRecord } from "../core/format";

type SeasonDateInput = Date | string | number | null | undefined;

export const SEASON_PICKER_ADVANCE_DAYS = 15;

/**
 * Coerces date.
 *
 * @param value - The source value to process.
 * @returns The coerced date.
 */
function coerceDate(value: SeasonDateInput): Date | null {
  return safeParseSheetDate(value);
}

type SeasonDateField = "endDate" | "startDate";
type SeasonSearchMode = "after" | "before" | "current";

type FindSeasonByTimingOptions = {
  dateField?: SeasonDateField;
  inclusive?: boolean;
  mode: SeasonSearchMode;
  referenceDate?: Date;
  sort?: "asc" | "desc";
};

type ResolveSeasonOptions = {
  referenceDate?: Date;
  strategy?: "contractDefault" | "default";
};

/**
 * Returns season date value.
 *
 * @param season - The season to use.
 * @param dateField - The date field to use.
 * @returns The requested season date value.
 */
function getSeasonDateValue(
  season: Season,
  dateField: SeasonDateField,
): number | null {
  return coerceDate(season[dateField])?.getTime() ?? null;
}

/**
 * Returns missing date sort value.
 *
 * @param direction - The direction to apply.
 * @returns The requested missing date sort value.
 */
function getMissingDateSortValue(direction: "asc" | "desc"): number {
  return direction === "asc"
    ? Number.POSITIVE_INFINITY
    : Number.NEGATIVE_INFINITY;
}

/**
 * Compare season dates.
 *
 * @param dateField - The date field to use.
 * @param direction - The direction to apply.
 */
function compareSeasonDates(
  dateField: SeasonDateField,
  direction: "asc" | "desc",
) {
  const missingValue = getMissingDateSortValue(direction);
  return (left: Season, right: Season) => {
    const leftTime = getSeasonDateValue(left, dateField) ?? missingValue;
    const rightTime = getSeasonDateValue(right, dateField) ?? missingValue;
    return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
  };
}

/**
 * Checks whether within season.
 *
 * @param season - The season to use.
 * @param reference - The reference to use.
 * @returns True when within season; otherwise false.
 */
function isWithinSeason(season: Season, reference: Date): boolean {
  const start = coerceDate(season.startDate);
  const end = coerceDate(season.endDate);
  if (!start || !end) return false;

  const refTime = reference.getTime();
  return start.getTime() <= refTime && refTime <= end.getTime();
}

/**
 * Finds season by timing.
 *
 * @param seasons - The seasons to use.
 * @param options - Configuration options for the operation.
 * @returns The matching season by timing, if one exists.
 */
function findSeasonByTiming(
  seasons: Season[] | undefined,
  options: FindSeasonByTimingOptions,
): Season | undefined {
  if (!seasons?.length) return undefined;

  const {
    dateField = "startDate",
    inclusive = true,
    mode,
    referenceDate = new Date(),
    sort = mode === "after" ? "asc" : "desc",
  } = options;

  if (mode === "current") {
    return seasons.find((season) => isWithinSeason(season, referenceDate));
  }

  const referenceTime = referenceDate.getTime();
  return seasons
    .filter((season) => {
      const time = getSeasonDateValue(season, dateField);
      if (time === null) return false;

      if (mode === "after") {
        return inclusive ? time >= referenceTime : time > referenceTime;
      }

      return inclusive ? time <= referenceTime : time < referenceTime;
    })
    .sort(compareSeasonDates(dateField, sort))[0];
}

/**
 * Resolves season.
 *
 * @param seasons - The seasons to use.
 * @param options - Configuration options for the operation.
 * @returns The resolved season.
 */
function resolveSeason(
  seasons: Season[] | undefined,
  options: ResolveSeasonOptions = {},
): Season | undefined {
  if (!seasons?.length) return undefined;

  const { referenceDate = new Date(), strategy = "default" } = options;
  const currentSeason = findSeasonByTiming(seasons, {
    mode: "current",
    referenceDate,
  });
  const upcomingSeason = findSeasonByTiming(seasons, {
    dateField: "startDate",
    inclusive: false,
    mode: "after",
    referenceDate,
  });
  const mostRecentSeason = findSeasonByTiming(seasons, {
    dateField: "startDate",
    mode: "before",
    referenceDate,
  });

  if (strategy === "contractDefault") {
    return (
      currentSeason ??
      upcomingSeason ??
      deriveProjectedNextSeason(mostRecentSeason) ??
      findClosestAdjacentSeason(seasons, referenceDate) ??
      seasons[0]
    );
  }

  return (
    currentSeason ??
    findClosestAdjacentSeason(seasons, referenceDate) ??
    seasons[0]
  );
}

/**
 * Finds current season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The matching current season, if one exists.
 */
export function findCurrentSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  return findSeasonByTiming(seasons, {
    mode: "current",
    referenceDate,
  });
}

/**
 * Finds upcoming season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The matching upcoming season, if one exists.
 */
export function findUpcomingSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  return findSeasonByTiming(seasons, {
    dateField: "startDate",
    inclusive: false,
    mode: "after",
    referenceDate,
  });
}

/**
 * Finds most recent season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The matching most recent season, if one exists.
 */
export function findMostRecentSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  return findSeasonByTiming(seasons, {
    dateField: "startDate",
    mode: "before",
    referenceDate,
  });
}

/**
 * Finds offseason window.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The matching offseason window, if one exists.
 */
export function findOffseasonWindow(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): OffseasonWindow | undefined {
  if (!seasons?.length) return undefined;

  const endedSeason = findSeasonByTiming(seasons, {
    dateField: "endDate",
    inclusive: false,
    mode: "before",
    referenceDate,
  });
  const upcomingSeason =
    findUpcomingSeason(seasons, referenceDate) ??
    deriveProjectedNextSeason(endedSeason);

  if (!endedSeason || !upcomingSeason) {
    return undefined;
  }

  return {
    endedSeason,
    upcomingSeason,
  };
}

/**
 * Checks whether between seasons.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns True when between seasons; otherwise false.
 */
export function isBetweenSeasons(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): boolean {
  const offseasonWindow = findOffseasonWindow(seasons, referenceDate);
  if (!offseasonWindow) {
    return false;
  }

  const endedAt = coerceDate(offseasonWindow.endedSeason.endDate);
  const startsAt = coerceDate(offseasonWindow.upcomingSeason.startDate);
  if (!endedAt || !startsAt) {
    return false;
  }

  const currentTime = referenceDate.getTime();
  return endedAt.getTime() < currentTime && currentTime < startsAt.getTime();
}

/**
 * Finds closest adjacent season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The matching closest adjacent season, if one exists.
 */
function findClosestAdjacentSeason(
  seasons: Season[],
  referenceDate: Date,
): Season | undefined {
  const refTime = referenceDate.getTime();

  const mostRecent = findMostRecentSeason(seasons, referenceDate);
  const upcoming = findUpcomingSeason(seasons, referenceDate);

  if (!mostRecent && !upcoming) return undefined;
  if (!mostRecent) return upcoming;
  if (!upcoming) return mostRecent;

  const recentEnd = coerceDate(mostRecent.endDate);
  const upcomingStart = coerceDate(upcoming.startDate);

  const distanceToRecent = recentEnd
    ? Math.abs(refTime - recentEnd.getTime())
    : Number.POSITIVE_INFINITY;
  const distanceToUpcoming = upcomingStart
    ? Math.abs(upcomingStart.getTime() - refTime)
    : Number.POSITIVE_INFINITY;

  return distanceToUpcoming < distanceToRecent ? upcoming : mostRecent;
}

/**
 * Resolves default season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The resolved default season.
 */
export function resolveDefaultSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  return resolveSeason(seasons, { referenceDate, strategy: "default" });
}

/**
 * Derives projected next season.
 *
 * @param season - The season to use.
 * @returns The derived projected next season.
 */
function deriveProjectedNextSeason(
  season: Season | undefined,
): Season | undefined {
  if (!season) return undefined;

  const nextSeasonEndYear = Number(season.year) + 1;
  const nextSeasonId = Number.isFinite(Number(season.id))
    ? String(Number(season.id) + 1)
    : season.id;
      /**
   * Shifts year.
   *
   * @param value - The source value to process.
   */
  const shiftYear = (value: string) => {
    const parsed = coerceDate(value);
    if (!parsed) return value;

    const shifted = new Date(parsed);
    shifted.setFullYear(shifted.getFullYear() + 1);
    return shifted.toISOString().split("T")[0] ?? value;
  };

  return {
    ...season,
    id: nextSeasonId,
    year: nextSeasonEndYear,
    name: getSeasonString(Number(season.year)),
    startDate: shiftYear(season.startDate),
    endDate: shiftYear(season.endDate),
    signingEndDate: shiftYear(season.signingEndDate),
    isActive: false,
  };
}

/**
 * Resolves contract default season.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The reference date to use.
 * @returns The resolved contract default season.
 */
export function resolveContractDefaultSeason(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): Season | undefined {
  return resolveSeason(seasons, {
    referenceDate,
    strategy: "contractDefault",
  });
}

/**
 * Finds season by id.
 *
 * @param seasons - The seasons to use.
 * @param seasonId - The season id to use.
 * @returns The matching season by id, if one exists.
 */
export function findSeasonById(
  seasons: Season[] | undefined,
  seasonId: string | number | null | undefined,
): Season | undefined {
  if (!seasons?.length || seasonId == null) return undefined;
  const target = String(seasonId);
  return seasons.find(
    (season) =>
      String(season.id) === target || String(season.legacyId ?? "") === target,
  );
}

/**
 * Checks whether legacy tie rules applies.
 *
 * @param season - The season to use.
 * @returns True when legacy tie rules; otherwise false.
 */
export function usesLegacyTieRules(
  season: Pick<Season, "usesLegacyTies"> | null | undefined,
): boolean {
  return season?.usesLegacyTies === true;
}

/**
 * Calculates standings points.
 *
 * @param stats - The stats to use.
 * @param season - The season to use.
 * @returns The calculated standings points.
 */
export function calculateStandingsPoints(
  stats:
    | Pick<TeamSeasonStatLine, "teamW" | "teamHW" | "teamHL" | "teamT">
    | null
    | undefined,
  season: Pick<Season, "usesLegacyTies"> | null | undefined,
): number {
  const wins = Number(stats?.teamW ?? 0);
  const homeWins = Number(stats?.teamHW ?? 0);
  const homeLosses = Number(stats?.teamHL ?? 0);
  const ties = Number(stats?.teamT ?? 0);

  if (usesLegacyTieRules(season)) {
    return wins * 2 + ties;
  }

  return (wins - homeWins) * 3 + homeWins * 2 + homeLosses;
}

/**
 * Formats standings record for display.
 *
 * @param stats - The stats to use.
 * @param season - The season to use.
 * @returns The formatted standings record.
 */
export function formatStandingsRecord(
  stats:
    | Pick<TeamSeasonStatLine, "teamW" | "teamL" | "teamT">
    | null
    | undefined,
  season: Pick<Season, "usesLegacyTies"> | null | undefined,
): string {
  return formatRecord(
    Number(stats?.teamW ?? 0),
    Number(stats?.teamL ?? 0),
    usesLegacyTieRules(season) ? Number(stats?.teamT ?? 0) : 0,
  );
}

/**
 * Converts input into season summary.
 *
 * @param season - The season to use.
 * @returns The converted season summary.
 */
export function toSeasonSummary(
  season: Season | undefined | null,
): SeasonSummary | undefined {
  if (!season) return undefined;

  return {
    id: String(season.id),
    name: season.name,
    year: season.year,
  };
}

/**
 * Checks whether a season may be selected from season navigation.
 *
 * Season zero is a sentinel and is never selectable. Future seasons become
 * selectable once their start date is no more than 15 days away.
 */
export function isSeasonPickable(
  season: Season,
  referenceDate: Date = new Date(),
): boolean {
  const identifiers = [season.id, season.legacyId]
    .filter((identifier): identifier is string => identifier != null)
    .map((identifier) => identifier.trim())
    .filter(Boolean);
  const isSeasonZero = identifiers.some((identifier) => {
    const numericIdentifier = Number(identifier);
    return Number.isFinite(numericIdentifier) && numericIdentifier === 0;
  });
  if (isSeasonZero) return false;

  const startDate = coerceDate(season.startDate);
  if (!startDate) return false;

  const latestPickableStart = new Date(referenceDate);
  latestPickableStart.setUTCDate(
    latestPickableStart.getUTCDate() + SEASON_PICKER_ADVANCE_DAYS,
  );

  return startDate.getTime() <= latestPickableStart.getTime();
}

/**
 * Builds season summaries.
 *
 * @param seasons - The seasons to use.
 * @param referenceDate - The date used to determine future-season eligibility.
 * @returns The assembled season summaries.
 */
export function buildSeasonSummaries(
  seasons: Season[] | undefined,
  referenceDate: Date = new Date(),
): SeasonSummary[] {
  if (!seasons?.length) return [];

  return seasons
    .filter((season) => isSeasonPickable(season, referenceDate))
    .map((season) => toSeasonSummary(season))
    .filter((summary): summary is SeasonSummary => Boolean(summary));
}

/**
 * Find the week that contains the given reference date.
 * Weeks are identified by their startDate and endDate range.
 *
 * @param weeks - Array of Week objects to search
 * @param referenceDate - The date to find the week for (defaults to now)
 * @param seasonId - Optional season ID to filter weeks by
 * @returns The Week containing the reference date, or undefined if not found
 */
export function findWeekByDate(
  weeks: Week[] | undefined,
  referenceDate: Date = new Date(),
  seasonId?: string,
): Week | undefined {
  if (!weeks?.length) return undefined;

  // Filter by seasonId if provided
  const filteredWeeks = seasonId
    ? weeks.filter((week) => String(week.seasonId) === String(seasonId))
    : weeks;

  // Normalize reference date to start of day in UTC to avoid timezone issues
  const refDateStr = referenceDate.toISOString().split("T")[0]!;
  const normalizedRef = new Date(refDateStr + "T00:00:00.000Z");
  const refTime = normalizedRef.getTime();

  const matchedWeek = filteredWeeks.find((week) => {
    const start = coerceDate(week.startDate);
    const end = coerceDate(week.endDate);

    if (!start || !end) return false;

    // Normalize start and end dates to start of day in UTC
    const startDateStr = start.toISOString().split("T")[0]!;
    const normalizedStart = new Date(startDateStr + "T00:00:00.000Z");

    const endDateStr = end.toISOString().split("T")[0]!;
    const normalizedEnd = new Date(endDateStr + "T00:00:00.000Z");

    const isMatch =
      normalizedStart.getTime() <= refTime &&
      refTime <= normalizedEnd.getTime();

    // Debug logging for week matching issues
    if (process.env.NODE_ENV === "development") {
      const daysDiff =
        (refTime - normalizedEnd.getTime()) / (1000 * 60 * 60 * 24);
      if (Math.abs(daysDiff) <= 2) {
        // Log if within 2 days of this week
        console.log(
          `[findWeekByDate] Week ${week.weekNum}: ${startDateStr} to ${endDateStr} | Target: ${refDateStr} | Match: ${isMatch}`,
        );
      }
    }

    return isMatch;
  });

  return matchedWeek;
}
