import type {
  LineupShameData,
  LineupShameDay,
  LineupShameEntry,
  LineupShamePlayerDay,
  LineupShameTeam,
} from "../../types/lineup-shame";

function count(value: string | number | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

/** The calendar date stays in Toronto even when the reader is in another zone. */
export function lastNightDate(now: Date): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function coachingPercentage(
  gamesPlayed: number,
  gamesStarted: number,
  missedStarts: number,
  badStarts: number,
): number | null {
  if (
    ![gamesPlayed, gamesStarted, missedStarts, badStarts].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    return null;
  const decisions = gamesPlayed - gamesStarted - missedStarts;
  if (decisions <= 0 || badStarts < 0 || badStarts > decisions) return null;
  return 100 * (1 - badStarts / decisions);
}

/** Use team-day history plus the fresh completed night, avoiding overnight rollup lag. */
export function buildLineupShame(input: {
  seasonName: string;
  recentDate: string;
  teams: readonly LineupShameTeam[];
  history: readonly LineupShameDay[];
  recent: readonly LineupShamePlayerDay[];
}): LineupShameData {
  const recent = input.recent.filter((row) => row.date === input.recentDate);
  const recentStatus = !recent.length
    ? "no-records"
    : recent.some((row) => row.lineupAccountingFinalized === false)
      ? "pending"
      : "final";
  const byTeam = new Map<string, LineupShameEntry>(
    input.teams.map((team) => [
      team.id,
      {
        team,
        rank: 0,
        missedStarts: 0,
        badStarts: 0,
        gamesPlayed: 0,
        gamesStarted: 0,
        startDecisions: 0,
        coachingPercentage: null,
        hasStats: false,
        recentMisses: [],
      },
    ]),
  );
  function add(row: LineupShameDay) {
    const entry = byTeam.get(row.gshlTeamId);
    if (!entry) return;
    entry.hasStats = true;
    entry.gamesPlayed += count(row.GP);
    entry.gamesStarted += count(row.GS);
    entry.missedStarts += count(row.MS);
    entry.badStarts += count(row.BS);
  }
  for (const row of input.history) if (row.date < input.recentDate) add(row);
  if (recentStatus === "final")
    for (const row of recent) {
      add(row);
      if (count(row.MS) > 0 && count(row.GP) === 1)
        byTeam.get(row.gshlTeamId)?.recentMisses.push(row);
    }
  const entries = [...byTeam.values()];
  for (const entry of entries) {
    entry.startDecisions =
      entry.gamesPlayed - entry.gamesStarted - entry.missedStarts;
    entry.coachingPercentage = coachingPercentage(
      entry.gamesPlayed,
      entry.gamesStarted,
      entry.missedStarts,
      entry.badStarts,
    );
    entry.recentMisses.sort(
      (a, b) =>
        a.playerName.localeCompare(b.playerName) || a.id.localeCompare(b.id),
    );
  }
  entries.sort(
    (a, b) =>
      b.missedStarts - a.missedStarts ||
      a.team.name.localeCompare(b.team.name) ||
      a.team.id.localeCompare(b.team.id),
  );
  entries.forEach((entry, index) => {
    entry.rank =
      index > 0 && entries[index - 1]!.missedStarts === entry.missedStarts
        ? entries[index - 1]!.rank
        : index + 1;
  });
  return {
    seasonName: input.seasonName,
    recentDate: input.recentDate,
    recentStatus,
    entries,
    missedStarts: entries.reduce(
      (total, entry) => total + entry.missedStarts,
      0,
    ),
    recentMissedStarts: entries.reduce(
      (total, entry) => total + entry.recentMisses.length,
      0,
    ),
  };
}
