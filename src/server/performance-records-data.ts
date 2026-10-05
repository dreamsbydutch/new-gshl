import type {
  MatchupRecords,
  RecordObservation,
} from "../lib/types/performance-records";
import {
  buildPerformanceRecords,
  recordWindow,
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
  if (!Number.isFinite(Number(week.gameDays)) || Number(week.gameDays) <= 0)
    return { badges: [], scope: "" };
  const complete = isFinal(matchup);
  const comparable = weeks.filter(
    (row) =>
      row.isPlayoffs === week.isPlayoffs &&
      Number(row.gameDays) === Number(week.gameDays) &&
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
      " weeks with " +
      String(week.gameDays) +
      " game days. Compared with completed recorded weeks through this matchup; historical coverage is not independently verified. Refreshes every five minutes.",
  };
}
