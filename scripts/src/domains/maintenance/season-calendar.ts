const DAY = 86400000;

export interface CalendarWeek {
  id: string;
  seasonId: string;
  weekNum: string | number;
  weekType: string;
  isPlayoffs: boolean;
  startDate: string;
  endDate: string;
  gameDays: string | number;
}

function instant(date: string): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(value) ||
    new Date(value).toISOString().slice(0, 10) !== date
  )
    throw new Error(`Invalid calendar date: ${date}`);
  return value;
}
const dayKey = (value: number) => new Date(value).toISOString().slice(0, 10);

/** Monday-Sunday weeks; combine partial boundary weeks with their neighbors. */
export function buildSeasonCalendar(startDate: string, endDate: string) {
  const start = instant(startDate);
  const end = instant(endDate);
  if (end - start < 28 * DAY || end - start > 365 * DAY)
    throw new Error("Expected an NHL season lasting between 29 and 366 days");
  const firstSunday = start + ((7 - new Date(start).getUTCDay()) % 7) * DAY;
  const firstEnd =
    firstSunday - start < 6 * DAY ? firstSunday + 7 * DAY : firstSunday;
  const dates = [{ startDate, endDate: dayKey(firstEnd) }];
  let cursor = firstEnd + DAY;
  while ((end - cursor) / DAY + 1 > 13) {
    dates.push({
      startDate: dayKey(cursor),
      endDate: dayKey(cursor + 6 * DAY),
    });
    cursor += 7 * DAY;
  }
  dates.push({ startDate: dayKey(cursor), endDate });
  return dates.map((week, index) => ({
    ...week,
    weekNum: String(index + 1),
    weekType: index >= dates.length - 3 ? "PO" : "RS",
    isPlayoffs: index >= dates.length - 3,
    gameDays: String(
      (instant(week.endDate) - instant(week.startDate)) / DAY + 1,
    ),
  }));
}

export function planSeasonCalendar(
  seasonId: string,
  existing: CalendarWeek[],
  startDate: string,
  endDate: string,
) {
  if (
    existing.some((week) => week.seasonId !== seasonId) ||
    new Set(existing.map((week) => week.id)).size !== existing.length
  )
    throw new Error(
      "Weeks must have unique IDs and belong to the selected season",
    );
  if (
    existing.some(
      (week) =>
        !["RS", "PO"].includes(week.weekType) ||
        week.isPlayoffs !== (week.weekType === "PO") ||
        !Number.isInteger(Number(week.weekNum)),
    )
  )
    throw new Error("Unexpected week numbering or playoff classification");
  const ordered = [...existing].sort(
    (a, b) => Number(a.weekNum) - Number(b.weekNum),
  );
  const regular = ordered.filter((week) => week.weekType === "RS");
  const playoffs = ordered.filter((week) => week.weekType === "PO");
  const calendar = buildSeasonCalendar(startDate, endDate);
  const regularCount = calendar.length - 3;
  if (playoffs.length !== 3 || regular.length > regularCount)
    throw new Error(
      "Repair requires exactly three existing playoff weeks and never removes regular weeks",
    );
  const updates: { id: string; data: (typeof calendar)[number] }[] = [];
  const inserts: ((typeof calendar)[number] & {
    seasonId: string;
    isActive: boolean;
    legacyId: string;
  })[] = [];
  calendar.forEach((data, index) => {
    const source =
      index < regularCount ? regular[index] : playoffs[index - regularCount];
    if (!source) {
      inserts.push({
        ...data,
        seasonId,
        isActive: false,
        legacyId: `calendar:${seasonId}:${data.weekNum}`,
      });
    } else if (
      Object.entries(data).some(
        ([key, value]) =>
          String(source[key as keyof CalendarWeek]) !== String(value),
      )
    ) {
      updates.push({ id: source.id, data });
    }
  });
  return { calendar, updates, inserts };
}
