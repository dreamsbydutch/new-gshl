export type GameCoverageEvidence = {
  gameSeconds: number;
  usableProcessSeconds: number;
  officialShots: number;
  verifiedShotCount: number;
};

/** Measure the retained components, not whether one uncertain interval touched a game. */
export function gameSourceCoverage(games: GameCoverageEvidence[]) {
  if (
    !games.length ||
    games.some(
      (g) =>
        Object.values({
          seconds: g.gameSeconds,
          usable: g.usableProcessSeconds,
          shots: g.officialShots,
          verified: g.verifiedShotCount,
        }).some((n) => !Number.isFinite(n) || n < 0) ||
        g.gameSeconds <= 0 ||
        g.officialShots <= 0 ||
        g.usableProcessSeconds > g.gameSeconds ||
        g.verifiedShotCount > g.officialShots,
    )
  )
    throw new Error("Invalid game coverage evidence");
  const officialSeconds = games.reduce((n, g) => n + g.gameSeconds, 0);
  const usableSeconds = games.reduce((n, g) => n + g.usableProcessSeconds, 0);
  const officialShots = games.reduce((n, g) => n + g.officialShots, 0);
  const verifiedShots = games.reduce((n, g) => n + g.verifiedShotCount, 0);
  return {
    officialSeconds,
    usableSeconds,
    officialShots,
    verifiedShots,
    processFraction: usableSeconds / officialSeconds,
    individualShotFraction: verifiedShots / officialShots,
  };
}

export function applySourceCoveragePolicy<
  T extends { gates: Record<string, boolean>; passes: boolean },
>(gate: T, games: GameCoverageEvidence[]) {
  const sourceCoverage = gameSourceCoverage(games);
  const { atLeast95PercentGamesVerified: _legacy, ...preservedGates } =
    gate.gates;
  const gates = {
    ...preservedGates,
    atLeast98PercentProcessExposureVerified:
      sourceCoverage.processFraction >= 0.98,
    atLeast98PercentIndividualShotsVerified:
      sourceCoverage.individualShotFraction >= 0.98,
  };
  return {
    ...gate,
    policy: "verified-components-v1",
    sourceCoverage,
    gates,
    passes: Object.values(gates).every(Boolean),
  };
}
