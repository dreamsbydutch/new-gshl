import type { AbilitySeasonSnapshot } from "../domains/ranking/nhl-ability-experiment";
import { experimentNhlReferenceStability } from "../domains/ranking/nhl-reference-stability";
import {
  NHL_OVERALL_PREVIEW_CONFIG,
  rankNhlReplacementPreview,
  type OverallPreviewInput,
} from "./nhl-overall-rating";

type BaseOverall = ReturnType<typeof rankNhlReplacementPreview>;

export const NHL_POOLED_GOALIE_REFERENCE_CONFIG = {
  version: "nhl-pooled-goalie-reference-research-v1",
  estimator:
    "expanding prior-season replacement-minus-covered-goalie-mean saving contrast",
  minimumPriorSeasons: 3,
  goalieDepths: { narrower: 1.5, default: 2, wider: 2.5 },
  changes:
    "Goalie saving reference only; all F/D and goalie finishing/penalty references and contributions remain fixed",
  qualification:
    "Same coverage and low-minute-reference policies as the reference stability experiment; originally provisional players remain unranked",
} as const;

/** Research reference transformation; never a publishable v3 ratings report. */
export function rankNhlPooledGoalieReferencePreview(input: {
  currentSeason: number;
  currentRevision: string;
  current: OverallPreviewInput;
  baseOverall: BaseOverall;
  historical: AbilitySeasonSnapshot;
  teamsBySeason: Readonly<Record<number, number>>;
}) {
  if (
    !Number.isInteger(input.currentSeason) ||
    Math.floor(input.currentSeason / 10000) + 1 !==
      input.currentSeason % 10000 ||
    !input.currentRevision.trim()
  )
    throw new Error("A valid current season and source revision are required");
  const depthEntry = Object.entries(
    NHL_POOLED_GOALIE_REFERENCE_CONFIG.goalieDepths,
  ).find(([, depth]) => depth === input.baseOverall.depth.G);
  if (!depthEntry)
    throw new Error("Only fixed goalie depths 1.5, 2 and 2.5 are supported");
  const policy = depthEntry[0];
  if (
    input.teamsBySeason[input.currentSeason] !== input.baseOverall.numberOfTeams
  )
    throw new Error(
      "Verified current team count differs from the supplied baseline",
    );
  const expectedBase = rankNhlReplacementPreview({
    ...input.current,
    numberOfTeams: input.baseOverall.numberOfTeams,
    depth: input.baseOverall.depth,
  });
  if (
    JSON.stringify(expectedBase.references) !==
      JSON.stringify(input.baseOverall.references) ||
    JSON.stringify(expectedBase.ratings) !==
      JSON.stringify(input.baseOverall.ratings)
  )
    throw new Error(
      "Baseline overall values/references do not reproduce the current report",
    );
  const priorSnapshot = {
    seasons: input.historical.seasons.filter(
      (s) => s.season < input.currentSeason,
    ),
  };
  const past = experimentNhlReferenceStability(
    priorSnapshot,
    input.teamsBySeason,
  );
  const history = past.annual.filter(
    (s) => s.position === "G" && s.policy === policy && s.supported,
  );
  const priorMinutes = history.reduce((sum, s) => sum + s.minutes, 0);
  const supported =
    history.length >= NHL_POOLED_GOALIE_REFERENCE_CONFIG.minimumPriorSeasons &&
    priorMinutes > 0;
  const pooledContrast = supported
    ? history.reduce((sum, s) => sum + s.contrasts.saving! * s.minutes, 0) /
      priorMinutes
    : null;
  const previous = history.at(-1);
  const currentSnapshot: AbilitySeasonSnapshot = {
    seasons: [
      {
        season: input.currentSeason,
        rows: input.current.ratings.map((p) => ({
          ...p,
          limitedSeason: false,
          revision: input.currentRevision,
        })),
      },
    ],
  };
  const currentSummary = experimentNhlReferenceStability(currentSnapshot, {
    ...input.teamsBySeason,
    [input.currentSeason]: input.baseOverall.numberOfTeams,
  });
  const current = currentSummary.annual.find(
    (s) => s.position === "G" && s.policy === policy,
  )!;
  const originalRate = input.baseOverall.references.G.savingPer60;
  if (
    current.rates.saving !== null &&
    originalRate !== null &&
    Math.abs(current.rates.saving - originalRate) > 1e-10
  )
    throw new Error(
      "Current goalie depth/reference differs between baseline and stability policies",
    );
  const currentMean = current.leaguePosition.rates.saving;
  const replacementRate =
    pooledContrast !== null && currentMean !== null
      ? pooledContrast + currentMean
      : null;
  const sameSeasonHistorical = input.historical.seasons.find(
    (s) => s.season === input.currentSeason,
  );
  const bridge = sameSeasonHistorical
    ? experimentNhlReferenceStability(
        { seasons: [sameSeasonHistorical] },
        input.teamsBySeason,
      ).annual.find((s) => s.position === "G" && s.policy === policy)!
    : null;
  const ratings = input.baseOverall.ratings.map((p) => {
    if (p.position !== "G" || p.qualification !== "ranked")
      return {
        ...p,
        components: p.components ? { ...p.components } : null,
        warnings: [...p.warnings],
      };
    if (replacementRate === null)
      return {
        ...p,
        qualification: "insufficient-reference",
        overallValue: null,
        overallRank: null,
        components: null,
        warnings: [
          ...p.warnings,
          "Fewer than three supported prior seasons or unavailable current goalie mean; pooled goalie value withheld",
        ],
      };
    const raw = input.current.ratings.find((q) => q.playerId === p.playerId)!;
    const saving =
      raw.components.saving -
      (replacementRate * raw.minutes * raw.componentCoverage.officialMinutes) /
        60;
    const components = { ...p.components!, saving };
    const overallValue = Object.values(components).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (!Number.isFinite(overallValue))
      throw new Error("Nonfinite pooled goalie value");
    return { ...p, overallValue, components, warnings: [...p.warnings] };
  });
  const ranked = ratings.filter((p) => p.overallValue !== null);
  const key = (value: number) =>
    Math.round(value / NHL_OVERALL_PREVIEW_CONFIG.rankResolutionGoals);
  for (const p of ratings)
    p.overallRank =
      p.overallValue === null
        ? null
        : 1 +
          ranked.filter((q) => key(q.overallValue!) > key(p.overallValue!))
            .length;
  const error = (
    prediction: number | undefined | null,
    actual: number | null,
  ) =>
    prediction === undefined || prediction === null || actual === null
      ? null
      : (prediction - actual) ** 2;
  const previousContrast = previous?.contrasts.saving ?? null;
  return {
    config: NHL_POOLED_GOALIE_REFERENCE_CONFIG,
    researchOnly: true,
    season: input.currentSeason,
    currentRevision: input.currentRevision,
    policy,
    historicalSeasons: history.map((s) => s.season),
    historicalMinutes: priorMinutes,
    historicalPlayerSeasons: history.reduce((sum, s) => sum + s.players, 0),
    historicalRevisionCounts: history.map((s) => ({
      season: s.season,
      revisions: s.sourceRevisionCounts,
    })),
    supported,
    reference: {
      originalSavingPer60: originalRate,
      currentCoveredGoalieMeanPer60: currentMean,
      currentCoveredGoalies: current.leaguePosition.players,
      currentCoveredMinutes: current.leaguePosition.minutes,
      currentObservedContrast: current.contrasts.saving,
      previousAvailableContrast: previousContrast,
      pooledPriorContrast: pooledContrast,
      pooledSavingPer60: replacementRate,
    },
    comparison: {
      currentMeasuredContrastError: {
        previousAnnualSquaredError: error(
          previousContrast,
          current.contrasts.saving,
        ),
        expandingPoolSquaredError: error(
          pooledContrast,
          current.contrasts.saving,
        ),
      },
      savedSameSeasonBridge: bridge
        ? {
            sourceRevisions: bridge.sourceRevisionCounts,
            storedContrast: bridge.contrasts.saving,
            rebuiltContrast: current.contrasts.saving,
            difference:
              bridge.contrasts.saving !== null &&
              current.contrasts.saving !== null
                ? current.contrasts.saving - bridge.contrasts.saving
                : null,
            storedReferencePer60: bridge.rates.saving,
            storedPositionMeanPer60: bridge.leaguePosition.rates.saving,
            previousAnnualSquaredError: error(
              previousContrast,
              bridge.contrasts.saving,
            ),
            expandingPoolSquaredError: error(
              pooledContrast,
              bridge.contrasts.saving,
            ),
          }
        : null,
    },
    uncertainty:
      "No total model confidence interval is supplied. Historical windows, current depth policy and estimated player values remain uncertain. The separate five-prior-season player-cluster interval is a conditional diagnostic for a DIFFERENT window; it is not an interval for this expanding estimator or future reference truth.",
    interpretation:
      "Exploratory retrospective season-value reference experiment. Prior seasons alone estimate the replacement-minus-league saving contrast; current covered goalie mean reanchors the goal scale. Historical source/revision drift is measured, not assumed absent. F/D historical total-TOI proxy references are never applied. This changes no player saving observation, default algorithm or production record, and no publishable v3 ratings report is produced.",
    overall: {
      ...input.baseOverall,
      config: {
        ...input.baseOverall.config,
        version: NHL_POOLED_GOALIE_REFERENCE_CONFIG.version,
      },
      warning:
        "Research only: pooled prior-season goalie saving reference; rankings are not publishable v3 ratings. F/D contributions and references remain fixed. Historical five-season diagnostic intervals do not describe total uncertainty.",
      references: {
        ...input.baseOverall.references,
        G: {
          ...input.baseOverall.references.G,
          supported:
            input.baseOverall.references.G.supported &&
            replacementRate !== null,
          savingPer60: replacementRate,
          savingReference: {
            source:
              "expanding prior-season league-centered contrast, reanchored to current covered goalie mean",
            seasons: history.map((s) => s.season),
            historicalMinutes: priorMinutes,
            historicalPlayerSeasons: history.reduce(
              (sum, s) => sum + s.players,
              0,
            ),
            currentMeanPer60: currentMean,
            interpretation:
              "The inherited playerIds, players and officialMinutes describe the current cohort retained for finishing/penalties and the observed comparison; the saving rate uses this separate historical reference.",
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
