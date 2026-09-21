import type { CalendarWeek } from "../../types/season-calendar";

const DAY = 86_400_000;

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
  let previousEnd = -Infinity;
  weeks.forEach((week, index) => {
    const start = dateValue(week.startDate);
    const end = dateValue(week.endDate);
    if (start <= now)
      throw new Error("Every calendar week must start in the future.");
    if (end < start || start <= previousEnd)
      throw new Error("Week dates must be in order and must not overlap.");
    if (week.isPlayoffs !== index >= regular)
      throw new Error("Playoff weeks must follow all regular-season weeks.");
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
}
