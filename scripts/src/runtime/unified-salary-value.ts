import {
  expectedCategoryWins,
  expectedMatchupWin,
  type PlayerProjection,
  type MatchupContext,
  type Position,
} from "./positional-matchup-value";

export type SalaryObjective = "categories" | "matchup";
export type SalaryValue = {
  id: string;
  position: Position;
  expected: number;
  replacement: number;
  value: number;
};
/** All positions share the same objective unit. Replacement is priced from real candidates. */
export function unifiedSalaryValues(
  players: readonly PlayerProjection[],
  contexts: readonly MatchupContext[],
  utilization: Record<Position, number>,
  depth: Record<Position, number>,
  objective: SalaryObjective = "matchup",
): SalaryValue[] {
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("Duplicate projection identity");
  const score =
      objective === "categories" ? expectedCategoryWins : expectedMatchupWin,
    output: SalaryValue[] = [];
  for (const pos of ["F", "D", "G"] as const) {
    if (!Number.isFinite(depth[pos]) || depth[pos] < 1)
      throw new Error("Invalid replacement depth");
    const scored = players
      .filter((p) => p.position === pos)
      .map((p) => ({
        id: p.id,
        position: pos,
        expected: score(p, contexts, utilization[pos]),
      }))
      .sort((a, b) => b.expected - a.expected || a.id.localeCompare(b.id));
    const rank = Math.round(depth[pos]),
      band = scored.slice(rank, rank + Math.max(5, Math.round(rank * 0.1)));
    if (!band.length) throw new Error(`Insufficient ${pos} replacement pool`);
    const replacement = band.reduce((s, r) => s + r.expected, 0) / band.length;
    output.push(
      ...scored.map((r) => ({
        ...r,
        replacement,
        value: r.expected - replacement,
      })),
    );
  }
  return output.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

/** One cross-position percentile; ties retain equal ratings and competition ranks. */
export function rankUnifiedValues<T extends { id: string; value: number }>(
  rows: readonly T[],
) {
  const sorted = [...rows].sort(
    (a, b) => b.value - a.value || a.id.localeCompare(b.id),
  );
  if (rows.some((r) => !Number.isFinite(r.value)))
    throw new Error("Invalid salary value");
  let rank = 1;
  return sorted.map((r, i) => {
    if (i && Math.abs(r.value - sorted[i - 1]!.value) > 1e-10) rank = i + 1;
    return {
      ...r,
      rank,
      rating:
        sorted.length === 1
          ? 100
          : (100 * (sorted.length - rank)) / (sorted.length - 1),
    };
  });
}
