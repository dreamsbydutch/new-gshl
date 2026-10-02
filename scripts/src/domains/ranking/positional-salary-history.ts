import {
  emptyLine,
  categoryMargin,
  type Line,
  type Position,
  type MatchupContext,
} from "../../runtime/positional-matchup-value";
export type Row = Record<string, any>;
export type HistorySeason = {
  season: Row;
  weeks: Row[];
  matchups: Row[];
  teamWeeks: Row[];
  playerWeeks: Row[];
};
const keys = [
  "G",
  "A",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SA",
  "SV",
  "TOI",
];
const num = (x: unknown) => Number(x) || 0;
export function playerLine(r: Row): Line {
  const t = emptyLine();
  for (let i = 0; i < keys.length; i++) t[i] = num(r[keys[i]!]);
  if (r.posGroup === "G") t[11] = num(r.GS);
  return t;
}
export function auditPositionalHistory(seasons: HistorySeason[]) {
  const contexts: MatchupContext[] = [],
    audit: Row[] = [],
    usage: Row[] = [];
  for (const data of seasons) {
    const year = num(data.season.year),
      groups = new Map<string, Row[]>(),
      weeks = new Map(data.weeks.map((w) => [w.id, w]));
    const counters = {
      year,
      playerWeeks: data.playerWeeks.length,
      matchups: data.matchups.length,
      validMatchups: 0,
      missing: 0,
      mismatched: 0,
      forfeitTeams: 0,
      categoryScoreDisagreements: 0,
      modern: year >= 2021,
    };
    for (const p of data.playerWeeks) {
      const key = p.weekId + ":" + p.gshlTeamId,
        g = groups.get(key) ?? [];
      g.push(p);
      groups.set(key, g);
    }
    const valid = new Map<string, { line: Line; players: Row[] }>();
    for (const t of data.teamWeeks) {
      const key = t.weekId + ":" + t.gshlTeamId,
        ps = groups.get(key);
      if (!ps?.length) continue;
      const total = emptyLine();
      for (const p of ps) {
        const x = playerLine(p);
        for (let i = 0; i < x.length; i++) total[i]! += x[i]!;
      }
      // Team goalie totals are intentionally blank when the appearance minimum fails.
      const fail = keys.some((k, i) =>
        i >= 6 && total[11]! < 2
          ? false
          : Math.abs(num(t[k]) - total[i]!) > (k === "TOI" ? 0.1 : 0.01),
      );
      if (fail) {
        counters.mismatched++;
        continue;
      }
      if (total[11]! < 2) counters.forfeitTeams++;
      valid.set(key, { line: total, players: ps });
    }
    for (const m of data.matchups) {
      const week = weeks.get(m.weekId);
      if (!m.isComplete || week?.weekType !== "RS") continue;
      const home = valid.get(m.weekId + ":" + m.homeTeamId),
        away = valid.get(m.weekId + ":" + m.awayTeamId);
      if (!home || !away) {
        counters.missing++;
        continue;
      }
      const days =
        num(week.gameDays) ||
        Math.round(
          (Date.parse(week.endDate) - Date.parse(week.startDate)) / 86400000,
        ) + 1;
      if (days < 3 || days > 21) {
        counters.missing++;
        continue;
      }
      counters.validMatchups++;
      if (
        year >= 2021 &&
        Math.sign(categoryMargin(home.line, away.line)) !==
          Math.sign(num(m.homeScore) - num(m.awayScore))
      )
        counters.categoryScoreDisagreements++;
      for (const [own, opponent] of [
        [home, away],
        [away, home],
      ]) {
        const donors = {} as Record<Position, Line>;
        let complete = true;
        for (const pos of ["F", "D", "G"] as const) {
          const ps = own.players.filter((p) => p.posGroup === pos);
          if (!ps.length) {
            complete = false;
            break;
          }
          const sorted = [...ps].sort((a, b) =>
            String(a.playerId).localeCompare(String(b.playerId)),
          );
          // Stable rotating donor, independent of candidate performance.
          let hash = 0;
          for (const char of String(m.id) + pos)
            hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
          donors[pos] = playerLine(sorted[hash % sorted.length]!);
          usage.push({
            year,
            pos,
            gp: ps.reduce((s, p) => s + num(p.GP), 0),
            gs: ps.reduce((s, p) => s + num(p.GS), 0),
            owned:
              ps.reduce(
                (s, p) =>
                  s + Math.max(0, num(p.days) - num(p.IR) - num(p.IRplus)),
                0,
              ) / days,
          });
        }
        if (complete)
          contexts.push({
            year,
            days,
            own: own.line,
            opponent: opponent.line,
            donors,
          });
      }
    }
    audit.push(counters);
  }
  return { contexts, audit, usage };
}
