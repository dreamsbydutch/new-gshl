/** A performance-led view; does not rewrite accumulated season contribution. */
export const NHL_PERFORMANCE_CONFIG = {
  version: "nhl-performance-v3-preview",
  referenceSeasonGames: 82,
  fullSampleGames: { F: 65, D: 65, G: 45 },
  referenceMinutesPerGame: { F: 15, D: 18, G: 50 },
  availabilityGames: { F: 82, D: 82, G: 60 },
  blendStartGames: { F: 55, D: 55, G: 35 },
  blendEndGames: { F: 68, D: 68, G: 45 },
  minimumPerformanceWeight: 0.2,
  maximumPerformanceWeight: 0.9,
} as const;

export type PerformanceInput = {
  playerId: number;
  position: "F" | "D" | "G";
  status: "rated" | "provisional" | "incomplete";
  games: number;
  minutes: number;
  abilityPer60: number | null;
  seasonValue: number | null;
  /** Actual team season length, not a player's appearances or verified games. */
  teamSeasonGames: number;
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (x: number) => x * x * (3 - 2 * x);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export function rankNhlPerformance(players: readonly PerformanceInput[]) {
  const identities = new Set<number>();
  const rows = players.map((p) => {
    if (
      identities.has(p.playerId) ||
      !Number.isInteger(p.playerId) ||
      p.playerId <= 0 ||
      !["F", "D", "G"].includes(p.position) ||
      !["rated", "provisional", "incomplete"].includes(p.status) ||
      !Number.isInteger(p.games) ||
      p.games <= 0 ||
      !Number.isFinite(p.minutes) ||
      p.minutes <= 0 ||
      !Number.isInteger(p.teamSeasonGames) ||
      p.teamSeasonGames <= 0 ||
      (p.abilityPer60 !== null && !Number.isFinite(p.abilityPer60)) ||
      (p.seasonValue !== null && !Number.isFinite(p.seasonValue))
    )
      throw new Error("Invalid or duplicate performance input");
    identities.add(p.playerId);
    const equivalentGames =
      (p.games * NHL_PERFORMANCE_CONFIG.referenceSeasonGames) /
      p.teamSeasonGames;
    const workloadGames =
      ((p.minutes /
        NHL_PERFORMANCE_CONFIG.referenceMinutesPerGame[p.position]) *
        NHL_PERFORMANCE_CONFIG.referenceSeasonGames) /
      p.teamSeasonGames;
    // Smooth saturation, not a qualification cliff or a probability of accuracy.
    const sampleWeight = smoothstep(
      clamp(
        Math.min(equivalentGames, workloadGames) /
          NHL_PERFORMANCE_CONFIG.fullSampleGames[p.position],
      ),
    );
    const blendProgress = smoothstep(
      clamp(
        (Math.min(equivalentGames, workloadGames) -
          NHL_PERFORMANCE_CONFIG.blendStartGames[p.position]) /
          (NHL_PERFORMANCE_CONFIG.blendEndGames[p.position] -
            NHL_PERFORMANCE_CONFIG.blendStartGames[p.position]),
      ),
    );
    const performanceWeight =
      NHL_PERFORMANCE_CONFIG.minimumPerformanceWeight +
      (NHL_PERFORMANCE_CONFIG.maximumPerformanceWeight -
        NHL_PERFORMANCE_CONFIG.minimumPerformanceWeight) *
        blendProgress;
    const performancePerGame =
      p.abilityPer60 === null || p.status === "incomplete"
        ? null
        : (p.abilityPer60 * p.minutes) / (60 * p.games);
    return {
      playerId: p.playerId,
      position: p.position,
      status: p.status,
      performancePerGame,
      accumulatedValue: p.seasonValue,
      sampleWeight,
      performanceWeight,
      overallWeight: 1 - performanceWeight,
      availability: clamp(
        equivalentGames / NHL_PERFORMANCE_CONFIG.availabilityGames[p.position],
      ),
      performancePercentile: null as number | null,
      performanceScore: null as number | null,
      volumeScore: null as number | null,
      performanceRating: null as number | null,
      performanceRank: null as number | null,
    };
  });
  for (const position of ["F", "D", "G"] as const) {
    const pool = rows.filter(
      (p) =>
        p.position === position &&
        p.status === "rated" &&
        p.performancePerGame !== null &&
        p.accumulatedValue !== null,
    );
    // A single observation cannot establish a position distribution.
    if (pool.length < 2) continue;
    const rates = pool.map((p) => p.performancePerGame!);
    const center = median(rates);
    const deviations = rates.map((rate) => Math.abs(rate - center));
    const scale = median(deviations) || Math.max(...deviations) || 1;
    const volumes = pool.map((p) => p.accumulatedValue!);
    const volumeCenter = median(volumes);
    const volumeDeviations = volumes.map((value) =>
      Math.abs(value - volumeCenter),
    );
    const volumeScale =
      median(volumeDeviations) || Math.max(...volumeDeviations) || 1;
    for (const p of pool) {
      const less = pool.filter(
        (q) => q.performancePerGame! < p.performancePerGame!,
      ).length;
      const equal = pool.filter(
        (q) => q.performancePerGame === p.performancePerGame,
      ).length;
      p.performancePercentile =
        (100 * (less + (equal - 1) / 2)) / (pool.length - 1);
      // Preserve rate differences: percentiles compress a large pool's leaders,
      // letting a small availability bonus overwhelm a large performance gap.
      // Bounded scores also prevent extreme short samples from dominating.
      p.performanceScore =
        50 +
        (100 / Math.PI) * Math.atan((p.performancePerGame! - center) / scale);
      const moderated = 50 + (p.performanceScore - 50) * p.sampleWeight;
      p.volumeScore =
        50 +
        (100 / Math.PI) *
          Math.atan((p.accumulatedValue! - volumeCenter) / volumeScale);
      // Keep accumulated contribution meaningful without allowing a short
      // finishing streak to bypass the sample-size safeguard through this term.
      const moderatedVolume = 50 + (p.volumeScore - 50) * p.sampleWeight;
      p.performanceRating =
        p.performanceWeight * moderated + p.overallWeight * moderatedVolume;
    }
    for (const p of pool)
      p.performanceRank =
        1 +
        pool.filter((q) => q.performanceRating! > p.performanceRating!).length;
  }
  return rows;
}
