export type RolloverWeek = {
  id: string;
  startDate: string;
  endDate: string;
  weeklyRefreshCompletedAt?: number;
};

/** Runs after the morning reconciliation, including catch-up after downtime. */
export function dueWeeklyRollovers(input: {
  today: string;
  reconciledThrough?: string;
  morningRecheckOn?: string;
  weeks: RolloverWeek[];
}) {
  if (input.morningRecheckOn !== input.today || !input.reconciledThrough)
    return [];
  // The existing standings/power commands operate on the whole season.
  // Do not finalize a newer ended week while catch-up still trails it.
  if (
    input.weeks.some(
      (week) =>
        week.endDate < input.today && week.endDate > input.reconciledThrough!,
    )
  )
    return [];
  return input.weeks
    .filter(
      (week) =>
        !week.weeklyRefreshCompletedAt &&
        week.endDate < input.today &&
        week.endDate <= input.reconciledThrough!,
    )
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function allScoringGamesFinished(
  games: { gameState: string; gameScheduleState: string }[],
) {
  return games.every(
    (game) =>
      ["PPD", "CNCL"].includes(game.gameScheduleState) ||
      ["FINAL", "OFF"].includes(game.gameState),
  );
}

/** A failure prevents publication; an unmarked week retries on the next cycle. */
export async function runWeeklyRollover(
  stages: {
    standings: () => Promise<void>;
    power: () => Promise<void>;
    publish: () => Promise<void>;
  },
  apply: boolean,
) {
  await stages.standings();
  await stages.power();
  // Rank tiebreaks and matchup rank snapshots use the newly persisted power.
  await stages.standings();
  if (apply) await stages.publish();
}
