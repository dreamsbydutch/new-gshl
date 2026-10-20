export type PlayerDayCalendarExposureWeek = {
  weekId: string;
  startDate: string;
  endDate: string;
  meanGamesPerNhlTeam: number;
};

export const CALENDAR_EXPOSURE_CHRONOLOGY_LIMITATION =
  "Historical NHL schedules were collected after the target weeks and reflect later schedule revisions. These are ex-post schedule-only covariates, not archived pre-week forecasts. No player performance or owner roster totals enter exposure.";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function dateKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** Parse public schedule metadata only; never reads storage or performance data. */
export function parsePlayerDayCalendarExposure(
  input: unknown,
): readonly Readonly<PlayerDayCalendarExposureWeek>[] {
  if (
    !object(input) ||
    input.version !== "owner-independent-nhl-calendar-exposure-v1" ||
    !Array.isArray(input.weeks)
  )
    throw Error("Known NHL calendar exposure sidecar required");
  const seen = new Set<string>();
  return Object.freeze(
    input.weeks.map((week: unknown) => {
      if (
        !object(week) ||
        typeof week.weekId !== "string" ||
        !week.weekId.trim() ||
        seen.has(week.weekId) ||
        !dateKey(week.startDate) ||
        !dateKey(week.endDate) ||
        week.startDate > week.endDate ||
        typeof week.meanGamesPerNhlTeam !== "number" ||
        !Number.isFinite(week.meanGamesPerNhlTeam) ||
        week.meanGamesPerNhlTeam <= 0
      )
        throw Error("Invalid or duplicate NHL calendar exposure week");
      seen.add(week.weekId);
      if (
        week.scheduledLeagueGames !== undefined ||
        week.leagueTeamCount !== undefined
      ) {
        if (
          !Number.isInteger(week.scheduledLeagueGames) ||
          Number(week.scheduledLeagueGames) <= 0 ||
          !Number.isInteger(week.leagueTeamCount) ||
          Number(week.leagueTeamCount) < 2 ||
          Math.abs(
            (2 * Number(week.scheduledLeagueGames)) /
              Number(week.leagueTeamCount) -
              week.meanGamesPerNhlTeam,
          ) > 1e-12
        )
          throw Error("NHL calendar exposure disagrees with schedule counts");
      }
      return Object.freeze({
        weekId: week.weekId,
        startDate: week.startDate,
        endDate: week.endDate,
        meanGamesPerNhlTeam: week.meanGamesPerNhlTeam,
      });
    }),
  );
}

/** Every supplied context must have an exact canonical week/date schedule match. */
export function attachPlayerDayCalendarExposure<
  T extends { weekId: string; startDate: string; endDate: string },
>(
  contexts: readonly T[],
  sidecar: unknown,
): Array<T & { nhlGamesPerTeam: number }> {
  const index = new Map(
    parsePlayerDayCalendarExposure(sidecar).map((week) => [week.weekId, week]),
  );
  return contexts.map((context) => {
    const week = index.get(context.weekId);
    if (
      !week ||
      !dateKey(context.startDate) ||
      !dateKey(context.endDate) ||
      context.startDate !== week.startDate ||
      context.endDate !== week.endDate
    )
      throw Error(
        "Missing or mismatched NHL calendar exposure for context week",
      );
    if (
      "nhlGamesPerTeam" in context &&
      context.nhlGamesPerTeam !== undefined &&
      context.nhlGamesPerTeam !== week.meanGamesPerNhlTeam
    )
      throw Error("Existing context exposure disagrees with schedule sidecar");
    return { ...context, nhlGamesPerTeam: week.meanGamesPerNhlTeam };
  });
}
