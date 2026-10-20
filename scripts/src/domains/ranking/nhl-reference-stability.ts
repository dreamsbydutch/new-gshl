import type { AbilitySeasonRow } from "./nhl-ability-experiment";

type Position = "F" | "D" | "G";
type Component = "finishing" | "penalties" | "saving";
type Row = AbilitySeasonRow & { name?: string };
type Snapshot = { seasons: Array<{ season: number; rows: Row[] }> };
const positions = ["F", "D", "G"] as const;
const components = ["finishing", "penalties", "saving"] as const;
const policies = {
  narrower: { F: 12, D: 6, G: 1.5 },
  default: { F: 13, D: 7, G: 2 },
  wider: { F: 14, D: 8, G: 2.5 },
} as const;
const methods = [
  "previousAvailable",
  "trailing3",
  "trailing5",
  "expanding",
  "neutralZero",
] as const;
type Method = (typeof methods)[number];

/** Fixed before reading this experiment's annual-reference outcomes. */
export const NHL_REFERENCE_STABILITY_CONFIG = {
  version: "nhl-reference-stability-experiment-v2-contrast",
  policies,
  minimumReferencePlayers: 5,
  minimumPriorSeasons: 3,
  minimumWindowSelectionOutcomes: 3,
  developmentThrough: 20222023,
  exploratoryFrom: 20232024,
  contrastHypothesis:
    "Added after inspecting uncentered results; prior method grid unchanged; contrast outputs are exploratory",
  primarySeries: [
    "F:finishing",
    "F:penalties",
    "D:finishing",
    "D:penalties",
    "G:saving",
  ],
  qualification:
    "rated or low-minute provisional; 95%-103% relevant component coverage; no missing goals; no limited seasons; goalie saving ability must be known",
  prospectiveCriterion: {
    minimumAdditionalUntouchedSeasons: 3,
    maximumPrimaryPooledWeightedMseRatioToPrevious: 0.9,
    maximumIndividualPrimaryWeightedMseRatio: 1.05,
    goalieSavingMustImproveAtEveryFixedDepth: true,
    pairedSeasonBootstrapUpperMseDifferenceMustBeBelowZero: true,
  },
} as const;

const officialMinutes = (p: Row) =>
  p.minutes * p.componentCoverage.officialMinutes;
function rejection(p: Row): string | null {
  if (p.limitedSeason) return "limitedSeason";
  if (p.status === "incomplete") return "incomplete";
  if (
    p.status === "provisional" &&
    officialMinutes(p) >= (p.position === "G" ? 300 : 200)
  )
    return "provisionalBeyondLowMinutes";
  if (
    !Number.isFinite(officialMinutes(p)) ||
    officialMinutes(p) <= 0 ||
    components.some((c) => !Number.isFinite(p.components[c]))
  )
    return "invalidValue";
  const coverage = [
    p.componentCoverage.officialMinutes,
    p.componentCoverage.individualShots,
  ];
  if (p.position !== "G") coverage.push(p.componentCoverage.processMinutes);
  if (
    p.componentCoverage.missingGoals !== 0 ||
    coverage.some((v) => !Number.isFinite(v) || v < 0.95 || v > 1.03)
  )
    return "inadequateCoverage";
  if (
    p.position === "G" &&
    (p.abilityPer60 === null || !Number.isFinite(p.abilityPer60))
  )
    return "unknownSaving";
  return null;
}

function summarize(
  rows: Array<{ prediction: number; actual: number; weight: number }>,
) {
  if (!rows.length)
    return {
      seasons: 0,
      weightedMse: null,
      mse: null,
      bias: null,
      weightedBias: null,
    };
  const minutes = rows.reduce((sum, p) => sum + p.weight, 0);
  return {
    seasons: rows.length,
    weightedMse:
      rows.reduce(
        (sum, p) => sum + p.weight * (p.prediction - p.actual) ** 2,
        0,
      ) / minutes,
    mse:
      rows.reduce((sum, p) => sum + (p.prediction - p.actual) ** 2, 0) /
      rows.length,
    bias:
      rows.reduce((sum, p) => sum + p.prediction - p.actual, 0) / rows.length,
    weightedBias:
      rows.reduce((sum, p) => sum + p.weight * (p.prediction - p.actual), 0) /
      minutes,
  };
}

/** Total-TOI cohort proxy: historical EV family exposures and coefficient anchors are unavailable. */
export function experimentNhlReferenceStability(
  snapshot: Snapshot,
  teamsBySeason: Readonly<Record<number, number>>,
) {
  const seasons = [...snapshot.seasons].sort((a, b) => a.season - b.season);
  const seen = new Set<number>();
  for (const s of seasons) {
    if (
      !Number.isInteger(s.season) ||
      Math.floor(s.season / 10000) + 1 !== s.season % 10000 ||
      seen.has(s.season)
    )
      throw new Error("Invalid or duplicate reference season");
    seen.add(s.season);
    if (
      !Number.isInteger(teamsBySeason[s.season]) ||
      teamsBySeason[s.season]! <= 0
    )
      throw new Error("Verified team count required for every season");
    const ids = new Set<number>();
    for (const p of s.rows) {
      if (
        !Number.isInteger(p.playerId) ||
        p.playerId <= 0 ||
        ids.has(p.playerId) ||
        !positions.includes(p.position) ||
        !["rated", "provisional", "incomplete"].includes(p.status) ||
        !Number.isFinite(p.minutes) ||
        p.minutes <= 0
      )
        throw new Error(
          "Invalid/duplicate player or unknown canonical depth exposure",
        );
      ids.add(p.playerId);
    }
  }
  const annual = seasons.flatMap((s) =>
    Object.entries(policies).flatMap(([policy, depth]) =>
      positions.map((position) => {
        const population = s.rows
          .filter((p) => p.position === position)
          .sort((a, b) => b.minutes - a.minutes || a.playerId - b.playerId);
        const regularPlayers = Math.ceil(
          teamsBySeason[s.season]! * depth[position],
        );
        const cutoff =
          population[Math.min(population.length, regularPlayers) - 1]
            ?.minutes ?? null;
        const depthPool =
          cutoff === null ? [] : population.filter((p) => p.minutes < cutoff);
        const seasonLimited = s.rows.some((p) => p.limitedSeason);
        const exclusions: Array<{ playerId: number; reason: string }> = [];
        const pool = depthPool.filter((p) => {
          const reason = seasonLimited ? "limitedSeason" : rejection(p);
          if (reason) exclusions.push({ playerId: p.playerId, reason });
          return !reason;
        });
        const minutes = pool.reduce((sum, p) => sum + officialMinutes(p), 0);
        const supported =
          pool.length >=
            NHL_REFERENCE_STABILITY_CONFIG.minimumReferencePlayers &&
          minutes > 0;
        const totals = Object.fromEntries(
          components.map((c) => [
            c,
            pool.reduce((sum, p) => sum + p.components[c], 0),
          ]),
        ) as Record<Component, number>;
        const rates = Object.fromEntries(
          components.map((c) => [
            c,
            supported ? (totals[c] * 60) / minutes : null,
          ]),
        ) as Record<Component, number | null>;
        const leaguePool = seasonLimited
          ? []
          : population.filter((p) => rejection(p) === null);
        const leagueMinutes = leaguePool.reduce(
          (sum, p) => sum + officialMinutes(p),
          0,
        );
        const leagueRates = Object.fromEntries(
          components.map((c) => [
            c,
            leagueMinutes > 0
              ? (60 * leaguePool.reduce((sum, p) => sum + p.components[c], 0)) /
                leagueMinutes
              : null,
          ]),
        ) as Record<Component, number | null>;
        const contrasts = Object.fromEntries(
          components.map((c) => [
            c,
            rates[c] !== null && leagueRates[c] !== null
              ? rates[c]! - leagueRates[c]!
              : null,
          ]),
        ) as Record<Component, number | null>;
        const prior = seasons.find((p) => p.season === s.season - 10001);
        const priorPopulation =
          prior?.rows
            .filter((p) => p.position === position)
            .sort((a, b) => b.minutes - a.minutes || a.playerId - b.playerId) ??
          [];
        const priorDepth = Math.ceil(
          (teamsBySeason[prior?.season ?? -1] ?? 0) * depth[position],
        );
        const priorCutoff =
          priorPopulation[Math.min(priorPopulation.length, priorDepth) - 1]
            ?.minutes ?? null;
        const previousRegularIds = new Set(
          priorCutoff === null
            ? []
            : priorPopulation
                .filter((p) => p.minutes >= priorCutoff)
                .map((p) => p.playerId),
        );
        const formerRegulars = pool.filter((p) =>
          previousRegularIds.has(p.playerId),
        );
        const formerMinutes = formerRegulars.reduce(
          (sum, p) => sum + officialMinutes(p),
          0,
        );
        const withoutFormer = pool.filter(
          (p) => !previousRegularIds.has(p.playerId),
        );
        const withoutMinutes = withoutFormer.reduce(
          (sum, p) => sum + officialMinutes(p),
          0,
        );
        return {
          season: s.season,
          policy,
          position,
          teams: teamsBySeason[s.season]!,
          regularPlayers,
          cutoffMinutes: cutoff,
          populationPlayers: population.length,
          depthPoolPlayers: depthPool.length,
          sourceRevisionCounts: Object.fromEntries(
            [...new Set(s.rows.map((p) => p.revision ?? "unrecorded"))].map(
              (revision) => [
                revision,
                s.rows.filter((p) => (p.revision ?? "unrecorded") === revision)
                  .length,
              ],
            ),
          ),
          supported,
          seasonLimited,
          players: pool.length,
          minutes,
          leaguePosition: {
            players: leaguePool.length,
            minutes: leagueMinutes,
            rates: leagueRates,
          },
          contrasts,
          totals,
          rates,
          exclusions,
          lowMinutePlayers: pool.filter(
            (p) => officialMinutes(p) < (position === "G" ? 300 : 200),
          ).length,
          formerRegulars: {
            players: formerRegulars.length,
            minutes: formerMinutes,
            fractionMinutes: minutes ? formerMinutes / minutes : 0,
            playerIds: formerRegulars.map((p) => p.playerId),
            playersWithoutFormerRegulars: withoutFormer.length,
            ratesWithoutFormerRegulars: Object.fromEntries(
              components.map((c) => [
                c,
                withoutMinutes > 0
                  ? (60 *
                      withoutFormer.reduce(
                        (sum, p) => sum + p.components[c],
                        0,
                      )) /
                    withoutMinutes
                  : null,
              ]),
            ),
          },
          members: pool.map((p) => ({
            playerId: p.playerId,
            name: p.name,
            minutes: officialMinutes(p),
            status: p.status,
            totals: Object.fromEntries(
              components.map((c) => [c, p.components[c]]),
            ) as Record<Component, number>,
          })),
        };
      }),
    ),
  );
  const predictions = annual
    .filter((target) => target.supported)
    .flatMap((target) => {
      const history = annual.filter(
        (p) =>
          p.supported &&
          p.position === target.position &&
          p.policy === target.policy &&
          p.season < target.season,
      );
      if (history.length < NHL_REFERENCE_STABILITY_CONFIG.minimumPriorSeasons)
        return [];
      const windows = {
        previousAvailable: history.slice(-1),
        trailing3: history.slice(-3),
        trailing5: history.slice(-5),
        expanding: history,
        neutralZero: [],
      };
      return components
        .filter(
          (component) => target.position === "G" || component !== "saving",
        )
        .map((component) => {
          const estimates = Object.fromEntries(
            methods.map((method) => {
              const members = windows[method];
              const minutes = members.reduce((sum, p) => sum + p.minutes, 0);
              return [
                method,
                method === "neutralZero"
                  ? 0
                  : (60 *
                      members.reduce(
                        (sum, p) => sum + p.totals[component],
                        0,
                      )) /
                    minutes,
              ];
            }),
          ) as Record<Method, number>;
          const contrastEstimates = Object.fromEntries(
            methods.map((method) => {
              const members = windows[method];
              const minutes = members.reduce((sum, p) => sum + p.minutes, 0);
              return [
                method,
                method === "neutralZero"
                  ? 0
                  : members.reduce(
                      (sum, p) => sum + p.contrasts[component]! * p.minutes,
                      0,
                    ) / minutes,
              ];
            }),
          ) as Record<Method, number>;
          return {
            season: target.season,
            policy: target.policy,
            position: target.position,
            component,
            phase:
              target.season <= NHL_REFERENCE_STABILITY_CONFIG.developmentThrough
                ? "development"
                : "exploratory",
            actual: target.rates[component]!,
            targetMinutes: target.minutes,
            estimates,
            actualContrast: target.contrasts[component]!,
            contrastEstimates,
            currentPositionMean: target.leaguePosition.rates[component]!,
            reanchoredEstimates: Object.fromEntries(
              methods.map((method) => [
                method,
                target.leaguePosition.rates[component]! +
                  contrastEstimates[method],
              ]),
            ) as Record<Method, number>,
            historySeasons: Object.fromEntries(
              methods.map((method) => [
                method,
                windows[method].map((p) => p.season),
              ]),
            ),
          };
        });
    });
  const evaluation = Object.keys(policies).flatMap((policy) =>
    positions.flatMap((position) =>
      components
        .filter((component) => position === "G" || component !== "saving")
        .flatMap((component) =>
          ["development", "exploratory"].map((phase) => {
            const pool = predictions.filter(
              (p) =>
                p.policy === policy &&
                p.position === position &&
                p.component === component &&
                p.phase === phase,
            );
            return {
              policy,
              position,
              component,
              phase,
              methods: Object.fromEntries(
                methods.map((method) => [
                  method,
                  summarize(
                    pool.map((p) => ({
                      prediction: p.estimates[method],
                      actual: p.actual,
                      weight: p.targetMinutes,
                    })),
                  ),
                ]),
              ),
            };
          }),
        ),
    ),
  );
  const contrastEvaluation = evaluation.map((e) => {
    const pool = predictions.filter(
      (p) =>
        p.policy === e.policy &&
        p.position === e.position &&
        p.component === e.component &&
        p.phase === e.phase,
    );
    return {
      ...e,
      methods: Object.fromEntries(
        methods.map((method) => [
          method,
          summarize(
            pool.map((p) => ({
              prediction: p.contrastEstimates[method],
              actual: p.actualContrast,
              weight: p.targetMinutes,
            })),
          ),
        ]),
      ),
    };
  });
  const rollingSelection = predictions.flatMap((target) =>
    (["uncentered", "contrast"] as const).flatMap((hypothesis) => {
      const training = predictions.filter(
        (p) =>
          p.policy === target.policy &&
          p.position === target.position &&
          p.component === target.component &&
          p.season < target.season &&
          p.season <= NHL_REFERENCE_STABILITY_CONFIG.developmentThrough,
      );
      if (
        training.length <
        NHL_REFERENCE_STABILITY_CONFIG.minimumWindowSelectionOutcomes
      )
        return [];
      const trials = methods
        .filter((method) => method !== "neutralZero")
        .map((method) => ({
          method,
          ...summarize(
            training.map((p) => ({
              prediction:
                hypothesis === "contrast"
                  ? p.contrastEstimates[method]
                  : p.estimates[method],
              actual: hypothesis === "contrast" ? p.actualContrast : p.actual,
              weight: p.targetMinutes,
            })),
          ),
        }));
      const selected = [...trials].sort(
        (a, b) =>
          a.weightedMse! - b.weightedMse! ||
          methods.indexOf(a.method) - methods.indexOf(b.method),
      )[0]!;
      return [
        {
          season: target.season,
          phase: target.phase,
          policy: target.policy,
          position: target.position,
          component: target.component,
          hypothesis,
          trainingSeasons: training.map((p) => p.season),
          trials,
          selectedMethod: selected.method,
          actual:
            hypothesis === "contrast" ? target.actualContrast : target.actual,
          prediction:
            hypothesis === "contrast"
              ? target.contrastEstimates[selected.method]
              : target.estimates[selected.method],
          baselinePrevious:
            hypothesis === "contrast"
              ? target.contrastEstimates.previousAvailable
              : target.estimates.previousAvailable,
          targetMinutes: target.targetMinutes,
        },
      ];
    }),
  );
  const rollingSelectionEvaluation = evaluation.flatMap((e) =>
    (["uncentered", "contrast"] as const).map((hypothesis) => {
      const pool = rollingSelection.filter(
        (p) =>
          p.policy === e.policy &&
          p.position === e.position &&
          p.component === e.component &&
          p.phase === e.phase &&
          p.hypothesis === hypothesis,
      );
      return {
        policy: e.policy,
        position: e.position,
        component: e.component,
        phase: e.phase,
        hypothesis,
        selected: summarize(
          pool.map((p) => ({
            prediction: p.prediction,
            actual: p.actual,
            weight: p.targetMinutes,
          })),
        ),
        previousOnIdenticalCohort: summarize(
          pool.map((p) => ({
            prediction: p.baselinePrevious,
            actual: p.actual,
            weight: p.targetMinutes,
          })),
        ),
      };
    }),
  );
  const variation = Object.keys(policies).flatMap((policy) =>
    positions.flatMap((position) =>
      components
        .filter((component) => position === "G" || component !== "saving")
        .map((component) => {
          const pool = annual.filter(
            (p) =>
              p.policy === policy && p.position === position && p.supported,
          );
          const values = pool.map((p) => p.rates[component]!);
          const mean = values.length
            ? values.reduce((sum, v) => sum + v, 0) / values.length
            : null;
          return {
            policy,
            position,
            component,
            seasons: values.length,
            mean,
            standardDeviation:
              values.length > 1
                ? Math.sqrt(
                    values.reduce((sum, v) => sum + (v - mean!) ** 2, 0) /
                      (values.length - 1),
                  )
                : null,
            minimum: values.length ? Math.min(...values) : null,
            maximum: values.length ? Math.max(...values) : null,
          };
        }),
    ),
  );
  return {
    config: NHL_REFERENCE_STABILITY_CONFIG,
    interpretation:
      "Offline reference forecast experiment. Same-position total canonical TOI defines depth; F/D are proxies for the unavailable historical EV cohorts. No raw process coefficient or process value is pooled across seasons. Prior-only estimates predict the next measured annual reference rate, which is noisy model-derived evidence rather than readily available talent or causal contribution. Contrast forecasts use prior contrasts only; reanchoring adds the current covered position mean for retrospective season accounting, not a pregame prediction. Window selection uses only earlier forecast outcomes through2022. 2023-25 are already inspected exploratory seasons. Prior regulars may represent injury, role changes or other causes; no injury labels are inferred.",
    annual,
    predictions,
    evaluation,
    contrastEvaluation,
    rollingSelection,
    rollingSelectionEvaluation,
    variation,
  };
}
