import {
  expectedCategoryWins,
  expectedMatchupWin,
  type PlayerProjection,
  type MatchupContext,
  type Position,
} from "./positional-matchup-value";

export type SalaryObjective = "categories" | "matchup";
export type SkaterPool = "positional" | "shared";

/** Shared skater opportunities: positional ceilings do not reserve defensive slots. */
export function salaryEnvironment(
  contexts: readonly MatchupContext[],
  utilization: Record<Position, number>,
  depth: Record<Position, number>,
  skaterPool: SkaterPool,
) {
  for (const p of ["F", "D", "G"] as const)
    if (
      !Number.isFinite(depth[p]) ||
      depth[p] < 1 ||
      !Number.isFinite(utilization[p]) ||
      utilization[p] < 0 ||
      utilization[p] > 1
    )
      throw new Error("Invalid salary environment");
  if (skaterPool === "positional") return { contexts, utilization };
  const weight = depth.F / (depth.F + depth.D);
  const sharedUsage = weight * utilization.F + (1 - weight) * utilization.D;
  return {
    utilization: { ...utilization, F: sharedUsage, D: sharedUsage },
    contexts: contexts.map((c) => {
      const donor = c.donors.F.map(
        (v, i) => weight * v + (1 - weight) * c.donors.D[i]!,
      );
      return { ...c, donors: { ...c.donors, F: donor, D: donor } };
    }),
  };
}
/** League policy: one salary, predominantly next season, regardless of chosen term. */
export const SALARY_HORIZON_WEIGHTS = [0.7, 0.2, 0.1] as const;
export function singleSalaryValue(
  years: readonly { horizon: number; value: number }[],
  weights: readonly number[] = SALARY_HORIZON_WEIGHTS,
) {
  if (
    years.length !== 3 ||
    new Set(years.map((r) => r.horizon)).size !== 3 ||
    years.some(
      (r) => ![1, 2, 3].includes(r.horizon) || !Number.isFinite(r.value),
    )
  )
    throw new Error("Three complete finite forecast years required");
  if (
    weights.length !== 3 ||
    weights.some((w) => !Number.isFinite(w) || w < 0) ||
    Math.abs(weights.reduce((s, w) => s + w, 0) - 1) > 1e-9
  )
    throw new Error("Invalid horizon weights");
  return years.reduce((s, r) => s + r.value * weights[r.horizon - 1]!, 0);
}
/** Existing rank-to-dollar anchors; the experimental replacement floor is retained. */
export function unifiedAnnualSalary(rank: number, value: number) {
  if (!Number.isFinite(rank) || rank < 1 || !Number.isFinite(value))
    throw new Error("Invalid salary inputs");
  const anchors = [
    [3.5, 10e6],
    [21, 9e6],
    [35, 8e6],
    [154, 5e6],
    [240, 2e6],
    [285, 1e6],
  ] as const;
  if (value <= 0 || rank >= 285) return 1e6;
  if (rank <= 3.5) return 10e6;
  for (let i = 1; i < anchors.length; i++) {
    const [a, x] = anchors[i - 1]!,
      [b, y] = anchors[i]!;
    if (rank <= b)
      return Math.round((x + ((y - x) * (rank - a)) / (b - a)) / 50000) * 50000;
  }
  throw new Error("Unpriced rank");
}
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
  skaterPool: SkaterPool = "positional",
): SalaryValue[] {
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("Duplicate projection identity");
  const environment = salaryEnvironment(
    contexts,
    utilization,
    depth,
    skaterPool,
  );
  const score =
      objective === "categories" ? expectedCategoryWins : expectedMatchupWin,
    output: SalaryValue[] = [];
  for (const pos of (skaterPool === "shared"
    ? ["S", "G"]
    : ["F", "D", "G"]) as (Position | "S")[]) {
    const scored = players
      .filter((p) => (pos === "S" ? p.position !== "G" : p.position === pos))
      .map((p) => ({
        id: p.id,
        position: p.position,
        expected: score(
          p,
          environment.contexts,
          environment.utilization[p.position],
        ),
      }))
      .sort((a, b) => b.expected - a.expected || a.id.localeCompare(b.id));
    const rank = Math.round(pos === "S" ? depth.F + depth.D : depth[pos]),
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
