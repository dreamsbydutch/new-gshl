/** Independent NHL season evaluation. No GSHL categories, salary or storage access. */
export type NhlPosition = "F" | "D" | "G";
export type NhlRatingProfile = "core" | "edge";
export type NhlRatingPlayer = {
  playerId: number;
  name: string;
  team: string;
  position: NhlPosition;
  games: number;
  minutes: number;
  fiveMinutes?: number;
  fiveGoals?: number;
  fivePrimaryAssists?: number;
  fiveSecondaryAssists?: number;
  relativeShotShare?: number;
  netMinorPenaltiesPer60?: number;
  evMinutes?: number;
  evGoalsAgainst?: number;
  ppMinutes?: number;
  ppGoals?: number;
  ppPrimaryAssists?: number;
  ppSecondaryAssists?: number;
  pkMinutes?: number;
  pkGoalsAgainstPer60?: number;
  shotsAgainst?: number;
  saves?: number;
  highDangerShots?: number;
  /** Mutually exclusive EDGE locations, including shots outside named danger areas. */
  saveBuckets?: { shots: number; saves: number }[];
};
export type NhlRatingInput = {
  season: number;
  gameType: 2 | 3;
  profile: NhlRatingProfile;
  players: NhlRatingPlayer[];
};

export const NHL_SEASON_RATING_CONFIG = {
  version: "nhl-season-value-v1",
  // Policy weights, not fitted estimates of goals/wins above replacement.
  weights: {
    F: { scoring: 0.4, territory: 0.35, defense: 0.1, discipline: 0.15 },
    D: { scoring: 0.25, territory: 0.45, defense: 0.2, discipline: 0.1 },
  },
  primaryAssist: 0.8,
  secondaryAssist: 0.3,
  specialTeamsWeight: 0.2,
  edgeSkaterWeight: 0.1,
  // An explicit reference offset; not an empirically established replacement level.
  referenceOffset: 0.5,
  skaterPriorMinutes: 300,
  specialTeamsPriorMinutes: 100,
  goaliePriorShots: 600,
  qualifiedSkaterMinutes: 200,
  qualifiedGoalieMinutes: 300,
  qualifiedSpecialTeamsMinutes: 30,
  minimumPeers: 5,
  maximumZ: 3,
} as const;

type Metric = {
  name: string;
  rate: number | undefined;
  exposure: number;
  prior: number;
  minimum: number;
  weight: number;
  // Minutes through which this component contributes season value.
  minutes: number;
};
export type NhlRatingComponent = {
  name: string;
  rate: number | null;
  peerMean: number | null;
  peerDeviation: number | null;
  peers: number;
  reliability: number;
  adjustedZ: number | null;
  value: number;
};
export type NhlSeasonRating = {
  playerId: number;
  name: string;
  team: string;
  position: NhlPosition;
  games: number;
  minutes: number;
  status: "rated" | "provisional" | "incomplete";
  missing: string[];
  /** Percentile of season value within position, not a cross-position valuation. */
  seasonRating: number | null;
  rank: number | null;
  impactPer60: number | null;
  seasonValue: number | null;
  components: NhlRatingComponent[];
};

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const round = (n: number) => Math.round(n * 10000) / 10000;
function rate(count: number | undefined, minutes: number | undefined) {
  return finite(count) && finite(minutes) && minutes > 0
    ? (count * 60) / minutes
    : undefined;
}
function scoring(goals?: number, primary?: number, secondary?: number) {
  const c = NHL_SEASON_RATING_CONFIG;
  return finite(goals) && finite(primary) && finite(secondary)
    ? goals + c.primaryAssist * primary + c.secondaryAssist * secondary
    : undefined;
}

function metrics(p: NhlRatingPlayer, input: NhlRatingInput): Metric[] {
  const c = NHL_SEASON_RATING_CONFIG;
  const metric = (
    name: string,
    value: number | undefined,
    minutes: number,
    weight: number,
  ): Metric => ({
    name,
    rate: value,
    exposure: minutes,
    minutes,
    weight,
    prior: c.skaterPriorMinutes,
    minimum: c.qualifiedSkaterMinutes,
  });
  if (p.position === "G") {
    let exposure = p.shotsAgainst ?? 0;
    let performance =
      finite(p.saves) && finite(p.shotsAgainst) && p.shotsAgainst > 0
        ? p.saves / p.shotsAgainst
        : undefined;
    if (input.profile === "edge") {
      const peers = input.players.filter(
        (x) => x.position === "G" && x.saveBuckets,
      );
      const baseline = [0, 1, 2, 3].map((i) => {
        const shots = peers.reduce(
          (sum, x) => sum + x.saveBuckets![i]!.shots,
          0,
        );
        return shots > 0
          ? peers.reduce((sum, x) => sum + x.saveBuckets![i]!.saves, 0) / shots
          : 0;
      });
      const shots = p.saveBuckets?.reduce((sum, x) => sum + x.shots, 0) ?? 0;
      exposure = shots;
      performance =
        shots > 0 && baseline.every(finite)
          ? p.saveBuckets!.reduce(
              (sum, x, i) => sum + x.saves - x.shots * baseline[i]!,
              0,
            ) / shots
          : undefined;
    }
    return [
      {
        ...metric(
          input.profile === "edge" ? "locationAdjustedSaving" : "saving",
          performance,
          p.minutes,
          1,
        ),
        exposure,
        prior: c.goaliePriorShots,
        minimum: 300,
      },
    ];
  }
  const w = c.weights[p.position];
  const minutes = p.fiveMinutes ?? 0;
  const base = input.profile === "edge" ? 1 - c.edgeSkaterWeight : 1;
  const result = [
    metric(
      "scoring5v5",
      rate(
        scoring(p.fiveGoals, p.fivePrimaryAssists, p.fiveSecondaryAssists),
        minutes,
      ),
      minutes,
      w.scoring * base,
    ),
    metric("territory5v5", p.relativeShotShare, minutes, w.territory * base),
    // Even-strength goal suppression is a contextual proxy, not isolated defense.
    metric(
      "defenseEV",
      rate(p.evGoalsAgainst, p.evMinutes) === undefined
        ? undefined
        : -rate(p.evGoalsAgainst, p.evMinutes)!,
      minutes,
      w.defense * base,
    ),
    metric(
      "discipline",
      p.netMinorPenaltiesPer60,
      p.minutes,
      w.discipline * base,
    ),
  ];
  if (input.profile === "edge")
    result.push(
      metric(
        "dangerShots",
        rate(p.highDangerShots, p.minutes),
        p.minutes,
        c.edgeSkaterWeight,
      ),
    );
  for (const [name, value, time] of [
    [
      "powerPlay",
      rate(
        scoring(p.ppGoals, p.ppPrimaryAssists, p.ppSecondaryAssists),
        p.ppMinutes,
      ),
      p.ppMinutes,
    ],
    [
      "penaltyKill",
      finite(p.pkGoalsAgainstPer60) ? -p.pkGoalsAgainstPer60 : undefined,
      p.pkMinutes,
    ],
  ] as const) {
    result.push({
      ...metric(name, value, time ?? 0, c.specialTeamsWeight),
      prior: c.specialTeamsPriorMinutes,
      minimum: c.qualifiedSpecialTeamsMinutes,
    });
  }
  return result;
}

export function validateNhlRatingInput(input: NhlRatingInput): void {
  if (
    !Number.isInteger(input.season) ||
    !/^\d{8}$/.test(String(input.season)) ||
    Math.floor(input.season / 10000) + 1 !== input.season % 10000 ||
    ![2, 3].includes(input.gameType) ||
    !["core", "edge"].includes(input.profile) ||
    !Array.isArray(input.players)
  ) {
    throw new Error(
      "Expected an NHL season (e.g. 20242025), game type 2/3 and core/edge profile",
    );
  }
  const ids = new Set<number>();
  for (const p of input.players) {
    if (!Number.isInteger(p.playerId) || p.playerId <= 0 || ids.has(p.playerId))
      throw new Error("Invalid or duplicate NHL player identity");
    ids.add(p.playerId);
    if (
      !["F", "D", "G"].includes(p.position) ||
      typeof p.name !== "string" ||
      typeof p.team !== "string" ||
      !finite(p.games) ||
      p.games < 0 ||
      !finite(p.minutes) ||
      p.minutes < 0
    )
      throw new Error(`Invalid player ${p.playerId}`);
    for (const [key, value] of Object.entries(p)) {
      if (
        value === undefined ||
        ["name", "team", "position", "saveBuckets"].includes(key)
      )
        continue;
      if (
        !finite(value) ||
        (value < 0 &&
          !["relativeShotShare", "netMinorPenaltiesPer60"].includes(key))
      )
        throw new Error(`Invalid ${key} for ${p.playerId}`);
    }
    if (finite(p.relativeShotShare) && Math.abs(p.relativeShotShare) > 1)
      throw new Error("Shot share must be a fraction");
    if (finite(p.saves) && finite(p.shotsAgainst) && p.saves > p.shotsAgainst)
      throw new Error("Saves exceed shots");
    if (
      p.saveBuckets &&
      (p.saveBuckets.length !== 4 ||
        p.saveBuckets.some(
          (x) =>
            !finite(x.shots) ||
            !finite(x.saves) ||
            x.shots < 0 ||
            x.saves < 0 ||
            x.saves > x.shots,
        ))
    )
      throw new Error("Invalid EDGE save buckets");
  }
}

export function rankNhlSeason(input: NhlRatingInput): NhlSeasonRating[] {
  validateNhlRatingInput(input);
  const c = NHL_SEASON_RATING_CONFIG;
  const active = input.players.filter((p) => p.games > 0 && p.minutes > 0);
  const prepared = active.map((player) => ({
    player,
    metrics: metrics(player, input),
  }));
  const results = prepared.map(
    ({ player: p, metrics: playerMetrics }): NhlSeasonRating => {
      const missing: string[] = [];
      const components = playerMetrics.map((m): NhlRatingComponent => {
        const isSpecial = ["powerPlay", "penaltyKill"].includes(m.name);
        // Zero deployment is genuinely no contribution. Unknown deployment is missing.
        const noDeployment =
          isSpecial &&
          (m.name === "powerPlay" ? p.ppMinutes : p.pkMinutes) === 0;
        const peers = prepared
          .filter(
            (x) =>
              x.player.position === p.position &&
              x.player.minutes >=
                (p.position === "G"
                  ? c.qualifiedGoalieMinutes
                  : c.qualifiedSkaterMinutes),
          )
          .flatMap((x) =>
            x.metrics.filter(
              (v) =>
                v.name === m.name && v.exposure >= v.minimum && finite(v.rate),
            ),
          );
        const mean = peers.length
          ? peers.reduce((sum, x) => sum + x.rate!, 0) / peers.length
          : 0;
        const deviation = peers.length
          ? Math.sqrt(
              peers.reduce((sum, x) => sum + (x.rate! - mean) ** 2, 0) /
                peers.length,
            )
          : 0;
        const usable =
          noDeployment || (finite(m.rate) && peers.length >= c.minimumPeers);
        if (!usable) missing.push(m.name);
        const reliability = m.exposure / (m.exposure + m.prior);
        const z =
          usable && !noDeployment && deviation > 1e-12
            ? Math.max(
                -c.maximumZ,
                Math.min(c.maximumZ, (m.rate! - mean) / deviation),
              ) * reliability
            : 0;
        return {
          name: m.name,
          rate: m.rate ?? null,
          peerMean: peers.length ? mean : null,
          peerDeviation: peers.length ? deviation : null,
          peers: peers.length,
          reliability,
          adjustedZ: usable ? z : null,
          value: (z * m.weight * m.minutes) / 1000,
        };
      });
      const qualified =
        p.minutes >=
        (p.position === "G"
          ? c.qualifiedGoalieMinutes
          : c.qualifiedSkaterMinutes);
      const excess = components.reduce((sum, x) => sum + x.value, 0);
      return {
        playerId: p.playerId,
        name: p.name,
        team: p.team,
        position: p.position,
        games: p.games,
        minutes: p.minutes,
        status: missing.length
          ? "incomplete"
          : qualified
            ? "rated"
            : "provisional",
        missing,
        seasonRating: null,
        rank: null,
        impactPer60: missing.length
          ? null
          : round(
              Math.max(
                0,
                Math.min(100, 50 + (15 * excess) / (p.minutes / 1000)),
              ),
            ),
        seasonValue: missing.length
          ? null
          : round((c.referenceOffset * p.minutes) / 1000 + excess),
        components,
      };
    },
  );
  for (const position of ["F", "D", "G"] as const) {
    const pool = results.filter(
      (p) => p.position === position && p.status === "rated",
    );
    for (const p of pool) {
      const better = pool.filter((x) => x.seasonValue! > p.seasonValue!).length;
      const equal = pool.filter((x) => x.seasonValue === p.seasonValue).length;
      p.rank = better + 1;
      p.seasonRating =
        pool.length > 1
          ? round(
              (100 * (pool.length - better - (equal + 1) / 2)) /
                (pool.length - 1),
            )
          : 50;
    }
  }
  return results.sort(
    (a, b) =>
      a.position.localeCompare(b.position) ||
      (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
      (b.seasonValue ?? -Infinity) - (a.seasonValue ?? -Infinity) ||
      a.playerId - b.playerId,
  );
}
