import type { CalendarWeek } from "../../types/season-calendar";

const DAY = 86_400_000;

export function resizeSeasonCalendar(
  weeks: CalendarWeek[],
  regularCount: number,
  playoffCount: number,
): CalendarWeek[] {
  previewSeasonCalendar(weeks[0]?.startDate ?? "", regularCount, playoffCount);
  const regular = weeks.filter((week) => !week.isPlayoffs);
  const playoffs = weeks.filter((week) => week.isPlayoffs);
  const resizeGroup = (
    group: CalendarWeek[],
    count: number,
    start: number,
    isPlayoffs: boolean,
  ) => {
    const result = group.slice(0, count).map((week) => ({ ...week }));
    while (result.length < count) {
      const next = result.length
        ? dateValue(result[result.length - 1]!.endDate) + DAY
        : start;
      result.push({
        startDate: new Date(next).toISOString().slice(0, 10),
        endDate: new Date(next + 6 * DAY).toISOString().slice(0, 10),
        gameDays: 7,
        isPlayoffs,
      });
    }
    return result;
  };
  const nextRegular = resizeGroup(
    regular,
    regularCount,
    dateValue(weeks[0]!.startDate),
    false,
  );
  const end = dateValue(nextRegular[nextRegular.length - 1]!.endDate);
  const oldEnd = regular.length
    ? dateValue(regular[regular.length - 1]!.endDate)
    : end;
  const shift = end - oldEnd;
  const shiftedPlayoffs = playoffs.map((week) => ({
    ...week,
    startDate: new Date(dateValue(week.startDate) + shift)
      .toISOString()
      .slice(0, 10),
    endDate: new Date(dateValue(week.endDate) + shift)
      .toISOString()
      .slice(0, 10),
  }));
  return [
    ...nextRegular,
    ...resizeGroup(shiftedPlayoffs, playoffCount, end + DAY, true),
  ];
}

/** Shift later weeks by the end-date change, preserving their lengths and gaps. */
export function editSeasonCalendarWeek(
  weeks: CalendarWeek[],
  index: number,
  patch: Partial<Pick<CalendarWeek, "startDate" | "endDate" | "gameDays">>,
  moveFollowing: boolean,
): CalendarWeek[] {
  const original = weeks[index];
  if (!original) return weeks;
  const edited = { ...original, ...patch };
  let shift = 0;
  try {
    const oldLength =
      (dateValue(original.endDate) - dateValue(original.startDate)) / DAY + 1;
    const newLength =
      (dateValue(edited.endDate) - dateValue(edited.startDate)) / DAY + 1;
    if (newLength > 0 && patch.gameDays === undefined) {
      // Keep explicit reduced game-day counts; full weeks track the new length.
      edited.gameDays =
        original.gameDays === oldLength
          ? newLength
          : Math.min(original.gameDays, newLength);
    }
    if (moveFollowing)
      shift = dateValue(edited.endDate) - dateValue(original.endDate);
  } catch {
    // Allow partially typed dates; validation reports incomplete dates on save.
  }
  return weeks.map((week, i) => {
    if (i === index) return edited;
    if (i < index || !shift) return { ...week };
    try {
      return {
        ...week,
        startDate: new Date(dateValue(week.startDate) + shift)
          .toISOString()
          .slice(0, 10),
        endDate: new Date(dateValue(week.endDate) + shift)
          .toISOString()
          .slice(0, 10),
      };
    } catch {
      return { ...week };
    }
  });
}

function dateValue(value: string): number {
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new Error("Enter valid calendar dates for every week.");
  return time;
}

export function previewSeasonCalendar(
  startDate: string,
  regularWeeks: number,
  playoffWeeks: number,
): CalendarWeek[] {
  if (
    !Number.isInteger(regularWeeks) ||
    regularWeeks < 19 ||
    regularWeeks > 49 ||
    regularWeeks % 2 !== 1
  )
    throw new Error("Choose an odd regular-season length from 19 to 49 weeks.");
  if (!Number.isInteger(playoffWeeks) || playoffWeeks < 1 || playoffWeeks > 10)
    throw new Error("Choose between 1 and 10 playoff weeks.");
  const start = dateValue(startDate);
  return Array.from({ length: regularWeeks + playoffWeeks }, (_, index) => ({
    startDate: new Date(start + index * 7 * DAY).toISOString().slice(0, 10),
    endDate: new Date(start + (index * 7 + 6) * DAY).toISOString().slice(0, 10),
    gameDays: 7,
    isPlayoffs: index >= regularWeeks,
  }));
}

export function validateSeasonCalendar(
  weeks: CalendarWeek[],
  now: number,
): void {
  const regular = weeks.filter((week) => !week.isPlayoffs).length;
  // Reuse count validation without imposing seven-day lengths on edited weeks.
  previewSeasonCalendar("2000-01-01", regular, weeks.length - regular);
  validateCalendarDates(weeks, now);
}

export function validateCalendarDates(
  weeks: CalendarWeek[],
  now = -Infinity,
): void {
  let previousEnd = -Infinity;
  weeks.forEach((week) => {
    const start = dateValue(week.startDate);
    const end = dateValue(week.endDate);
    if (start <= now)
      throw new Error("Every calendar week must start in the future.");
    if (end < start || start <= previousEnd)
      throw new Error("Week dates must be in order and must not overlap.");
    if (
      !Number.isInteger(week.gameDays) ||
      week.gameDays < 1 ||
      week.gameDays > (end - start) / DAY + 1
    )
      throw new Error(
        "Game days must be a positive whole number within the week's date range.",
      );
    previousEnd = end;
  });
  const firstPlayoff = weeks.findIndex((week) => week.isPlayoffs);
  if (
    firstPlayoff !== -1 &&
    weeks.slice(firstPlayoff).some((week) => !week.isPlayoffs)
  )
    throw new Error("Playoff weeks must follow all regular-season weeks.");
}
