import type { GameSeasonRating } from "./nhl-game-season-value";
import { impactBreakdown } from "./nhl-impact-breakdown";

const POSITIONS = ["F", "D", "G"] as const;
type Position = (typeof POSITIONS)[number];
type Components = {
  offensiveProcess: number;
  defensiveProcess: number;
  finishing: number;
  penalties: number;
  saving: number;
};
type FamilyReference = {
  players: number;
  supported: boolean;
  minutes: number;
  offensePer60: number;
  againstPer60: number;
};
type PositionReference = {
  players: number;
  supported: boolean;
  officialMinutes: number;
  finishingPer60: number | null;
  penaltiesPer60: number | null;
  savingPer60: number | null;
  processByFamily: Record<string, FamilyReference>;
};

export const NHL_OVERALL_PREVIEW_CONFIG = {
  version: "nhl-overall-average-reference-preview-v1",
  minimumReferencePlayers: 5,
  minimumCoverage: 0.95,
  maximumCoverage: 1.03,
  storedRoundingTolerance: 0.0003,
  rankResolutionGoals: 1e-8,
} as const;

export type OverallPreviewInput = {
  model: { coefficients: Readonly<Record<string, number>> };
  ratings: readonly GameSeasonRating[];
};

function prepareOverallPlayer(input: OverallPreviewInput, p: GameSeasonRating) {
  const reconciles = (actual: number, stored: number) =>
    Number.isFinite(actual) &&
    Number.isFinite(stored) &&
    Math.abs(actual - stored) <=
      NHL_OVERALL_PREVIEW_CONFIG.storedRoundingTolerance +
        1e-10 * Math.max(Math.abs(actual), Math.abs(stored));
  if (
    !Number.isFinite(p.minutes) ||
    p.minutes <= 0 ||
    p.seasonValue === null ||
    !Number.isFinite(p.seasonValue) ||
    Object.values(p.components).some((v) => !Number.isFinite(v))
  )
    throw new Error(`Invalid rated-player value: ${p.playerId}`);
  const coverage = p.componentCoverage;
  const requiredCoverage = [coverage.officialMinutes, coverage.individualShots];
  if (p.position !== "G") requiredCoverage.push(coverage.processMinutes);
  if (
    coverage.missingGoals !== 0 ||
    requiredCoverage.some(
      (v) =>
        !Number.isFinite(v) ||
        v < NHL_OVERALL_PREVIEW_CONFIG.minimumCoverage ||
        v > NHL_OVERALL_PREVIEW_CONFIG.maximumCoverage,
    )
  )
    throw new Error(`Inadequate rated-player coverage: ${p.playerId}`);
  const officialMinutes = p.minutes * coverage.officialMinutes;
  if (!Number.isFinite(officialMinutes) || officialMinutes <= 0)
    throw new Error(`Invalid official exposure: ${p.playerId}`);
  for (const situation of Object.keys(p.situations)) {
    const match = /^(\d+)v(\d+):[GE][GE]$/.exec(situation);
    if (
      !match ||
      [Number(match[1]), Number(match[2])].some((n) => n < 3 || n > 6)
    )
      throw new Error(`Invalid strength situation: ${situation}`);
  }
  const breakdown = impactBreakdown(input.model, p.playerId, p.situations);
  for (const [family, row] of Object.entries(breakdown.byStrength)) {
    if (!row.minutes) continue;
    const offense = input.model.coefficients[`O:${family}:${p.playerId}`];
    const defense = input.model.coefficients[`D:${family}:${p.playerId}`];
    if (!Number.isFinite(offense) || !Number.isFinite(defense))
      throw new Error(`Unknown player-family effects: ${p.playerId}/${family}`);
  }
  const processMinutes = Object.values(breakdown.byStrength).reduce(
    (sum, row) => sum + row.minutes,
    0,
  );
  if (p.position === "G") {
    if (
      processMinutes !== 0 ||
      !reconciles(p.components.adjustedProcess, 0) ||
      !reconciles(p.components.offensiveProcess ?? 0, 0) ||
      !reconciles(p.components.defensiveProcess ?? 0, 0)
    )
      throw new Error(`Unexpected goalie process value: ${p.playerId}`);
  } else if (
    !Number.isFinite(p.modeledMinutes) ||
    !reconciles(processMinutes, p.modeledMinutes) ||
    Math.abs(processMinutes / p.minutes - coverage.processMinutes) > 0.000051 ||
    !reconciles(breakdown.total, p.components.adjustedProcess) ||
    (p.components.offensiveProcess !== undefined &&
      !reconciles(breakdown.offense, p.components.offensiveProcess)) ||
    (p.components.defensiveProcess !== undefined &&
      !reconciles(breakdown.defense, p.components.defensiveProcess)) ||
    !reconciles(p.components.saving, 0)
  )
    throw new Error(`Process exposure/value does not reconcile: ${p.playerId}`);
  const seasonTotal =
    (p.position === "G" ? p.components.saving : p.components.adjustedProcess) +
    p.components.finishing +
    p.components.penalties;
  if (!reconciles(seasonTotal, p.seasonValue))
    throw new Error(`Season components do not reconcile: ${p.playerId}`);
  return { officialMinutes, breakdown };
}

/**
 * A declared reference transformation, not a newly validated impact estimator.
 * Position/family coefficient shifts cancel; no replacement or talent claim follows.
 */
export function rankNhlOverallPreview(input: OverallPreviewInput) {
  const identities = new Set<number>();
  const prepared = new Map<
    number,
    {
      officialMinutes: number;
      breakdown: ReturnType<typeof impactBreakdown>;
    }
  >();
  for (const p of input.ratings) {
    if (
      !Number.isInteger(p.playerId) ||
      p.playerId <= 0 ||
      identities.has(p.playerId) ||
      !POSITIONS.includes(p.position) ||
      !["rated", "provisional", "incomplete"].includes(p.status)
    )
      throw new Error("Invalid or duplicate overall-preview player");
    identities.add(p.playerId);
    if (p.status !== "rated") continue;
    prepared.set(p.playerId, prepareOverallPlayer(input, p));
  }
  const references = Object.fromEntries(
    POSITIONS.map((position): [Position, PositionReference] => {
      const pool = input.ratings.filter(
        (p) => p.status === "rated" && p.position === position,
      );
      const supported =
        pool.length >= NHL_OVERALL_PREVIEW_CONFIG.minimumReferencePlayers;
      const officialMinutes = pool.reduce(
        (sum, p) => sum + prepared.get(p.playerId)!.officialMinutes,
        0,
      );
      const processByFamily: Record<string, FamilyReference> = {};
      if (supported && position !== "G")
        for (const p of pool)
          for (const [family, values] of Object.entries(
            prepared.get(p.playerId)!.breakdown.byStrength,
          )) {
            if (!values.minutes) continue;
            const reference = processByFamily[family] ?? {
              players: 0,
              supported: false,
              minutes: 0,
              offensePer60: 0,
              againstPer60: 0,
            };
            reference.players++;
            reference.minutes += values.minutes;
            reference.offensePer60 += values.offense * 60;
            reference.againstPer60 -= values.defense * 60;
            processByFamily[family] = reference;
          }
      for (const reference of Object.values(processByFamily)) {
        reference.supported =
          reference.players >=
          NHL_OVERALL_PREVIEW_CONFIG.minimumReferencePlayers;
        reference.offensePer60 /= reference.minutes;
        reference.againstPer60 /= reference.minutes;
      }
      const rate = (component: "finishing" | "penalties" | "saving") =>
        supported
          ? (pool.reduce((sum, p) => sum + p.components[component], 0) * 60) /
            officialMinutes
          : null;
      return [
        position,
        {
          players: pool.length,
          supported,
          officialMinutes,
          finishingPer60: rate("finishing"),
          penaltiesPer60: rate("penalties"),
          savingPer60: position === "G" ? rate("saving") : supported ? 0 : null,
          processByFamily,
        },
      ];
    }),
  ) as Record<Position, PositionReference>;
  const ratings = input.ratings.map((p) => {
    const reference = references[p.position];
    const unsupportedFamilies =
      p.status === "rated" && reference.supported
        ? Object.entries(prepared.get(p.playerId)!.breakdown.byStrength)
            .filter(
              ([family, values]) =>
                values.minutes > 0 &&
                !reference.processByFamily[family]?.supported,
            )
            .map(([family]) => family)
        : [];
    const state =
      p.status !== "rated"
        ? "unqualified"
        : !reference.supported || unsupportedFamilies.length > 0
          ? "insufficient-reference"
          : "ranked";
    let components: Components | null = null;
    let overallValue: number | null = null;
    if (state === "ranked") {
      const preparedPlayer = prepared.get(p.playerId)!;
      components = {
        offensiveProcess: 0,
        defensiveProcess: 0,
        finishing:
          p.components.finishing -
          (reference.finishingPer60! * preparedPlayer.officialMinutes) / 60,
        penalties:
          p.components.penalties -
          (reference.penaltiesPer60! * preparedPlayer.officialMinutes) / 60,
        saving:
          p.position === "G"
            ? p.components.saving -
              (reference.savingPer60! * preparedPlayer.officialMinutes) / 60
            : 0,
      };
      if (p.position !== "G")
        for (const [family, values] of Object.entries(
          preparedPlayer.breakdown.byStrength,
        )) {
          if (!values.minutes) continue;
          const familyReference = reference.processByFamily[family]!;
          components.offensiveProcess +=
            values.offense -
            (familyReference.offensePer60 * values.minutes) / 60;
          components.defensiveProcess +=
            values.defense +
            (familyReference.againstPer60 * values.minutes) / 60;
        }
      overallValue = Object.values(components).reduce((sum, v) => sum + v, 0);
      if (!Number.isFinite(overallValue))
        throw new Error(`Nonfinite overall preview value: ${p.playerId}`);
    }
    return {
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      status: p.status,
      qualification: state,
      warnings: unsupportedFamilies.map(
        (family) =>
          `Insufficient ${p.position}/${family} reference: fewer than ${NHL_OVERALL_PREVIEW_CONFIG.minimumReferencePlayers} rated players with positive family exposure; overall value withheld`,
      ),
      overallValue,
      overallRank: null as number | null,
      components,
    };
  });
  const rankKey = (value: number) =>
    Math.round(value / NHL_OVERALL_PREVIEW_CONFIG.rankResolutionGoals);
  const ranked = ratings.filter((p) => p.overallValue !== null);
  for (const p of ranked)
    p.overallRank =
      1 +
      ranked.filter((q) => rankKey(q.overallValue!) > rankKey(p.overallValue!))
        .length;
  return {
    config: NHL_OVERALL_PREVIEW_CONFIG,
    warning:
      "Preview: contribution relative to the rated-player average at the same position and strength deployment; not replacement value, causal absolute value, or a validated cross-position talent scale. Reference pools include the player being evaluated. No historical bootstrap interval applies to this transformed score.",
    references,
    ratings: ratings.sort(
      (a, b) =>
        (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity) ||
        a.playerId - b.playerId,
    ),
  };
}

export type NhlReplacementDepth = {
  F: number;
  D: number;
  G: number;
  PP: number;
  SH: number;
};

/** Prespecified reference sensitivity, not parameters selected by resulting ranks. */
export const NHL_REPLACEMENT_DEPTH_PRESETS = {
  narrow: { F: 12, D: 6, G: 1.5, PP: 11, SH: 9 },
  default: { F: 13, D: 7, G: 2, PP: 11, SH: 9 },
  wide: { F: 14, D: 8, G: 2.5, PP: 11, SH: 9 },
} as const satisfies Record<string, NhlReplacementDepth>;

export const NHL_REPLACEMENT_PREVIEW_CONFIG = {
  version: "nhl-overall-depth-replacement-preview-v1",
  minimumReferencePlayers: 5,
  lowMinuteThreshold: { F: 200, D: 200, G: 300 },
  referenceSelection:
    "verified-positive exposure; certain replacement under family-exposure bounds; cutoff ties remain regular",
  regularDepthRounding: "ceiling of teams times slots per team",
  depthSource:
    "https://evolving-hockey.com/blog/wins-above-replacement-replacement-level-decisions-results-and-final-remarks-part-3/",
  policy:
    "Published playing-time skater depths motivate EV13F/7D, PP11 and SH9. Current-season cohorts, EN using the EV cohort, individual finishing/penalties using the EV cohort, and goalie2/team are explicit preview policies, not claims of reproducing that published model.",
} as const;

type ReplacementFamilyReference = {
  sourceCohort: string;
  candidatePlayers: number;
  playerIds: number[];
  players: number;
  minutes: number;
  supported: boolean;
  offensePer60: number | null;
  againstPer60: number | null;
};

/**
 * Value above a same-position, exposure-defined depth cohort, in fitted goal units.
 * This does not identify an exact readily available replacement or causal GAR/WAR.
 */
export function rankNhlReplacementPreview(
  input: OverallPreviewInput & {
    numberOfTeams: number;
    depth?: NhlReplacementDepth;
  },
) {
  if (!Number.isInteger(input.numberOfTeams) || input.numberOfTeams <= 0)
    throw new Error("A positive verified NHL team count is required");
  const depth = { ...(input.depth ?? NHL_REPLACEMENT_DEPTH_PRESETS.default) };
  for (const key of ["F", "D", "G", "PP", "SH"] as const)
    if (!Number.isFinite(depth[key]) || depth[key] <= 0)
      throw new Error(`Invalid replacement depth: ${key}`);
  const identities = new Set<number>();
  const prepared = new Map<number, ReturnType<typeof prepareOverallPlayer>>();
  const exclusions: Array<{
    playerId: number;
    status: string;
    reason: string;
  }> = [];
  const eligible: GameSeasonRating[] = [];
  type ExposureBound = { lower: number; upper: number | null };
  const depthExposures = new Map<number, Record<string, ExposureBound>>();
  const depthExposureExclusions: Array<{
    playerId: number;
    position: Position;
    reason: string;
  }> = [];
  for (const p of input.ratings) {
    if (
      !Number.isInteger(p.playerId) ||
      p.playerId <= 0 ||
      identities.has(p.playerId) ||
      !POSITIONS.includes(p.position) ||
      !["rated", "provisional", "incomplete"].includes(p.status)
    )
      throw new Error("Invalid or duplicate overall-preview player");
    identities.add(p.playerId);
    try {
      if (!Number.isFinite(p.minutes) || p.minutes <= 0)
        throw new Error("Unknown official season exposure");
      if (p.position === "G")
        depthExposures.set(p.playerId, {
          G: { lower: p.minutes, upper: p.minutes },
        });
      else {
        const c = p.componentCoverage.processMinutes;
        if (
          !Number.isFinite(c) ||
          c < 0 ||
          c > NHL_OVERALL_PREVIEW_CONFIG.maximumCoverage
        )
          throw new Error(
            "Insufficient verified family exposure for depth selection",
          );
        const b = impactBreakdown(
          { coefficients: {} },
          p.playerId,
          p.situations,
        );
        for (const situation of Object.keys(p.situations)) {
          const match = /^(\d+)v(\d+):[GE][GE]$/.exec(situation);
          if (
            !match ||
            [Number(match[1]), Number(match[2])].some((n) => n < 3 || n > 6)
          )
            throw new Error("Invalid strength counts in depth exposure");
        }
        const total = Object.values(b.byStrength).reduce(
          (sum, row) => sum + row.minutes,
          0,
        );
        if (
          !Number.isFinite(p.modeledMinutes) ||
          Math.abs(total - p.modeledMinutes) > 0.0003 ||
          Math.abs(total / p.minutes - c) > 0.000051 ||
          total > p.minutes + 1e-8
        )
          throw new Error(
            "Family exposure does not reconcile for depth selection",
          );
        depthExposures.set(
          p.playerId,
          Object.fromEntries(
            ["EV", "PP", "SH", "EN"].map((family) => {
              const lower = b.byStrength[family]?.minutes ?? 0;
              return [
                family,
                {
                  lower,
                  upper: Math.min(
                    p.minutes,
                    lower + Math.max(0, p.minutes - total),
                  ),
                },
              ];
            }),
          ),
        );
      }
    } catch (error) {
      depthExposureExclusions.push({
        playerId: p.playerId,
        position: p.position,
        reason:
          error instanceof Error ? error.message : "Unknown depth exposure",
      });
      const upper =
        Number.isFinite(p.minutes) && p.minutes > 0 ? p.minutes : null;
      depthExposures.set(
        p.playerId,
        Object.fromEntries(
          (p.position === "G" ? ["G"] : ["EV", "PP", "SH", "EN"]).map(
            (family) => [family, { lower: 0, upper }],
          ),
        ),
      );
    }
    if (p.status === "incomplete") {
      exclusions.push({
        playerId: p.playerId,
        status: p.status,
        reason: "Incomplete source evidence",
      });
      continue;
    }
    if (p.status === "provisional") {
      const officialMinutes = p.minutes * p.componentCoverage.officialMinutes;
      if (
        !Number.isFinite(officialMinutes) ||
        officialMinutes <= 0 ||
        officialMinutes >=
          NHL_REPLACEMENT_PREVIEW_CONFIG.lowMinuteThreshold[p.position]
      ) {
        exclusions.push({
          playerId: p.playerId,
          status: p.status,
          reason: "Provisional for reasons beyond a low-minute sample",
        });
        continue;
      }
    }
    if (
      p.position === "G" &&
      (p.abilityPer60 === null || !Number.isFinite(p.abilityPer60))
    ) {
      exclusions.push({
        playerId: p.playerId,
        status: p.status,
        reason:
          "Unknown goalie saving ability; no measured shots-faced evidence",
      });
      continue;
    }
    try {
      prepared.set(p.playerId, prepareOverallPlayer(input, p));
      eligible.push(p);
    } catch (error) {
      exclusions.push({
        playerId: p.playerId,
        status: p.status,
        reason:
          error instanceof Error ? error.message : "Invalid source evidence",
      });
    }
  }
  const familyMinutes = (p: GameSeasonRating, family: string) =>
    prepared.get(p.playerId)!.breakdown.byStrength[family]?.minutes ?? 0;
  const depthMinutes = (p: GameSeasonRating, family: string) =>
    depthExposures.get(p.playerId)![family]!;
  const selectCohort = (
    population: GameSeasonRating[],
    minutesFor: (p: GameSeasonRating) => ExposureBound,
    slotsPerTeam: number,
    label: string,
  ) => {
    const candidates = population.filter(
      (p) => (minutesFor(p).upper ?? Infinity) > 0,
    );
    const unknownExposurePlayerIds = candidates
      .filter((p) => minutesFor(p).lower !== minutesFor(p).upper)
      .map((p) => p.playerId);
    const ranked = [...candidates].sort(
      (a, b) =>
        minutesFor(b).lower - minutesFor(a).lower || a.playerId - b.playerId,
    );
    const requestedRegularPlayers = Math.ceil(
      input.numberOfTeams * slotsPerTeam,
    );
    const cutoff = unknownExposurePlayerIds.length
      ? undefined
      : ranked[Math.min(requestedRegularPlayers, ranked.length) - 1];
    const cutoffMinutes = cutoff ? minutesFor(cutoff).lower : null;
    const memberships = candidates.map((p) => {
      const bound = minutesFor(p);
      const others = candidates.filter((q) => q.playerId !== p.playerId);
      const certainlyGreater = others.filter(
        (q) => minutesFor(q).lower > (bound.upper ?? Infinity),
      ).length;
      const possiblyGreater = others.filter(
        (q) => (minutesFor(q).upper ?? Infinity) > bound.lower,
      ).length;
      const membership =
        certainlyGreater >= requestedRegularPlayers
          ? "certain-replacement"
          : possiblyGreater < requestedRegularPlayers
            ? "certain-regular"
            : "ambiguous";
      return {
        playerId: p.playerId,
        ...bound,
        certainlyGreater,
        possiblyGreater,
        membership,
      };
    });
    const membershipById = new Map(memberships.map((m) => [m.playerId, m]));
    const selected = ranked.filter(
      (p) =>
        membershipById.get(p.playerId)!.membership === "certain-replacement" &&
        minutesFor(p).lower > 0,
    );
    return {
      label,
      slotsPerTeam,
      requestedRegularPlayers,
      positiveExposurePlayers: ranked.filter((p) => minutesFor(p).lower > 0)
        .length,
      possibleExposurePlayers: ranked.length,
      selectionMethod: "conservative-family-exposure-bounds",
      exposureSupported: unknownExposurePlayerIds.length === 0,
      unknownExposurePlayerIds,
      cutoffMinutes,
      regularPlayersIncludingCutoffTies: memberships.filter(
        (m) => m.membership === "certain-regular",
      ).length,
      ambiguousPlayerIds: memberships
        .filter((m) => m.membership === "ambiguous")
        .map((m) => m.playerId),
      unobservedReplacementExposurePlayerIds: memberships
        .filter((m) => m.membership === "certain-replacement" && m.lower === 0)
        .map((m) => m.playerId),
      membershipBounds: memberships,
      replacementPlayerIds: selected.map((p) => p.playerId),
      selected,
    };
  };
  const skaters = input.ratings.filter((p) => p.position !== "G");
  const cohorts = {
    EV_F: selectCohort(
      skaters.filter((p) => p.position === "F"),
      (p) => depthMinutes(p, "EV"),
      depth.F,
      "EV_F",
    ),
    EV_D: selectCohort(
      skaters.filter((p) => p.position === "D"),
      (p) => depthMinutes(p, "EV"),
      depth.D,
      "EV_D",
    ),
    PP: selectCohort(skaters, (p) => depthMinutes(p, "PP"), depth.PP, "PP"),
    SH: selectCohort(skaters, (p) => depthMinutes(p, "SH"), depth.SH, "SH"),
    G: selectCohort(
      input.ratings.filter((p) => p.position === "G"),
      (p) => depthMinutes(p, "G"),
      depth.G,
      "G",
    ),
  };
  const references = Object.fromEntries(
    POSITIONS.map((position) => {
      const cohort =
        position === "G"
          ? cohorts.G
          : position === "F"
            ? cohorts.EV_F
            : cohorts.EV_D;
      const pool = cohort.selected.filter((p) => prepared.has(p.playerId));
      const officialMinutes = pool.reduce(
        (sum, p) => sum + prepared.get(p.playerId)!.officialMinutes,
        0,
      );
      const supported =
        pool.length >= NHL_REPLACEMENT_PREVIEW_CONFIG.minimumReferencePlayers &&
        officialMinutes > 0;
      const rate = (component: "finishing" | "penalties" | "saving") =>
        supported
          ? (60 * pool.reduce((sum, p) => sum + p.components[component], 0)) /
            officialMinutes
          : null;
      const processByFamily: Record<string, ReplacementFamilyReference> = {};
      if (position !== "G")
        for (const family of ["EV", "PP", "SH", "EN"]) {
          const familyCohort =
            family === "PP"
              ? cohorts.PP
              : family === "SH"
                ? cohorts.SH
                : cohort;
          const candidates = familyCohort.selected.filter(
            (p) => p.position === position && prepared.has(p.playerId),
          );
          const observed = candidates.filter(
            (p) => familyMinutes(p, family) > 0,
          );
          const minutes = observed.reduce(
            (sum, p) => sum + familyMinutes(p, family),
            0,
          );
          const familySupported =
            observed.length >=
              NHL_REPLACEMENT_PREVIEW_CONFIG.minimumReferencePlayers &&
            minutes > 0;
          processByFamily[family] = {
            sourceCohort: familyCohort.label,
            candidatePlayers: candidates.length,
            playerIds: observed.map((p) => p.playerId),
            players: observed.length,
            minutes,
            supported: familySupported,
            offensePer60: familySupported
              ? observed.reduce(
                  (sum, p) =>
                    sum +
                    prepared.get(p.playerId)!.breakdown.byStrength[family]!
                      .offense *
                      60,
                  0,
                ) / minutes
              : null,
            againstPer60: familySupported
              ? -observed.reduce(
                  (sum, p) =>
                    sum +
                    prepared.get(p.playerId)!.breakdown.byStrength[family]!
                      .defense *
                      60,
                  0,
                ) / minutes
              : null,
          };
        }
      return [
        position,
        {
          players: pool.length,
          playerIds: pool.map((p) => p.playerId),
          supported,
          sourceCohort: cohort.label,
          officialMinutes,
          finishingPer60: rate("finishing"),
          penaltiesPer60: rate("penalties"),
          savingPer60: position === "G" ? rate("saving") : supported ? 0 : null,
          processByFamily,
        },
      ];
    }),
  ) as Record<
    Position,
    {
      players: number;
      playerIds: number[];
      supported: boolean;
      sourceCohort: string;
      officialMinutes: number;
      finishingPer60: number | null;
      penaltiesPer60: number | null;
      savingPer60: number | null;
      processByFamily: Record<string, ReplacementFamilyReference>;
    }
  >;
  const ratings = input.ratings.map((p) => {
    const reference = references[p.position];
    const own = prepared.get(p.playerId);
    const unsupportedFamilies =
      own && p.position !== "G"
        ? Object.entries(own.breakdown.byStrength)
            .filter(
              ([family, row]) =>
                row.minutes > 0 &&
                !reference.processByFamily[family]?.supported,
            )
            .map(([family]) => family)
        : [];
    const qualification =
      p.status !== "rated" || !own
        ? "unqualified"
        : !reference.supported || unsupportedFamilies.length
          ? "insufficient-reference"
          : "ranked";
    let components: Components | null = null;
    let overallValue: number | null = null;
    if (qualification === "ranked") {
      components = {
        offensiveProcess: 0,
        defensiveProcess: 0,
        finishing:
          p.components.finishing -
          (reference.finishingPer60! * own!.officialMinutes) / 60,
        penalties:
          p.components.penalties -
          (reference.penaltiesPer60! * own!.officialMinutes) / 60,
        saving:
          p.position === "G"
            ? p.components.saving -
              (reference.savingPer60! * own!.officialMinutes) / 60
            : 0,
      };
      if (p.position !== "G")
        for (const [family, values] of Object.entries(
          own!.breakdown.byStrength,
        )) {
          if (!values.minutes) continue;
          const familyReference = reference.processByFamily[family]!;
          components.offensiveProcess +=
            values.offense -
            (familyReference.offensePer60! * values.minutes) / 60;
          components.defensiveProcess +=
            values.defense +
            (familyReference.againstPer60! * values.minutes) / 60;
        }
      overallValue = Object.values(components).reduce(
        (sum, value) => sum + value,
        0,
      );
      if (!Number.isFinite(overallValue))
        throw new Error(`Nonfinite replacement preview: ${p.playerId}`);
    }
    return {
      playerId: p.playerId,
      name: p.name,
      position: p.position,
      status: p.status,
      qualification,
      referenceEligible: prepared.has(p.playerId),
      overallValue,
      overallRank: null as number | null,
      components,
      warnings: [
        ...exclusions
          .filter((e) => e.playerId === p.playerId)
          .map((e) => e.reason),
        ...(p.status === "rated" && !reference.supported
          ? [
              `Insufficient ${p.position} replacement cohort; overall value withheld`,
            ]
          : []),
        ...unsupportedFamilies.map(
          (family) =>
            `Insufficient ${p.position}/${family} replacement exposure; overall value withheld`,
        ),
      ],
    };
  });
  const rankKey = (value: number) =>
    Math.round(value / NHL_OVERALL_PREVIEW_CONFIG.rankResolutionGoals);
  const ranked = ratings.filter((p) => p.overallValue !== null);
  for (const p of ranked)
    p.overallRank =
      1 +
      ranked.filter((q) => rankKey(q.overallValue!) > rankKey(p.overallValue!))
        .length;
  return {
    config: NHL_REPLACEMENT_PREVIEW_CONFIG,
    referenceMode: "nhl-depth-proxy-replacement" as const,
    numberOfTeams: input.numberOfTeams,
    depth,
    warning:
      "Preview: goal contribution above a same-position, playing-time depth proxy for NHL replacement. Cohorts are current-season empirical estimates, not validated readily available talent, causal GAR/WAR, or a calibrated cross-position talent scale. Originally provisional players may supply covered reference evidence but never receive an official rank. No historical bootstrap interval applies.",
    references,
    cohortSelection: Object.fromEntries(
      Object.entries(cohorts).map(
        ([key, { selected: _selected, ...metadata }]) => [key, metadata],
      ),
    ),
    referenceEligibility: {
      eligiblePlayers: eligible.length,
      ratedPlayers: eligible.filter((p) => p.status === "rated").length,
      lowMinuteProvisionalPlayers: eligible.filter(
        (p) => p.status === "provisional",
      ).length,
      exclusions,
      depthExposureExclusions,
      sourceWarnings: eligible
        .filter((p) => p.warnings.length)
        .map((p) => ({ playerId: p.playerId, warnings: [...p.warnings] })),
    },
    ratings: ratings.sort(
      (a, b) =>
        (a.overallRank ?? Infinity) - (b.overallRank ?? Infinity) ||
        a.playerId - b.playerId,
    ),
  };
}
