import { NHL_OVERALL_PREVIEW_CONFIG } from "./nhl-overall-rating";
import { rankNhlPooledGoalieReferencePreview } from "./nhl-pooled-goalie-reference";

export const NHL_BLENDED_GOALIE_REFERENCE_CONFIG = {
  version: "nhl-blended-goalie-reference-research-v1",
  priorEquivalentMinutes: 10000,
  selection:
    "Fixed default-depth concentration selected using development target seasons through2022; not retuned to OOF outcomes or alternative depth presets",
  estimator:
    "Current annual replacement saving rate blended with expanding prior-season league-centered contrast reanchored to current covered-goalie mean",
  changes:
    "Goalie saving reference only; original annual and pure-pool algorithms and results remain unchanged",
} as const;
type Input = Parameters<typeof rankNhlPooledGoalieReferencePreview>[0];

/** Pure research composition. Zero/infinite concentration are explicit diagnostics. */
export function rankNhlBlendedGoalieReferencePreview(
  input: Input & { priorEquivalentMinutes?: number },
) {
  const concentration =
    input.priorEquivalentMinutes ??
    NHL_BLENDED_GOALIE_REFERENCE_CONFIG.priorEquivalentMinutes;
  if (
    (!Number.isFinite(concentration) && concentration !== Infinity) ||
    concentration < 0
  )
    throw new Error(
      "Nonnegative finite or infinite prior-equivalent minutes required",
    );
  const pool = rankNhlPooledGoalieReferencePreview(input);
  const annual = input.baseOverall.references.G;
  const currentMinutes = annual.officialMinutes;
  const originalRate = annual.savingPer60;
  const poolRate = pool.reference.pooledSavingPer60;
  const annualSupported =
    annual.supported &&
    Number.isFinite(currentMinutes) &&
    currentMinutes > 0 &&
    originalRate !== null &&
    Number.isFinite(originalRate);
  const supported =
    annualSupported && (concentration === 0 || poolRate !== null);
  const currentWeight = !annualSupported
    ? null
    : concentration === Infinity
      ? 0
      : currentMinutes / (currentMinutes + concentration);
  const historicalWeight = !annualSupported
    ? null
    : concentration === Infinity
      ? 1
      : concentration / (currentMinutes + concentration);
  const replacementRate = !supported
    ? null
    : concentration === 0
      ? originalRate
      : concentration === Infinity
        ? poolRate
        : (currentMinutes * originalRate! + concentration * poolRate!) /
          (currentMinutes + concentration);
  const ratings = input.baseOverall.ratings.map((p) => {
    const copy = {
      ...p,
      components: p.components ? { ...p.components } : null,
      warnings: [...p.warnings],
    };
    if (
      p.position !== "G" ||
      p.qualification !== "ranked" ||
      concentration === 0
    )
      return copy;
    if (replacementRate === null)
      return {
        ...copy,
        qualification: "insufficient-reference",
        components: null,
        overallValue: null,
        overallRank: null,
        warnings: [
          ...copy.warnings,
          "Unavailable annual evidence or fewer than three supported prior seasons; blended goalie value withheld",
        ],
      };
    const raw = input.current.ratings.find((q) => q.playerId === p.playerId)!;
    const saving =
      raw.components.saving -
      (replacementRate * raw.minutes * raw.componentCoverage.officialMinutes) /
        60;
    const components = { ...copy.components!, saving };
    const overallValue = Object.values(components).reduce(
      (sum, v) => sum + v,
      0,
    );
    if (!Number.isFinite(overallValue))
      throw new Error("Nonfinite blended goalie value");
    return { ...copy, components, overallValue };
  });
  const key = (value: number) =>
    Math.round(value / NHL_OVERALL_PREVIEW_CONFIG.rankResolutionGoals);
  const ranked = ratings.filter((p) => p.overallValue !== null);
  for (const p of ratings)
    p.overallRank =
      p.overallValue === null
        ? null
        : 1 +
          ranked.filter((q) => key(q.overallValue!) > key(p.overallValue!))
            .length;
  const snapshot = {
    priorEquivalentMinutes:
      concentration === Infinity ? "Infinity" : concentration,
    annualSavingPer60: originalRate,
    currentReplacementMinutes: currentMinutes,
    currentWeight,
    historicalWeight,
    currentCoveredGoalieMeanPer60: pool.reference.currentCoveredGoalieMeanPer60,
    currentObservedContrast: pool.reference.currentObservedContrast,
    pooledPriorContrast: pool.reference.pooledPriorContrast,
    purePoolSavingPer60: poolRate,
    blendedSavingPer60: replacementRate,
    historyExclusiveBefore: input.currentSeason,
    historicalSeasons: [...pool.historicalSeasons],
    historicalMinutes: pool.historicalMinutes,
    historicalPlayerSeasons: pool.historicalPlayerSeasons,
    historicalRevisionCounts: structuredClone(pool.historicalRevisionCounts),
    annualCohortPlayerIds: [...annual.playerIds],
    currentRevision: input.currentRevision,
  };
  return {
    config: NHL_BLENDED_GOALIE_REFERENCE_CONFIG,
    researchOnly: true,
    publishable: false,
    season: input.currentSeason,
    currentRevision: input.currentRevision,
    policy: pool.policy,
    supported,
    reference: snapshot,
    diagnostics: {
      annualReference: structuredClone(annual),
      purePoolReference: structuredClone(pool.reference),
      purePoolComparison: structuredClone(pool.comparison),
    },
    uncertainty:
      "No total confidence interval supplied. Conditional heldout-reference checks freeze upstream OOF shot models and learned reference predictions; they are not end-to-end goalie-ID holdout or causal validation. Legacy2025 reference outcomes were already inspected.",
    interpretation:
      "Research expected replacement-population saving reference. Only G saving baseline changes; raw observed player contribution, F/D baselines, G finishing/penalties and source status/coverage remain unchanged. Qualification rules remain fixed; unsupported prior history withholds the new G value. This is neither replacement talent identification nor a publishable rating.",
    overall: {
      ...input.baseOverall,
      config: {
        ...input.baseOverall.config,
        version: NHL_BLENDED_GOALIE_REFERENCE_CONFIG.version,
      },
      warning:
        "Research only: fixed10000-minute current/historical goalie saving reference blend (alternate concentrations are diagnostic). Common goal units and depth-proxy uncertainty remain; no historical bootstrap interval applies.",
      references: {
        ...input.baseOverall.references,
        G: {
          ...annual,
          supported: annualSupported && replacementRate !== null,
          savingPer60: replacementRate,
          savingReference: {
            source:
              "current-and-expanding-prior league-centered saving contrast blend",
            ...snapshot,
            interpretation:
              "Inherited player IDs/minutes also define unchanged G finishing/penalty baselines. Historical sample minutes estimate the prior mean;10000 pseudo-minutes, not the historical total, determine shrinkage strength.",
          },
        },
      },
      ratings: ratings.sort(
        (a, b) =>
          (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity) ||
          a.playerId - b.playerId,
      ),
    },
  };
}
