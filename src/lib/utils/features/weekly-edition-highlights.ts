import type { WeeklyEditionEditorialCandidate } from "../../types/weekly-edition";
import { RECORD_STATS, recordNumber } from "./performance-records";

export function isLateSeasonAwardWindow(
  asOf: string,
  weeks: { startDate: string; endDate: string; isPlayoffs: boolean }[],
) {
  const regular = weeks
    .filter((week) => !week.isPlayoffs)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const first = regular.slice(-6)[0];
  const last = regular.at(-1);
  return Boolean(
    first && last && asOf >= first.startDate && asOf <= last.endDate,
  );
}

export interface WeeklyRecordRow {
  id: string;
  kind: "team" | "player";
  teamId: string;
  playerId?: string;
  stats: Record<string, unknown>;
}

export interface WeeklyRecordBenchmark {
  kind: "team" | "player";
  stat: string;
  value: number;
  compared: number;
}

/** Compact each bounded week before transferring historical evidence to an action. */
export function weeklyRecordBenchmarks(rows: WeeklyRecordRow[]) {
  const benchmarks: WeeklyRecordBenchmark[] = [];
  for (const kind of ["team", "player"] as const) {
    for (const stat of RECORD_STATS) {
      const values = rows.flatMap((row) => {
        if (row.kind !== kind || (recordNumber(row.stats.GP) ?? 0) <= 0)
          return [];
        if (kind === "player" && (recordNumber(row.stats.GP) ?? 0) < 2)
          return [];
        if (
          ["W", "SV", "SO"].includes(stat) &&
          (recordNumber(row.stats.GS) ?? 0) < 3
        )
          return [];
        const value = recordNumber(row.stats[stat]);
        return value === null ? [] : [value];
      });
      if (values.length)
        benchmarks.push({
          kind,
          stat,
          value: Math.max(...values),
          compared: values.length,
        });
    }
  }
  return benchmarks;
}

export function weeklyPerformanceRecordCandidates(input: {
  weekId: string;
  endDate: string;
  gameDays: number;
  isPlayoffs: boolean;
  current: WeeklyRecordRow[];
  historical: WeeklyRecordBenchmark[];
  teamNames: Map<string, string>;
  playerNames: Map<string, string>;
}): WeeklyEditionEditorialCandidate[] {
  const currentHighs = weeklyRecordBenchmarks(input.current);
  return input.current.flatMap((row) => {
    const subject =
      row.kind === "player"
        ? input.playerNames.get(row.playerId ?? "")
        : input.teamNames.get(row.teamId);
    if (!subject) return [];
    const highs = weeklyRecordBenchmarks([row]).flatMap((current) => {
      const peers = input.historical.filter(
        (peer) => peer.kind === current.kind && peer.stat === current.stat,
      );
      if (!peers.length || current.value <= 0) return [];
      const previousValue = Math.max(...peers.map((peer) => peer.value));
      if (current.value < previousValue) return [];
      const currentWeekHigh = currentHighs.find(
        (high) => high.kind === current.kind && high.stat === current.stat,
      )?.value;
      if (currentWeekHigh !== undefined && current.value < currentWeekHigh)
        return [];
      return [
        {
          key: current.stat,
          label: current.stat,
          value: current.value,
          previousValue,
          compared: peers.reduce((total, peer) => total + peer.compared, 0),
        },
      ];
    });
    if (!highs.length) return [];
    const scope = `${input.isPlayoffs ? "playoff" : "regular-season"} weeks with ${input.gameDays} game days`;
    return [
      {
        id: `record:weekly:${input.weekId}:${row.id}`,
        kind: "record" as const,
        scope: "week" as const,
        importance: highs.some((high) => high.value > high.previousValue)
          ? 97
          : 92,
        occurredAt: input.endDate,
        headlineHint: `${subject} ${highs.some((high) => high.value > high.previousValue) ? "sets" : "ties"} a GSHL weekly record`,
        summary: `${subject}: ${highs.map((high) => `${high.key} ${high.value} ${high.value === high.previousValue ? "ties" : "passes"} the previous high of ${high.previousValue}, compared with ${high.compared} eligible historical performances`).join("; ")}. GSHL weekly record scope: ${scope}. The comparison includes earlier completed weeks across league history and checks the current week's eligible performances. Other performances in the current week may share this record.`,
        teamId: row.teamId,
        teamName: input.teamNames.get(row.teamId),
        playerId: row.playerId,
        playerName: row.kind === "player" ? subject : undefined,
        metrics: highs.map(({ compared: _compared, ...metric }) => metric),
        links: [],
      },
    ];
  });
}
