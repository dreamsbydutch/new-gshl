type Week = { id: string; startDate?: unknown; endDate?: unknown };
type Ownership = {
  weekId: string;
  gshlTeamId: string;
  playerId: string;
  days?: unknown;
  IR?: unknown;
  IRplus?: unknown;
};

/** Evaluation roster known before the matchup; never reads current-week ownership or performance. */
export function priorWeekRoster(
  current: Week,
  weeks: readonly Week[],
  ownership: readonly Ownership[],
  teamId: string,
  opening: readonly string[],
): string[] {
  const timestamp = (value: unknown) => new Date(String(value)).getTime();
  const previous = weeks
    .filter((w) => timestamp(w.endDate) < timestamp(current.startDate))
    .sort((a, b) => timestamp(b.endDate) - timestamp(a.endDate))[0];
  if (!previous) return [...new Set(opening)];
  const exposure = new Map<string, number>();
  for (const row of ownership) {
    if (row.weekId !== previous.id || row.gshlTeamId !== teamId) continue;
    const days = Math.max(
      0,
      Number(row.days || 0) - Number(row.IR || 0) - Number(row.IRplus || 0),
    );
    if (days)
      exposure.set(row.playerId, (exposure.get(row.playerId) ?? 0) + days);
  }
  // Weekly aggregates cannot identify exact closing ownership after transactions.
  // Greatest non-IR ownership exposure is a fixed, reproducible proxy.
  return exposure.size
    ? [...exposure]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 15)
        .map(([id]) => id)
    : [...new Set(opening)];
}
