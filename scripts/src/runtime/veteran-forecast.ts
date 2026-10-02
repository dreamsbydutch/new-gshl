import {
  categoryPrediction,
  type CategoryPrediction,
  type Totals,
} from "./fantasy-category-forecast";

const RATE_KEYS = ["G", "A", "PPP", "SOG", "HIT", "BLK"] as const;
type Rates = Record<(typeof RATE_KEYS)[number], number>;
export type VeteranProfile = {
  playerId: number;
  origin: number;
  position: string;
  age: number;
  games: number;
  priorGames: number;
  pointsPerGame: number;
  priorPointsPerGame: number;
  current: Rates;
};
export type VeteranExample = VeteranProfile & {
  horizon: number;
  targetYear: number;
  predicted: CategoryPrediction;
  actual: Pick<Totals, "GP"> & Rates;
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Smooth eligibility based only on sustained observed production; no named-player exceptions. */
export function veteranEvidence(profile: VeteranProfile) {
  if (
    [
      profile.age,
      profile.games,
      profile.priorGames,
      profile.pointsPerGame,
      profile.priorPointsPerGame,
      ...Object.values(profile.current),
    ].some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error("Invalid veteran profile");
  if (profile.position !== "F" || profile.games < 40 || profile.priorGames < 40)
    return 0;
  const sustained = Math.min(profile.pointsPerGame, profile.priorPointsPerGame);
  return (
    clamp((profile.age - 32) / 3, 0, 1) * clamp((sustained - 0.6) / 0.4, 0, 1)
  );
}
/** Learn production retention or forecast residuals from completed comparable seasons. */
export function adjustVeteranForecast(
  profile: VeteranProfile,
  horizon: number,
  prediction: CategoryPrediction,
  examples: readonly VeteranExample[],
  mode:
    | "availability"
    | "availability-and-rates"
    | "retention" = "availability-and-rates",
) {
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 3)
    throw new Error("Invalid forecast horizon");
  const strength = veteranEvidence(profile);
  const unchanged = {
    prediction: { ...prediction },
    audit: {
      strength,
      players: 0,
      effectivePlayers: 0,
      latestTargetYear: null as number | null,
      gamesCorrection: 0,
    },
  };
  if (!strength) return unchanged;
  const comparable = examples.filter(
    (e) =>
      e.targetYear <= profile.origin &&
      e.horizon === horizon &&
      e.position === "F" &&
      e.age >= 30 &&
      e.games >= 40 &&
      e.priorGames >= 40 &&
      Math.min(e.pointsPerGame, e.priorPointsPerGame) >= 0.6,
  );
  if (
    comparable.some(
      (e) =>
        e.targetYear !== e.origin + e.horizon ||
        [e.actual.GP, ...RATE_KEYS.map((k) => e.actual[k])].some(
          (v) => !Number.isFinite(v) || v < 0,
        ),
    )
  )
    throw new Error("Invalid veteran training outcome");
  const weighted = comparable.map((e) => ({
    e,
    w: Math.exp(
      -0.5 *
        (((e.age - profile.age) / 3) ** 2 +
          ((Math.min(e.pointsPerGame, e.priorPointsPerGame) -
            Math.min(profile.pointsPerGame, profile.priorPointsPerGame)) /
            0.25) **
            2 +
          ((e.games - profile.games) / 25) ** 2),
    ),
  }));
  const byPlayer = new Map<number, number>();
  for (const { e, w } of weighted)
    byPlayer.set(e.playerId, (byPlayer.get(e.playerId) ?? 0) + w);
  // One player's repeated seasons cannot contribute more than one full observation.
  for (const row of weighted)
    row.w /= Math.max(1, byPlayer.get(row.e.playerId)!);
  const mass = [...byPlayer.values()].map((w) => Math.min(1, w)),
    total = mass.reduce((s, w) => s + w, 0),
    effective = (total * total) / (mass.reduce((s, w) => s + w * w, 0) || 1);
  if (byPlayer.size < 6 || effective < 4) return unchanged;
  const shrink = total / (total + 12),
    gpResidual =
      weighted.reduce(
        (s, { e, w }) => s + w * (e.actual.GP - e.predicted.GP),
        0,
      ) / total;
  const retainedGP =
    (weighted.reduce((s, { e, w }) => s + (w * e.actual.GP) / e.games, 0) /
      total) *
    profile.games;
  const gp = clamp(
      prediction.GP +
        strength *
          shrink *
          (mode === "retention" ? retainedGP - prediction.GP : gpResidual),
      0,
      82,
    ),
    totals = { ...prediction, GP: gp };
  for (const k of [
    "G",
    "A",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
    "MIN",
    "PPMIN",
  ] as const)
    totals[k] = (prediction[k] / Math.max(1, prediction.GP)) * gp;
  if (mode === "availability-and-rates") {
    const active = weighted.filter((r) => r.e.actual.GP > 0),
      exposure = active.reduce(
        (s, r) => s + (r.w * Math.min(82, r.e.actual.GP)) / 60,
        0,
      ),
      rateShrink = exposure / (exposure + 12);
    if (exposure > 0)
      for (const k of RATE_KEYS) {
        const residual =
          active.reduce(
            (s, { e, w }) =>
              s +
              ((w * Math.min(82, e.actual.GP)) / 60) *
                (e.actual[k] / e.actual.GP -
                  e.predicted[k] / Math.max(1, e.predicted.GP)),
            0,
          ) / exposure;
        totals[k] =
          Math.max(
            0,
            prediction[k] / Math.max(1, prediction.GP) +
              strength * rateShrink * residual,
          ) * gp;
      }
  }
  if (mode === "retention")
    for (const k of RATE_KEYS) {
      // Direct counting-stat retention includes departures and the covariance of workload and scoring.
      const retained =
        (weighted.reduce(
          (s, { e, w }) => s + (w * e.actual[k]) / Math.max(1, e.current[k]),
          0,
        ) /
          total) *
        profile.current[k];
      totals[k] = Math.max(
        0,
        prediction[k] + strength * shrink * (retained - prediction[k]),
      );
    }
  totals.G = Math.min(totals.G, totals.SOG);
  totals.PPP = Math.min(totals.PPP, totals.G + totals.A);
  return {
    prediction: categoryPrediction(totals),
    audit: {
      strength,
      players: byPlayer.size,
      effectivePlayers: effective,
      latestTargetYear: Math.max(...weighted.map((r) => r.e.targetYear)),
      gamesCorrection: gp - prediction.GP,
    },
  };
}
