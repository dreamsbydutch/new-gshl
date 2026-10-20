import type {
  CareerAggregate,
  RecordPeriod,
  RecordSubject,
} from "../../types/records";
import type { PerformanceKind, PerformanceRow } from "../../types/performances";
import { performanceStats, topPerformances } from "./performances";

export const RECORD_LABELS: Record<string, string> = {
  G: "Goals",
  A: "Assists",
  P: "Points",
  PPP: "Power-play points",
  SOG: "Shots on goal",
  HIT: "Hits",
  BLK: "Blocks",
  PIM: "Penalty minutes",
  PM: "+/−",
  W: "Goalie wins",
  SO: "Shutouts",
  SV: "Saves",
  SA: "Shots against",
  GA: "Goals against",
  GAA: "Goals-against average",
  SVP: "Save percentage",
  GP: "Games played",
  TOI: "Time on ice (minutes)",
  teamW: "Matchup wins",
  teamL: "Matchup losses",
  teamT: "Matchup ties",
};

export function recordKind(
  subject: RecordSubject,
  period: RecordPeriod,
): PerformanceKind {
  if (period === "career")
    return subject === "player" ? "playerCareer" : "teamCareer";
  if (period === "week")
    return subject === "player" ? "playerWeek" : "teamWeek";
  return subject === "player" ? "playerTotal" : "teamSeason";
}

export function recordStats(kind: PerformanceKind): string[] {
  return Object.keys(RECORD_LABELS).filter((stat) =>
    performanceStats(kind).includes(stat),
  );
}

export function recordDirection(stat: string): "asc" | "desc" {
  return stat === "GAA" ? "asc" : "desc";
}

export function isCareerPerformance(kind: PerformanceKind) {
  return kind === "playerCareer" || kind === "teamCareer";
}

/** Retain every contributor until aggregation finishes; page-level tops lose career leaders. */
export function addCareerPerformances(
  current: ReadonlyMap<string, CareerAggregate>,
  rows: readonly PerformanceRow[],
  kind: PerformanceKind,
): Map<string, CareerAggregate> {
  const next = new Map(current);
  for (const source of rows) {
    const key = kind === "playerCareer" ? source.playerId : source.franchiseId;
    if (!key) continue;
    const previous = next.get(key);
    const stats = { ...previous?.row.stats };
    for (const stat of performanceStats(kind)) {
      if (stat === "GAA" || stat === "SVP") continue;
      const value = source.stats[stat];
      if (value != null) stats[stat] = (stats[stat] ?? 0) + value;
    }
    next.set(key, {
      row: {
        ...source,
        id: `career:${key}`,
        season: "Career",
        period: "Career",
        teamIds: [
          ...new Set([...(previous?.row.teamIds ?? []), ...source.teamIds]),
        ],
        weekId: null,
        stats,
      },
      completeGaa:
        (previous?.completeGaa ?? true) &&
        source.stats.GA != null &&
        source.stats.TOI != null,
      completeSvp:
        (previous?.completeSvp ?? true) &&
        source.stats.SV != null &&
        source.stats.SA != null,
    });
  }
  return next;
}

export function careerLeaders(
  aggregates: ReadonlyMap<string, CareerAggregate>,
  kind: PerformanceKind,
  stat: string,
  direction: "asc" | "desc",
  minimumGames = 1,
): PerformanceRow[] {
  const rows = [...aggregates.values()]
    .map(({ row, completeGaa, completeSvp }) => {
      const stats = { ...row.stats };
      if (kind === "playerCareer") {
        stats.GAA =
          completeGaa && (stats.TOI ?? 0) > 0
            ? (60 * stats.GA!) / stats.TOI!
            : null;
        stats.SVP =
          completeSvp && (stats.SA ?? 0) > 0 ? stats.SV! / stats.SA! : null;
      }
      return { ...row, stats };
    })
    .filter((row) => (row.stats.GP ?? 0) >= minimumGames);
  return topPerformances(rows, stat, direction);
}

/** Competition ranks: tied values share a place and the next rank skips those places. */
export function recordRanks(
  rows: readonly PerformanceRow[],
  stat: string,
): number[] {
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.stats[stat] !== rows[index - 1]?.stats[stat])
      rank = index + 1;
    return rank;
  });
}
