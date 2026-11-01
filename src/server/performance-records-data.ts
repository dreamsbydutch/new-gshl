import type {
  MatchupRecords,
  RecordObservation,
} from "../lib/types/performance-records";
import {
  buildPerformanceRecords,
  recordWindow,
  recordWeekCategory,
} from "../lib/utils/features/performance-records";
export type RecordRow = Record<string, unknown> & { id: string };
export interface RecordReader {
  matchup(id: string): Promise<RecordRow[]>;
  calendar(): Promise<{ seasons: RecordRow[]; weeks: RecordRow[] }>;
  week(
    seasonId: string,
    weekId: string,
  ): Promise<{
    teams: RecordRow[];
    players: RecordRow[];
    matchups: RecordRow[];
  }>;
}
function isFinal(row: RecordRow) {
  return (
    row.isComplete === true ||
    row.homeWin === true ||
    row.awayWin === true ||
    row.tie === true
  );
}
/** Sorted starter multiset; nonstarter slots do not change the comparison era. */
function startingLineup(rosterSpots: unknown): string | null {
  if (!Array.isArray(rosterSpots) || !rosterSpots.length) return null;
  const starters: string[] = [];
  for (const spot of rosterSpots) {
    if (typeof spot !== "string" || !spot.trim()) return null;
    const position = spot.trim().toUpperCase();
    if (["C", "LW", "RW", "D", "G", "UTIL"].includes(position))
      starters.push(position);
    else if (
      ![
        "BN",
        "BENCH",
        "BENCHF",
        "BENCHD",
        "BENCHG",
        "IR",
        "IRPLUS",
        "IR+",
        "IL",
        "IL+",
        "NA",
      ].includes(position)
    )
      return null;
  }
  return starters.length ? starters.sort().join(",") : null;
}
export async function loadMatchupRecords(
  matchupId: string,
  reader: RecordReader,
  now: number,
): Promise<MatchupRecords> {
  const [matchup] = await reader.matchup(matchupId);
  if (!matchup) return { badges: [], scope: "" };
  const { seasons, weeks } = await reader.calendar();
  const week = weeks.find((row) => row.id === matchup.weekId);
  if (!week || !recordWindow(String(week.startDate), String(week.endDate), now))
    return { badges: [], scope: "" };
  const category = recordWeekCategory(week.gameDays);
  if (!category) return { badges: [], scope: "" };
  const lineup = startingLineup(
    seasons.find((row) => row.id === week.seasonId)?.rosterSpots,
  );
  if (!lineup) return { badges: [], scope: "" };
  const comparableSeasons = new Set(
    seasons
      .filter((row) => startingLineup(row.rosterSpots) === lineup)
      .map((row) => row.id),
  );
  const complete = isFinal(matchup);
  const comparable = weeks.filter(
    (row) =>
      comparableSeasons.has(String(row.seasonId)) &&
      row.isPlayoffs === week.isPlayoffs &&
      recordWeekCategory(row.gameDays) !== null &&
      (category === "long_week" ||
        recordWeekCategory(row.gameDays) === "weekly") &&
      String(row.endDate) <= String(week.endDate),
  );
  const observations: RecordObservation[] = [];
  const current: RecordObservation[] = [];
  for (let offset = 0; offset < comparable.length; offset += 6) {
    const batch = comparable.slice(offset, offset + 6);
    const results = await Promise.all(
      batch.map((row) => reader.week(String(row.seasonId), row.id)),
    );
    for (const [index, result] of results.entries()) {
      const historicalWeek = batch[index]!;
      const season = seasons.find((row) => row.id === historicalWeek.seasonId);
      const seen = new Set<string>();
      for (const kind of ["team", "player"] as const) {
        for (const row of kind === "team" ? result.teams : result.players) {
          const key =
            kind +
            ":" +
            String(row.gshlTeamId) +
            ":" +
            (typeof row.playerId === "string" ? row.playerId : "");
          if (seen.has(key)) throw new Error("Ambiguous duplicate performance");
          seen.add(key);
          const game = result.matchups.find(
            (game) =>
              game.homeTeamId === row.gshlTeamId ||
              game.awayTeamId === row.gshlTeamId,
          );
          if (!game) continue;
          const observation = {
            id: row.id,
            entityId:
              kind === "team"
                ? String(row.gshlTeamId)
                : String(row.gshlTeamId) + ":" + String(row.playerId),
            kind,
            stats: row,
            label:
              (typeof season?.name === "string" ? season.name : "Season") +
              " - Week " +
              String(historicalWeek.weekNum),
            matchupId: game.id,
          };
          if (game.id === matchupId) current.push(observation);
          else if (isFinal(game)) observations.push(observation);
        }
      }
    }
  }
  const history = complete ? [...observations, ...current] : observations;
  return {
    badges: buildPerformanceRecords(current, history, !complete),
    scope:
      (week.isPlayoffs ? "Playoff" : "Regular-season") +
      (category === "weekly"
        ? " weekly records (up to 7 NHL game days)."
        : " overall weekly records (all week lengths).") +
      " Compared with completed league weeks with the same starting lineup through this matchup. Refreshes every five minutes.",
  };
}
