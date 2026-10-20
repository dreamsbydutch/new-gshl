/** Offline prediction experiment; does not change the published NHL rating. */
export type AbilitySeasonRow = {
  playerId: number;
  position: "F" | "D" | "G";
  status: "rated" | "provisional" | "incomplete";
  minutes: number;
  seasonValue: number | null;
  abilityPer60: number | null;
  limitedSeason: boolean;
  revision?: string;
  componentCoverage: {
    officialMinutes: number;
    processMinutes: number;
    individualShots: number;
    missingGoals: number;
  };
  components: {
    adjustedProcess: number;
    finishing: number;
    penalties: number;
    saving: number;
  };
};

export type AbilitySeasonSnapshot = {
  seasons: Array<{ season: number; rows: AbilitySeasonRow[] }>;
};

const POSITIONS = ["F", "D", "G"] as const;
const COMPONENTS = [
  "adjustedProcess",
  "finishing",
  "penalties",
  "saving",
] as const;
type Component = (typeof COMPONENTS)[number];
const methods = [
  "storedAbility",
  "previousObserved",
  "priorThreeYearObserved",
  "componentPrior",
  "neutralZero",
] as const;
type Method = (typeof methods)[number];

/** Fixed before evaluation: no parameter choice uses the target season. */
export const NHL_ABILITY_EXPERIMENT = {
  priorMinutes: [0, 100, 300, 600, 1200, 2400, 4800],
  evaluationSeasons: [20232024, 20242025, 20252026],
  minimumTrainingPairs: 30,
  minimumCoverage: 0.95,
  maximumCoverage: 1.03,
  playerBootstrapReplicates: 2000,
} as const;

type Pair = {
  sourceSeason: number;
  targetSeason: number;
  origin: AbilitySeasonRow;
  target: AbilitySeasonRow;
};

const exposure = (p: AbilitySeasonRow) =>
  p.minutes * p.componentCoverage.officialMinutes;
const observedRate = (p: AbilitySeasonRow) =>
  (p.seasonValue! * 60) / exposure(p);
const componentRate = (p: AbilitySeasonRow, c: Component) =>
  (p.components[c] * 60) / exposure(p);
const relevantComponents = (position: AbilitySeasonRow["position"]) =>
  (position === "G"
    ? ["saving", "finishing", "penalties"]
    : ["adjustedProcess", "finishing", "penalties"]) as Component[];

function exclusion(p: AbilitySeasonRow): string | null {
  if (p.limitedSeason) return "limitedSeason";
  if (p.status !== "rated") return "notRated";
  if (
    !Number.isFinite(p.minutes) ||
    p.minutes <= 0 ||
    p.seasonValue === null ||
    !Number.isFinite(p.seasonValue) ||
    p.abilityPer60 === null ||
    !Number.isFinite(p.abilityPer60) ||
    relevantComponents(p.position).some(
      (c) => !Number.isFinite(p.components[c]),
    )
  )
    return "invalidValue";
  const c = p.componentCoverage;
  const required = [c.officialMinutes, c.individualShots];
  if (p.position !== "G") required.push(c.processMinutes);
  if (
    c.missingGoals !== 0 ||
    required.some(
      (v) =>
        !Number.isFinite(v) ||
        v < NHL_ABILITY_EXPERIMENT.minimumCoverage ||
        v > NHL_ABILITY_EXPERIMENT.maximumCoverage,
    )
  )
    return "inadequateCoverage";
  return null;
}

function metrics(
  rows: Array<{ target: number; prediction: number; weight: number }>,
) {
  const minutes = rows.reduce((sum, r) => sum + r.weight, 0);
  if (!minutes)
    return {
      players: rows.length,
      minutes,
      mse: null,
      rmse: null,
      bias: null,
      unweightedMse: null,
      unweightedRmse: null,
      unweightedBias: null,
    };
  const mse =
    rows.reduce(
      (sum, r) => sum + r.weight * (r.prediction - r.target) ** 2,
      0,
    ) / minutes;
  const unweightedMse =
    rows.reduce((sum, r) => sum + (r.prediction - r.target) ** 2, 0) /
    rows.length;
  return {
    players: rows.length,
    minutes,
    mse,
    rmse: Math.sqrt(mse),
    bias:
      rows.reduce((sum, r) => sum + r.weight * (r.prediction - r.target), 0) /
      minutes,
    unweightedMse,
    unweightedRmse: Math.sqrt(unweightedMse),
    unweightedBias:
      rows.reduce((sum, r) => sum + r.prediction - r.target, 0) / rows.length,
  };
}

export function experimentNhlAbility(
  snapshot: AbilitySeasonSnapshot,
  evaluationSeasons: readonly number[] = NHL_ABILITY_EXPERIMENT.evaluationSeasons,
) {
  const seasons = [...snapshot.seasons].sort((a, b) => a.season - b.season);
  const seenSeasons = new Set<number>();
  const indexed = new Map<number, Map<number, AbilitySeasonRow>>();
  const qualification = seasons.map((s) => {
    if (
      seenSeasons.has(s.season) ||
      !Number.isInteger(s.season) ||
      Math.floor(s.season / 10000) + 1 !== s.season % 10000
    )
      throw new Error("Invalid or duplicate experiment season");
    seenSeasons.add(s.season);
    const eligible = new Map<number, AbilitySeasonRow>();
    const identities = new Set<number>();
    const excluded: Record<string, number> = {};
    const revisions: Record<string, number> = {};
    for (const p of s.rows) {
      if (
        identities.has(p.playerId) ||
        !Number.isInteger(p.playerId) ||
        p.playerId <= 0 ||
        !POSITIONS.includes(p.position)
      )
        throw new Error("Invalid or duplicate experiment player");
      identities.add(p.playerId);
      const revision = p.revision ?? "unrecorded";
      revisions[revision] = (revisions[revision] ?? 0) + 1;
      const reason = exclusion(p);
      if (reason) excluded[reason] = (excluded[reason] ?? 0) + 1;
      else eligible.set(p.playerId, p);
    }
    indexed.set(s.season, eligible);
    return {
      season: s.season,
      sourceRows: s.rows.length,
      qualified: eligible.size,
      excluded,
      revisions,
    };
  });
  const pairs: Pair[] = [];
  for (const target of seasons) {
    const sourceSeason = target.season - 10001;
    for (const origin of indexed.get(sourceSeason)?.values() ?? []) {
      const next = indexed.get(target.season)?.get(origin.playerId);
      if (next && next.position === origin.position)
        pairs.push({
          sourceSeason,
          targetSeason: target.season,
          origin,
          target: next,
        });
    }
  }
  const predictions: Array<{
    playerId: number;
    position: AbilitySeasonRow["position"];
    targetSeason: number;
    targetRate: number;
    targetMinutes: number;
    predictions: Record<Method, number>;
  }> = [];
  const folds = evaluationSeasons.map((targetSeason) => {
    if (!indexed.has(targetSeason) || !indexed.has(targetSeason - 10001))
      throw new Error("Evaluation requires both adjacent seasons");
    const training = pairs.filter((p) => p.targetSeason < targetSeason);
    const evaluation = pairs.filter((p) => p.targetSeason === targetSeason);
    const calibration = POSITIONS.map((position) => {
      const pool = training.filter((p) => p.origin.position === position);
      const components = relevantComponents(position).map((component) => {
        const candidates = NHL_ABILITY_EXPERIMENT.priorMinutes.map((prior) => ({
          prior,
          ...metrics(
            pool.map((p) => ({
              target: componentRate(p.target, component),
              prediction:
                (componentRate(p.origin, component) * exposure(p.origin)) /
                (exposure(p.origin) + prior),
              weight: exposure(p.target),
            })),
          ),
        }));
        const best = [...candidates].sort(
          (a, b) => a.mse! - b.mse! || a.prior - b.prior,
        )[0]!;
        return { component, prior: best.prior, candidates };
      });
      return {
        position,
        trainingPairs: pool.length,
        supported: pool.length >= NHL_ABILITY_EXPERIMENT.minimumTrainingPairs,
        components,
      };
    });
    const unsupportedPositions = calibration
      .filter((c) => !c.supported)
      .map((c) => c.position);
    for (const pair of evaluation) {
      const selected = calibration.find(
        (c) => c.position === pair.origin.position,
      )!;
      if (!selected.supported) continue;
      let historyMinutes = 0;
      let historyValue = 0;
      for (let offset = 1; offset <= 3; offset++) {
        const historical = indexed
          .get(targetSeason - offset * 10001)
          ?.get(pair.origin.playerId);
        if (historical?.position === pair.origin.position) {
          historyMinutes += exposure(historical);
          historyValue += historical.seasonValue!;
        }
      }
      const candidate = selected.components.reduce(
        (sum, c) =>
          sum +
          (componentRate(pair.origin, c.component) * exposure(pair.origin)) /
            (exposure(pair.origin) + c.prior),
        0,
      );
      predictions.push({
        playerId: pair.origin.playerId,
        position: pair.origin.position,
        targetSeason,
        targetRate: observedRate(pair.target),
        targetMinutes: exposure(pair.target),
        predictions: {
          storedAbility: pair.origin.abilityPer60!,
          previousObserved: observedRate(pair.origin),
          priorThreeYearObserved: (60 * historyValue) / historyMinutes,
          componentPrior: candidate,
          neutralZero: 0,
        },
      });
    }
    const origins = indexed.get(targetSeason - 10001)!;
    const targetAll = new Map(
      seasons
        .find((s) => s.season === targetSeason)!
        .rows.map((p) => [p.playerId, p]),
    );
    const attrition: Record<string, number> = {};
    for (const origin of origins.values()) {
      const next = targetAll.get(origin.playerId);
      const reason = !next
        ? "absentNextSeason"
        : next.position !== origin.position
          ? "positionChanged"
          : (exclusion(next) ?? "paired");
      attrition[reason] = (attrition[reason] ?? 0) + 1;
    }
    return {
      targetSeason,
      trainingOutcomeSeasons: [...new Set(training.map((p) => p.targetSeason))],
      calibration,
      qualifiedOrigins: origins.size,
      pairedPlayers: evaluation.length,
      attrition,
      unsupportedPositions,
    };
  });
  const summarize = (rows: typeof predictions) =>
    Object.fromEntries(
      methods.map((method) => [
        method,
        metrics(
          rows.map((p) => ({
            target: p.targetRate,
            prediction: p.predictions[method],
            weight: p.targetMinutes,
          })),
        ),
      ]),
    );
  const pairedIntervals = (
    rows: typeof predictions,
    baseline: "storedAbility" | "priorThreeYearObserved",
  ) => {
    const clusters = new Map<
      number,
      {
        minutes: number;
        observations: number;
        weighted: number[];
        unweighted: number[];
      }
    >();
    for (const p of rows) {
      const cluster = clusters.get(p.playerId) ?? {
        minutes: 0,
        observations: 0,
        weighted: methods.map(() => 0),
        unweighted: methods.map(() => 0),
      };
      cluster.minutes += p.targetMinutes;
      cluster.observations++;
      const baselineError = (p.predictions[baseline] - p.targetRate) ** 2;
      methods.forEach((method, index) => {
        const delta =
          (p.predictions[method] - p.targetRate) ** 2 - baselineError;
        cluster.weighted[index]! += p.targetMinutes * delta;
        cluster.unweighted[index]! += delta;
      });
      clusters.set(p.playerId, cluster);
    }
    const blocks = [...clusters.values()];
    const samples = methods.map(() => ({
      weighted: [] as number[],
      unweighted: [] as number[],
    }));
    let seed = 14731;
    const random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    if (blocks.length)
      for (
        let replicate = 0;
        replicate < NHL_ABILITY_EXPERIMENT.playerBootstrapReplicates;
        replicate++
      ) {
        let minutes = 0;
        let observations = 0;
        const weighted = methods.map(() => 0);
        const unweighted = methods.map(() => 0);
        for (let i = 0; i < blocks.length; i++) {
          const selected = blocks[Math.floor(random() * blocks.length)]!;
          minutes += selected.minutes;
          observations += selected.observations;
          methods.forEach((_, index) => {
            weighted[index]! += selected.weighted[index]!;
            unweighted[index]! += selected.unweighted[index]!;
          });
        }
        methods.forEach((_, index) => {
          samples[index]!.weighted.push(weighted[index]! / minutes);
          samples[index]!.unweighted.push(unweighted[index]! / observations);
        });
      }
    const interval = (values: number[]) => {
      if (!values.length) return null;
      values.sort((a, b) => a - b);
      return {
        low: values[Math.floor((values.length - 1) * 0.025)]!,
        high: values[Math.floor((values.length - 1) * 0.975)]!,
      };
    };
    return {
      baseline,
      playerClusters: blocks.length,
      interpretation:
        "95% paired player-cluster bootstrap range for MSE(candidate)-MSE(baseline); negative favors candidate. All test years for a player stay together. Fixed predictions; team and shared season dependence and model-selection uncertainty are not represented.",
      comparisons: methods.map((method, index) => ({
        method,
        weightedMseDifference: interval(samples[index]!.weighted),
        unweightedMseDifference: interval(samples[index]!.unweighted),
      })),
    };
  };
  return {
    config: NHL_ABILITY_EXPERIMENT,
    evaluationSeasons: [...evaluationSeasons],
    interpretation:
      "Paired returning rated players only; observed next-season contribution rate is a model-derived target, not causal truth. Target minutes weight retrospective errors and never enter predictions. Earlier evaluation seasons can train later rolling origins. Existing stored ability is a comparator with inherited historical calibration, not a newly time-fitted baseline. Process priors additionally shrink ridge estimates; this is an experiment, not validated production policy.",
    qualification,
    folds,
    overall: summarize(predictions),
    pairedDiagnostics: [
      pairedIntervals(predictions, "storedAbility"),
      pairedIntervals(predictions, "priorThreeYearObserved"),
    ],
    byPosition: POSITIONS.map((position) => ({
      position,
      metrics: summarize(predictions.filter((p) => p.position === position)),
      pairedDiagnostics: [
        pairedIntervals(
          predictions.filter((p) => p.position === position),
          "storedAbility",
        ),
        pairedIntervals(
          predictions.filter((p) => p.position === position),
          "priorThreeYearObserved",
        ),
      ],
    })),
    bySeason: evaluationSeasons.map((season) => ({
      season,
      metrics: summarize(predictions.filter((p) => p.targetSeason === season)),
    })),
    predictions,
  };
}
