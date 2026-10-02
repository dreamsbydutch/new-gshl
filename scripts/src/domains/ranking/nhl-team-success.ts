import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import {
  correlation,
  spearman,
  ranks,
  quantile,
} from "./nhl-rating-diagnostics";

export type TeamResult = {
  season: number;
  teamId: number;
  name: string;
  games: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  regulationWins: number;
  goalsFor: number;
  goalsAgainst: number;
  playoffGames: number;
  playoffWins: number;
  playoffLosses: number;
};
export type TeamContribution = {
  season: number;
  teamId: number;
  playerId: number;
  name: string;
  position: "F" | "D" | "G";
  status: GameSeasonRating["status"];
  minutes: number;
  games: number;
  fraction: number;
  value: number;
  ability: number | null;
  process: number;
  offense: number;
  defense: number;
  finishing: number;
  penalties: number;
  saving: number;
};
export type SeriesResult = {
  season: number;
  round: number;
  top: number;
  bottom: number;
  winner: number;
};

/** Allocation of a season estimate, not an assertion of measured stint-specific value. */
export function allocateTeamValue(
  season: number,
  teamId: number,
  player: GameSeasonRating,
  minutes: number,
  games: number,
  offense: number,
  defense: number,
): TeamContribution {
  if (
    ![minutes, games, player.minutes, offense, defense].every(
      Number.isFinite,
    ) ||
    minutes < 0 ||
    player.minutes <= 0 ||
    minutes > player.minutes + 1 / 60 ||
    games < 0 ||
    !Number.isInteger(games) ||
    player.seasonValue === null
  )
    throw new Error(`Invalid team allocation for ${season}/${player.playerId}`);
  const fraction = minutes / player.minutes;
  return {
    season,
    teamId,
    playerId: player.playerId,
    name: player.name,
    position: player.position,
    status: player.status,
    minutes,
    games,
    fraction,
    value: player.seasonValue * fraction,
    ability:
      player.abilityPer60 === null
        ? null
        : (player.abilityPer60 * minutes) / 60,
    process: player.components.adjustedProcess * fraction,
    offense: offense * fraction,
    defense: defense * fraction,
    finishing: player.components.finishing * fraction,
    penalties: player.components.penalties * fraction,
    saving: player.components.saving * fraction,
  };
}

export function aggregateTeamValue(team: TeamResult, rows: TeamContribution[]) {
  if (
    team.wins + team.losses + team.otLosses !== team.games ||
    team.points !== 2 * team.wins + team.otLosses
  )
    throw new Error("Team record does not reconcile");
  if (
    !(team.games > 0) ||
    rows.some((r) => r.season !== team.season || r.teamId !== team.teamId)
  )
    throw new Error("Team scope mismatch or empty schedule");
  if (new Set(rows.map((r) => r.playerId)).size !== rows.length)
    throw new Error("Duplicate team-player allocation");
  const sum = (
    metric:
      | "value"
      | "ability"
      | "process"
      | "offense"
      | "defense"
      | "finishing"
      | "penalties"
      | "saving",
  ) => rows.reduce((n, r) => n + (r[metric] ?? 0), 0) / team.games;
  const minutes = rows.reduce((n, r) => n + r.minutes, 0);
  return {
    ...team,
    players: rows.length,
    minutes,
    provisionalMinuteShare: minutes
      ? rows
          .filter((r) => r.status !== "rated")
          .reduce((n, r) => n + r.minutes, 0) / minutes
      : 0,
    rating: sum("value"),
    ability: rows.some((r) => r.ability === null && r.minutes > 0)
      ? null
      : sum("ability"),
    process: sum("process"),
    offense: sum("offense"),
    defense: sum("defense"),
    finishing: sum("finishing"),
    penalties: sum("penalties"),
    saving: sum("saving"),
    skaterValue:
      rows.filter((r) => r.position !== "G").reduce((n, r) => n + r.value, 0) /
      team.games,
    goalieValue:
      rows.filter((r) => r.position === "G").reduce((n, r) => n + r.value, 0) /
      team.games,
    winPct: team.wins / team.games,
    lossPct: (team.losses + team.otLosses) / team.games,
    pointsPct: team.points / (2 * team.games),
    regulationWinPct: team.regulationWins / team.games,
    goalDifference: (team.goalsFor - team.goalsAgainst) / team.games,
    scoringRate: team.goalsFor / team.games,
    preventionRate: -team.goalsAgainst / team.games,
    playoffEntry: Number(team.playoffGames > 0),
    playoffWinPct: team.playoffGames
      ? team.playoffWins / team.playoffGames
      : null,
  };
}
export type TeamRating = ReturnType<typeof aggregateTeamValue> & {
  performance: number | null;
};

export function association(x: number[], y: number[]) {
  return { n: x.length, pearson: correlation(x, y), spearman: spearman(x, y) };
}

/** Symmetric one-feature logistic model, fit only to earlier-season series. */
export function fitSeriesProbability(
  rows: { difference: number; won: boolean }[],
) {
  if (!rows.length) throw new Error("No training series");
  const scale =
    Math.sqrt(
      rows.reduce((n, r) => n + r.difference * r.difference, 0) / rows.length,
    ) || 1;
  let beta = 0;
  for (let i = 0; i < 40; i++) {
    let gradient = -beta,
      curvature = 1; // fixed ridge prior, not selected on test results
    for (const r of rows) {
      const x = r.difference / scale,
        p = 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, beta * x))));
      gradient += x * (Number(r.won) - p);
      curvature += x * x * p * (1 - p);
    }
    const step = gradient / curvature;
    beta += step;
    if (Math.abs(step) < 1e-9) break;
  }
  return (difference: number) =>
    1 /
    (1 + Math.exp(-Math.max(-35, Math.min(35, (beta * difference) / scale))));
}

export function withinSeasonAssociation(
  rows: { season: number; x: number; y: number }[],
) {
  const x: number[] = [],
    y: number[] = [],
    rx: number[] = [],
    ry: number[] = [];
  for (const season of new Set(rows.map((r) => r.season))) {
    const group = rows.filter((r) => r.season === season);
    if (group.length < 2) continue;
    const meanX = group.reduce((n, r) => n + r.x, 0) / group.length,
      meanY = group.reduce((n, r) => n + r.y, 0) / group.length;
    x.push(...group.map((r) => r.x - meanX));
    y.push(...group.map((r) => r.y - meanY));
    rx.push(
      ...ranks(group.map((r) => r.x)).map(
        (v) => (v - 1) / (group.length - 1) - 0.5,
      ),
    );
    ry.push(
      ...ranks(group.map((r) => r.y)).map(
        (v) => (v - 1) / (group.length - 1) - 0.5,
      ),
    );
  }
  return {
    n: x.length,
    pearson: correlation(x, y),
    spearman: correlation(rx, ry),
  };
}

export function seasonBootstrap(
  rows: { season: number; x: number; y: number }[],
  replicates = 1000,
) {
  const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b);
  if (seasons.length < 3) return null;
  let state = 48271;
  const random = () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const estimates: number[] = [];
  for (let i = 0; i < replicates; i++) {
    const sample = seasons.flatMap((_, j) => {
      const selected = seasons[Math.floor(random() * seasons.length)];
      return rows
        .filter((r) => r.season === selected)
        .map((r) => ({ ...r, season: j }));
    });
    const result = withinSeasonAssociation(sample).pearson;
    if (result !== null) estimates.push(result);
  }
  return {
    low: quantile(estimates, 0.025),
    high: quantile(estimates, 0.975),
    replicates,
    seasons: seasons.length,
  };
}

export type SeriesPair = {
  season: number;
  round: number;
  difference: number;
  won: boolean;
};
export function seriesBacktest(rows: SeriesPair[], minimumTrainingSeasons = 3) {
  const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => a - b);
  const predictions: Array<
    SeriesPair & { probability: number; trainingSeasons: number }
  > = [];
  for (const season of seasons) {
    const train = rows.filter((r) => r.season < season);
    const count = new Set(train.map((r) => r.season)).size;
    if (count < minimumTrainingSeasons) continue;
    const predict = fitSeriesProbability(train);
    for (const r of rows.filter((r) => r.season === season))
      predictions.push({
        ...r,
        probability: predict(r.difference),
        trainingSeasons: count,
      });
  }
  const n = predictions.length;
  return {
    n,
    accuracy: n
      ? predictions.reduce(
          (sum, r) =>
            sum +
            (r.probability === 0.5
              ? 0.5
              : Number(r.probability > 0.5 === r.won)),
          0,
        ) / n
      : null,
    brier: n
      ? predictions.reduce(
          (sum, r) => sum + (r.probability - Number(r.won)) ** 2,
          0,
        ) / n
      : null,
    logLoss: n
      ? -predictions.reduce(
          (sum, r) => sum + Math.log(r.won ? r.probability : 1 - r.probability),
          0,
        ) / n
      : null,
    predictions,
  };
}

export function pairedSeriesBootstrap(
  a: ReturnType<typeof seriesBacktest>["predictions"],
  b: ReturnType<typeof seriesBacktest>["predictions"],
  replicates = 1000,
) {
  if (
    a.length !== b.length ||
    a.some(
      (r, i) =>
        r.season !== b[i]!.season ||
        r.round !== b[i]!.round ||
        r.won !== b[i]!.won,
    )
  )
    throw new Error("Unpaired forecasts");
  const seasons = [...new Set(a.map((r) => r.season))];
  if (seasons.length < 3) return null;
  let state = 139;
  const random = () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const deltas: number[] = [];
  for (let i = 0; i < replicates; i++) {
    const selected = seasons.flatMap(() => {
      const season = seasons[Math.floor(random() * seasons.length)];
      return a.flatMap((r, j) => (r.season === season ? [j] : []));
    });
    deltas.push(
      selected.reduce(
        (sum, j) =>
          sum +
          (a[j]!.probability - Number(a[j]!.won)) ** 2 -
          (b[j]!.probability - Number(b[j]!.won)) ** 2,
        0,
      ) / selected.length,
    );
  }
  return {
    low: quantile(deltas, 0.025),
    high: quantile(deltas, 0.975),
    interpretation: "Candidate minus baseline Brier; negative favors candidate",
    seasons: seasons.length,
    replicates,
  };
}

/** Two predeclared signals; symmetric ridge logistic calibration on prior seasons only. */
export function incrementalSeriesBacktest(
  rows: (SeriesPair & { baseline: number })[],
) {
  const predictions: ReturnType<typeof seriesBacktest>["predictions"] = [];
  for (const season of [...new Set(rows.map((r) => r.season))].sort(
    (a, b) => a - b,
  )) {
    const train = rows.filter((r) => r.season < season),
      count = new Set(train.map((r) => r.season)).size;
    if (count < 3) continue;
    const s0 =
      Math.sqrt(
        train.reduce((n, r) => n + r.baseline ** 2, 0) / train.length,
      ) || 1;
    const s1 =
      Math.sqrt(
        train.reduce((n, r) => n + r.difference ** 2, 0) / train.length,
      ) || 1;
    let b0 = 0,
      b1 = 0;
    for (let i = 0; i < 40; i++) {
      let g0 = -b0,
        g1 = -b1,
        h00 = 1,
        h01 = 0,
        h11 = 1;
      for (const r of train) {
        const x = r.baseline / s0,
          y = r.difference / s1,
          p = 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, b0 * x + b1 * y)))),
          v = p * (1 - p);
        g0 += x * (Number(r.won) - p);
        g1 += y * (Number(r.won) - p);
        h00 += v * x * x;
        h01 += v * x * y;
        h11 += v * y * y;
      }
      const det = h00 * h11 - h01 * h01,
        d0 = (h11 * g0 - h01 * g1) / det,
        d1 = (h00 * g1 - h01 * g0) / det;
      b0 += d0;
      b1 += d1;
      if (Math.abs(d0) + Math.abs(d1) < 1e-9) break;
    }
    for (const r of rows.filter((r) => r.season === season))
      predictions.push({
        ...r,
        trainingSeasons: count,
        probability:
          1 /
          (1 +
            Math.exp(
              -Math.max(
                -35,
                Math.min(35, (b0 * r.baseline) / s0 + (b1 * r.difference) / s1),
              ),
            )),
      });
  }
  const n = predictions.length;
  return {
    n,
    accuracy: n
      ? predictions.reduce(
          (sum, r) =>
            sum +
            (r.probability === 0.5
              ? 0.5
              : Number(r.probability > 0.5 === r.won)),
          0,
        ) / n
      : null,
    brier: n
      ? predictions.reduce(
          (sum, r) => sum + (r.probability - Number(r.won)) ** 2,
          0,
        ) / n
      : null,
    logLoss: n
      ? -predictions.reduce(
          (sum, r) => sum + Math.log(r.won ? r.probability : 1 - r.probability),
          0,
        ) / n
      : null,
    predictions,
  };
}

export function analyzeTeamSuccess(
  teams: TeamRating[],
  series: SeriesResult[],
  provisionalSeasons: number[],
) {
  const seasons = [...new Set(teams.map((t) => t.season))].sort(
    (a, b) => a - b,
  );
  const incompletePostseasons = seasons.filter(
    (season) =>
      series.filter((s) => s.season === season && s.round === 4).length !== 1,
  );
  const rows = teams.map((t) => {
    const seasonTeams = teams.filter((p) => p.season === t.season),
      index = seasonTeams.indexOf(t);
    return {
      ...t,
      seasonQualified: !provisionalSeasons.includes(t.season),
      postseasonComplete: !incompletePostseasons.includes(t.season),
      defenseAndSaving: t.defense + t.saving,
      offenseAndFinishing: t.offense + t.finishing,
      ratingRank: ranks(seasonTeams.map((p) => p.rating))[index]!,
      pointsRank: ranks(seasonTeams.map((p) => p.pointsPct))[index]!,
      seriesWins: series.filter(
        (s) => s.season === t.season && s.winner === t.teamId,
      ).length,
      champion: Number(
        series.some(
          (s) =>
            s.season === t.season && s.round === 4 && s.winner === t.teamId,
        ),
      ),
    };
  });
  const metrics = [
    "rating",
    "ability",
    "performance",
    "process",
    "skaterValue",
    "goalieValue",
    "offense",
    "defense",
    "defenseAndSaving",
    "offenseAndFinishing",
    "finishing",
    "saving",
  ] as const;
  const regularOutcomes = [
    "winPct",
    "lossPct",
    "pointsPct",
    "regulationWinPct",
    "goalDifference",
    "scoringRate",
    "preventionRate",
  ] as const;
  const playoffOutcomes = [
    "playoffWins",
    "playoffWinPct",
    "seriesWins",
  ] as const;
  type Row = (typeof rows)[number];
  const pairs = (pool: Row[], metric: keyof Row, outcome: keyof Row) =>
    pool.flatMap((r) =>
      typeof r[metric] === "number" && typeof r[outcome] === "number"
        ? [{ season: r.season, x: Number(r[metric]), y: Number(r[outcome]) }]
        : [],
    );
  const primary = rows.filter((t) => !provisionalSeasons.includes(t.season));
  const regular = metrics.flatMap((metric) =>
    regularOutcomes.map((outcome) => ({
      metric,
      outcome,
      ...withinSeasonAssociation(pairs(primary, metric, outcome)),
    })),
  );
  const perSeason = seasons.map((season) => ({
    season,
    provisional: provisionalSeasons.includes(season),
    teams: rows.filter((t) => t.season === season).length,
    ...association(
      rows.filter((t) => t.season === season).map((t) => t.rating),
      rows.filter((t) => t.season === season).map((t) => t.pointsPct),
    ),
  }));
  const postseason = primary.filter(
    (t) => t.playoffEntry && !incompletePostseasons.includes(t.season),
  );
  const playoffs = (
    [...metrics, "pointsPct", "goalDifference"] as const
  ).flatMap((metric) =>
    playoffOutcomes.map((outcome) => ({
      metric,
      outcome,
      ...withinSeasonAssociation(pairs(postseason, metric, outcome)),
    })),
  );
  const appearance = association(
    primary.map((t) => t.rating),
    primary.map((t) => t.playoffEntry),
  );
  const cohorts = [
    { name: "all-seasons-including-provisional", pool: rows },
    { name: "qualified-seasons", pool: primary },
    {
      name: "exclude-pandemic-seasons",
      pool: primary.filter((t) => ![20192020, 20202021].includes(t.season)),
    },
    {
      name: "last-three-seasons",
      pool: primary.filter((t) => seasons.slice(-3).includes(t.season)),
    },
  ].map(({ name, pool }) => ({
    name,
    ...withinSeasonAssociation(pairs(pool, "rating", "pointsPct")),
  }));
  const byId = new Map(rows.map((r) => [`${r.season}/${r.teamId}`, r]));
  const validSeries = series.filter(
    (s) =>
      !provisionalSeasons.includes(s.season) &&
      !incompletePostseasons.includes(s.season),
  );
  const seriesMetrics = [
    "rating",
    "ability",
    "performance",
    "pointsPct",
    "goalDifference",
  ] as const;
  const comparisons = seriesMetrics.map((metric) => {
    const pairs = validSeries.flatMap((s) => {
      const a = byId.get(`${s.season}/${s.top}`),
        b = byId.get(`${s.season}/${s.bottom}`);
      if (!a || !b || ![s.top, s.bottom].includes(s.winner))
        throw new Error("Unmatched playoff bracket");
      if (a[metric] === null || b[metric] === null) return [];
      return [
        {
          season: s.season,
          round: s.round,
          difference: a[metric]! - b[metric]!,
          won: s.winner === s.top,
          baseline: a.pointsPct - b.pointsPct,
        },
      ];
    });
    const accuracy = (pool: SeriesPair[]) =>
      pool.length
        ? pool.reduce(
            (n, r) =>
              n +
              (r.difference === 0 ? 0.5 : Number(r.difference > 0 === r.won)),
            0,
          ) / pool.length
        : null;
    const matchedPointsBaseline = seriesBacktest(
      pairs.map((r) => ({ ...r, difference: r.baseline })),
    );
    const backtest = seriesBacktest(pairs);
    return {
      metric,
      n: pairs.length,
      higherRatedAccuracy: accuracy(pairs),
      firstRoundAccuracy: accuracy(pairs.filter((p) => p.round === 1)),
      backtest,
      matchedPointsBaseline,
      versusMatchedPointsInterval: pairedSeriesBootstrap(
        backtest.predictions,
        matchedPointsBaseline.predictions,
      ),
      incremental:
        metric === "rating" ? incrementalSeriesBacktest(pairs) : null,
    };
  });
  const rating = comparisons.find((r) => r.metric === "rating")!,
    baseline = comparisons.find((r) => r.metric === "pointsPct")!;
  return {
    rows,
    primarySeasons: seasons.filter((s) => !provisionalSeasons.includes(s)),
    provisionalSeasons,
    incompletePostseasons,
    regular,
    perSeason,
    playoffs,
    appearance,
    cohorts,
    pointsCorrelationInterval: seasonBootstrap(
      pairs(primary, "rating", "pointsPct"),
    ),
    playoffWinsCorrelationInterval: seasonBootstrap(
      pairs(postseason, "rating", "playoffWins"),
    ),
    comparisons,
    ratingVersusPointsBrierInterval: pairedSeriesBootstrap(
      rating.backtest.predictions,
      baseline.backtest.predictions,
    ),
    incrementalVersusPointsBrierInterval: pairedSeriesBootstrap(
      rating.incremental!.predictions,
      baseline.backtest.predictions,
    ),
    higherSeedAccuracy: validSeries.length
      ? validSeries.filter((s) => s.winner === s.top).length /
        validSeries.length
      : null,
    champions: rows.filter((t) => t.champion),
    outliers: [...rows]
      .sort(
        (a, b) =>
          Math.abs(b.ratingRank - b.pointsRank) -
          Math.abs(a.ratingRank - a.pointsRank),
      )
      .slice(0, 20),
  };
}
