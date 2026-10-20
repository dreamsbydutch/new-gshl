import { normalizeDateOnlyValue } from "../../utils/date";

export type ScoringWeek = {
  id: string;
  startDate: unknown;
  endDate: unknown;
  weeklyRefreshCompletedAt?: unknown;
};

/** Finalization is the persisted Monday handoff, not merely a past end date. */
export function isScoringWeekFinalized(week: ScoringWeek): boolean {
  return Boolean(week.weeklyRefreshCompletedAt);
}

export function planScoringWeekRefresh(
  weeks: ScoringWeek[],
  today: string,
  maxWeeks?: number,
) {
  if (
    maxWeeks !== undefined &&
    (!Number.isSafeInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 4)
  )
    throw Error("Correction refresh requires one to four weeks");
  const plan = weeks
    .filter((week) => !isScoringWeekFinalized(week))
    .flatMap((week) => {
      const startDate = normalizeDateOnlyValue(week.startDate);
      const endDate = normalizeDateOnlyValue(week.endDate);
      if (!startDate || !endDate || startDate > today) return [];
      return [
        {
          weekId: week.id,
          startDate,
          endDate: endDate < today ? endDate : today,
        },
      ];
    });
  return maxWeeks === undefined
    ? plan
    : plan
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .slice(0, maxWeeks)
        .reverse();
}
