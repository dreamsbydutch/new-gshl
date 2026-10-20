import type {
  AbilitySeasonRow,
  AbilitySeasonSnapshot,
} from "../domains/ranking/nhl-ability-experiment";
import { experimentNhlReferenceStability } from "../domains/ranking/nhl-reference-stability";

/** Frozen research comparison; never changes the published replacement reference. */
export const NHL_GOALIE_REFERENCE_BLEND = {
  version: "nhl-goalie-reference-blend-experiment-v1",
  pseudoMinutes: ["0", "300", "1000", "3000", "10000", "30000", "Infinity"],
  seeds: [193, 721, 1297],
  folds: 5,
  minimumPriorSeasons: 3,
  minimumTrainingPlayers: 5,
  developmentThrough: 20222023,
} as const;
type Method = (typeof NHL_GOALIE_REFERENCE_BLEND.pseudoMinutes)[number];
const minutes = (p: AbilitySeasonRow) =>
  p.minutes * p.componentCoverage.officialMinutes;
// Identical goalie evidence policy to the reference-stability experiment. Exposure
// selection itself is delegated there, before any outcome-based eligibility filter.
function covered(p: AbilitySeasonRow) {
  return (
    p.position === "G" &&
    !p.limitedSeason &&
    p.status !== "incomplete" &&
    !(p.status === "provisional" && minutes(p) >= 300) &&
    Number.isFinite(minutes(p)) &&
    minutes(p) > 0 &&
    p.abilityPer60 !== null &&
    Number.isFinite(p.abilityPer60) &&
    [p.components.finishing, p.components.penalties, p.components.saving].every(
      Number.isFinite,
    ) &&
    p.componentCoverage.missingGoals === 0 &&
    [
      p.componentCoverage.officialMinutes,
      p.componentCoverage.individualShots,
    ].every((v) => Number.isFinite(v) && v >= 0.95 && v <= 1.03)
  );
}
function shuffle(ids: number[], seed: number) {
  const result = [...ids].sort((a, b) => a - b);
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
function metrics(
  rows: Array<{
    actual: number;
    weight: number;
    predictions: Record<Method, number>;
  }>,
  method: Method,
) {
  const weight = rows.reduce((s, r) => s + r.weight, 0);
  return {
    observations: rows.length,
    minutes: weight,
    weightedMse: weight
      ? rows.reduce(
          (s, r) => s + r.weight * (r.predictions[method] - r.actual) ** 2,
          0,
        ) / weight
      : null,
    mse: rows.length
      ? rows.reduce((s, r) => s + (r.predictions[method] - r.actual) ** 2, 0) /
        rows.length
      : null,
  };
}

export function experimentNhlGoalieReferenceBlend(
  snapshot: AbilitySeasonSnapshot,
  teamsBySeason: Readonly<Record<number, number>>,
) {
  const stability = experimentNhlReferenceStability(snapshot, teamsBySeason);
  const annual = stability.annual.filter((r) => r.position === "G");
  const folds = annual
    .filter((r) => r.supported)
    .flatMap((target) => {
      const history = annual.filter(
        (r) =>
          r.policy === target.policy && r.supported && r.season < target.season,
      );
      if (history.length < NHL_GOALIE_REFERENCE_BLEND.minimumPriorSeasons)
        return [];
      const priorMinutes = history.reduce((s, r) => s + r.minutes, 0);
      const priorContrast =
        history.reduce((s, r) => s + r.minutes * r.contrasts.saving!, 0) /
        priorMinutes;
      const league = snapshot.seasons
        .find((s) => s.season === target.season)!
        .rows.filter(covered);
      return NHL_GOALIE_REFERENCE_BLEND.seeds.flatMap((seed) => {
        const shuffled = shuffle(
          target.members.map((r) => r.playerId),
          seed,
        );
        return Array.from(
          { length: NHL_GOALIE_REFERENCE_BLEND.folds },
          (_, fold) => {
            const heldoutIds = new Set(
              shuffled.filter(
                (_, i) => i % NHL_GOALIE_REFERENCE_BLEND.folds === fold,
              ),
            );
            const heldout = target.members.filter((p) =>
              heldoutIds.has(p.playerId),
            );
            const train = target.members.filter(
              (p) => !heldoutIds.has(p.playerId),
            );
            const anchor = league.filter((p) => !heldoutIds.has(p.playerId));
            const testMinutes = heldout.reduce((s, p) => s + p.minutes, 0);
            const trainingMinutes = train.reduce((s, p) => s + p.minutes, 0);
            const anchorMinutes = anchor.reduce((s, p) => s + minutes(p), 0);
            if (
              !testMinutes ||
              train.length <
                NHL_GOALIE_REFERENCE_BLEND.minimumTrainingPlayers ||
              !anchorMinutes
            )
              return null;
            const annualTrainRate =
              (60 * train.reduce((s, p) => s + p.totals.saving, 0)) /
              trainingMinutes;
            const currentAnchor =
              (60 * anchor.reduce((s, p) => s + p.components.saving, 0)) /
              anchorMinutes;
            const priorRawRate = priorContrast + currentAnchor;
            const predictions = Object.fromEntries(
              NHL_GOALIE_REFERENCE_BLEND.pseudoMinutes.map((method) => {
                const k = Number(method);
                return [
                  method,
                  k === Infinity
                    ? priorRawRate
                    : k === 0
                      ? annualTrainRate
                      : (trainingMinutes * annualTrainRate + k * priorRawRate) /
                        (trainingMinutes + k),
                ];
              }),
            ) as Record<Method, number>;
            const historicalIds = new Set(
              history.flatMap((r) => r.members.map((p) => p.playerId)),
            );
            return {
              season: target.season,
              policy: target.policy,
              seed,
              fold,
              heldoutIds: [...heldoutIds].sort((a, b) => a - b),
              trainingPlayers: train.length,
              heldoutPlayers: heldout.length,
              anchorPlayers: anchor.length,
              historicalHeldoutIds: [...heldoutIds].filter((id) =>
                historicalIds.has(id),
              ),
              trainingMinutes,
              anchorMinutes,
              priorSeasons: history.map((r) => r.season),
              priorMinutes,
              priorContrast,
              currentAnchor,
              annualTrainRate,
              priorRawRate,
              actual:
                (60 * heldout.reduce((s, p) => s + p.totals.saving, 0)) /
                testMinutes,
              weight: testMinutes,
              predictions,
            };
          },
        ).filter((r) => r !== null);
      });
    });
  const seasonLosses = annual.flatMap((target) => {
    const rows = folds.filter(
      (r) => r.season === target.season && r.policy === target.policy,
    );
    return rows.length
      ? [
          {
            season: target.season,
            policy: target.policy,
            uniqueReferencePlayers: target.players,
            uniqueReferenceMinutes: target.minutes,
            successfulFolds: rows.length,
            repeatedEvaluationMinutes: rows.reduce(
              (sum, row) => sum + row.weight,
              0,
            ),
            methods: NHL_GOALIE_REFERENCE_BLEND.pseudoMinutes.map((method) => ({
              method,
              ...metrics(rows, method),
            })),
          },
        ]
      : [];
  });
  const selections = ["narrower", "default", "wider"].map((policy) => {
    const train = folds.filter(
      (r) =>
        r.policy === policy &&
        r.season <= NHL_GOALIE_REFERENCE_BLEND.developmentThrough,
    );
    const candidates = NHL_GOALIE_REFERENCE_BLEND.pseudoMinutes.map(
      (method) => ({ method, ...metrics(train, method) }),
    );
    const selected =
      [...candidates]
        .filter((c) => c.weightedMse !== null)
        .sort((a, b) => a.weightedMse! - b.weightedMse!)[0]?.method ?? null;
    return {
      policy,
      trainingSeasons: [...new Set(train.map((r) => r.season))],
      selected,
      candidates,
      exploratory: NHL_GOALIE_REFERENCE_BLEND.pseudoMinutes.map((method) => ({
        method,
        ...metrics(
          folds.filter(
            (r) =>
              r.policy === policy &&
              r.season > NHL_GOALIE_REFERENCE_BLEND.developmentThrough,
          ),
          method,
        ),
      })),
    };
  });
  return {
    config: NHL_GOALIE_REFERENCE_BLEND,
    caveats: [
      "Research only; historical saved revisions bridge distinct model versions.",
      "Depth membership uses retrospective full-season exposure, not a causal availability or pregame talent estimate.",
      "Whole IDs form count-balanced folds; repeated seeds are not independent seasons.",
      "Metric minutes count repeated evaluations across three seeds; unique season exposure is reported separately.",
      "Heldout current IDs never supply reference or position-anchor outcomes; their earlier-season observations remain available.",
      "Only saving residuals are pooled; no raw process effects or F/D references are pooled.",
      "Development selection loss is apparent, not nested out-of-sample; 2023-2025 were previously inspected exploratory seasons.",
    ],
    annualReferences: annual,
    folds,
    seasonLosses,
    selections,
  };
}
