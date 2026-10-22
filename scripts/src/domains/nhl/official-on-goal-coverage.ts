import type { GameValueData } from "./game-value-input";
import type { SeasonPlayerReference } from "../../runtime/nhl-game-season-value";
import type { NhlRatingSource } from "./season-rating-input";
import {
  validateReviewedOnGoalClassificationGroup,
  type ReviewedOnGoalClassificationGroup,
} from "./official-on-goal-classification";

type PhysicalGame = {
  gameId: number;
  shots: readonly (Pick<
    GameValueData["shots"][number],
    "eventId" | "kind" | "shooter" | "goalie"
  > &
    Partial<Pick<GameValueData["shots"][number], "period" | "second">>)[];
  shotCoverageByPlayer: GameValueData["shotCoverageByPlayer"];
};
function classificationExcess(
  player: { playerId: number; position: string },
  groups: readonly ReviewedOnGoalClassificationGroup[],
  games?: readonly PhysicalGame[],
) {
  const seen = new Set<number>();
  let excess = 0;
  for (const group of groups) {
    validateReviewedOnGoalClassificationGroup(group);
    if (
      group.playerId !== player.playerId ||
      group.position !== player.position ||
      seen.has(group.gameId)
    )
      throw Error("Classification group player/role/reuse differs");
    seen.add(group.gameId);
    if (games) {
      const game = games.find((g) => g.gameId === group.gameId);
      if (!game)
        throw Error("Classification game missing from physical evidence");
      const own = game.shots.filter((s) =>
        player.position === "G"
          ? s.goalie === player.playerId
          : s.shooter === player.playerId,
      );
      const expected = group.events
        .map(({ eventId, kind, shooter, goalie, period, second }) => ({
          eventId,
          kind,
          shooter,
          goalie,
          period,
          second,
        }))
        .sort((a, b) => a.eventId - b.eventId);
      const actual = own
        .map(({ eventId, kind, shooter, goalie, period, second }) => ({
          eventId,
          kind,
          shooter,
          goalie,
          period,
          second,
        }))
        .sort((a, b) => a.eventId - b.eventId);
      const count = game.shotCoverageByPlayer[player.playerId];
      if (
        actual.some(
          (event) =>
            !expected.some(
              (candidate) =>
                JSON.stringify(candidate) === JSON.stringify(event),
            ),
        ) ||
        new Set(actual.map((e) => e.eventId)).size !== actual.length ||
        !count ||
        count.expected !== group.events.length ||
        count.matched !== actual.length ||
        count.expectedOnGoal !== group.primaryLabeledOnGoalAttempts
      )
        throw Error("Classification entire verified physical group differs");
    }
    excess += group.primaryLabeledOnGoalAttempts - group.officialOnGoalAttempts;
  }
  return excess;
}

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Independent season SOG/SA totals establish missing exposure, never event value. */
export function withOfficialOnGoalAttempts<T extends SeasonPlayerReference>(
  reference: readonly T[],
  source: NhlRatingSource,
): Array<T & { officialOnGoalAttempts: number }> {
  const official = new Map<number, { position: string; attempts: number }>();
  for (const [rows, goalie] of [
    [source.skaters.summary, false],
    [source.goalies, true],
  ] as const)
    for (const row of rows) {
      const position = goalie ? "G" : row.positionCode === "D" ? "D" : "F",
        attempts = goalie ? row.shotsAgainst : row.shots;
      if (
        !count(row.playerId) ||
        row.playerId === 0 ||
        row.seasonId !== source.season ||
        official.has(row.playerId) ||
        !count(attempts) ||
        (!goalie && !["C", "L", "R", "D"].includes(String(row.positionCode)))
      )
        throw new Error("Invalid official on-goal source identity/total");
      official.set(row.playerId, { position, attempts });
    }
  const seen = new Set<number>();
  return reference.map((p) => {
    const row = official.get(p.playerId);
    if (
      seen.has(p.playerId) ||
      !row ||
      row.position !== p.position ||
      (p.officialOnGoalAttempts !== undefined &&
        p.officialOnGoalAttempts !== row.attempts)
    )
      throw new Error("Official on-goal reference identity/role/total differs");
    seen.add(p.playerId);
    return { ...p, officialOnGoalAttempts: row.attempts };
  });
}

export function summarizeOfficialOnGoalCoverage(
  games: readonly PhysicalGame[],
  reference: readonly SeasonPlayerReference[],
) {
  if (
    new Set(games.map((g) => g.gameId)).size !== games.length ||
    new Set(reference.map((p) => p.playerId)).size !== reference.length
  )
    throw new Error("Duplicate official on-goal evidence identity");
  const players = reference
    .filter((p) => p.officialOnGoalAttempts !== undefined)
    .map((p) => {
      const officialOnGoalAttempts = p.officialOnGoalAttempts;
      if (!count(officialOnGoalAttempts))
        throw new Error("Invalid official on-goal total");
      let observedExpectedOnGoal = 0,
        verifiedOnGoalAttempts = 0,
        expectedAttempts = 0,
        matchedAttempts = 0;
      for (const game of games) {
        const coverage = game.shotCoverageByPlayer[p.playerId];
        if (coverage) {
          if (
            !count(coverage.expectedOnGoal) ||
            !count(coverage.expected) ||
            !count(coverage.matched) ||
            coverage.expectedOnGoal > coverage.expected ||
            coverage.matched > coverage.expected
          )
            throw new Error("Missing/invalid raw on-goal exposure counters");
          observedExpectedOnGoal += coverage.expectedOnGoal;
          expectedAttempts += coverage.expected;
          matchedAttempts += coverage.matched;
        }
        verifiedOnGoalAttempts += game.shots.filter(
          (s) =>
            (s.kind === "SHOT" || s.kind === "GOAL") &&
            (p.position === "G"
              ? s.goalie === p.playerId
              : s.shooter === p.playerId),
        ).length;
      }
      const reviewedGroups = p.reviewedOnGoalClassifications ?? [];
      const reviewedClassificationExcess = classificationExcess(
        p,
        reviewedGroups,
        games,
      );
      if (
        reviewedGroups.reduce((n, g) => n + g.officialOnGoalAttempts, 0) >
        officialOnGoalAttempts
      )
        throw Error(
          "Classification reviewed official counts exceed season total",
        );
      if (
        verifiedOnGoalAttempts >
          officialOnGoalAttempts + reviewedClassificationExcess ||
        verifiedOnGoalAttempts > observedExpectedOnGoal
      )
        throw new Error(
          "Verified on-goal credits exceed official/raw exposure",
        );
      const missingOnGoalAttempts = Math.max(
          0,
          officialOnGoalAttempts +
            reviewedClassificationExcess -
            observedExpectedOnGoal,
        ),
        effectiveExpectedAttempts = expectedAttempts + missingOnGoalAttempts;
      return {
        playerId: p.playerId,
        position: p.position,
        officialOnGoalAttempts,
        observedExpectedOnGoal,
        verifiedOnGoalAttempts,
        ...(reviewedGroups.length
          ? {
              reviewedClassificationExcess,
              reviewedClassificationGroups: structuredClone(reviewedGroups),
            }
          : {}),
        missingOnGoalAttempts,
        expectedAttempts,
        matchedAttempts,
        effectiveExpectedAttempts,
        individualCoverage: effectiveExpectedAttempts
          ? matchedAttempts / effectiveExpectedAttempts
          : 1,
      };
    });
  return {
    version: "nhl-official-on-goal-coverage-v1" as const,
    games: games.length,
    players,
    missingOnGoalAttempts: players.reduce(
      (n, p) => n + p.missingOnGoalAttempts,
      0,
    ),
  };
}

export function assertOfficialOnGoalQualification(
  source: NhlRatingSource,
  coverage: ReturnType<typeof summarizeOfficialOnGoalCoverage>,
  ratings: readonly {
    playerId: number;
    position: string;
    status: string;
    componentCoverage: { individualShots: number };
  }[],
) {
  const refs = withOfficialOnGoalAttempts(
    ratings.map((p) => ({
      ...p,
      name: "",
      games: 0,
      minutes: 0,
      position: p.position as SeasonPlayerReference["position"],
    })),
    source,
  );
  if (
    coverage.players.length !== ratings.length ||
    new Set(coverage.players.map((p) => p.playerId)).size !== ratings.length
  )
    throw new Error("Official on-goal publication population differs");
  for (const p of refs) {
    const row = coverage.players.find((r) => r.playerId === p.playerId);
    const groups = row?.reviewedClassificationGroups ?? [];
    const excess = classificationExcess(p, groups);
    if (
      !row ||
      (row.reviewedClassificationExcess ?? 0) !== excess ||
      groups.reduce((n, g) => n + g.officialOnGoalAttempts, 0) >
        p.officialOnGoalAttempts ||
      row.position !== p.position ||
      row.officialOnGoalAttempts !== p.officialOnGoalAttempts ||
      !count(row.verifiedOnGoalAttempts) ||
      row.verifiedOnGoalAttempts > row.officialOnGoalAttempts + excess ||
      row.verifiedOnGoalAttempts > row.observedExpectedOnGoal ||
      !count(row.observedExpectedOnGoal) ||
      !count(row.expectedAttempts) ||
      !count(row.matchedAttempts) ||
      row.matchedAttempts > row.expectedAttempts ||
      row.observedExpectedOnGoal > row.expectedAttempts ||
      row.missingOnGoalAttempts !==
        Math.max(
          0,
          row.officialOnGoalAttempts + excess - row.observedExpectedOnGoal,
        ) ||
      row.effectiveExpectedAttempts !==
        row.expectedAttempts + row.missingOnGoalAttempts ||
      row.individualCoverage !==
        (row.effectiveExpectedAttempts
          ? row.matchedAttempts / row.effectiveExpectedAttempts
          : 1) ||
      p.componentCoverage.individualShots !==
        Math.round(row.individualCoverage * 10000) / 10000 ||
      (row.individualCoverage < 0.95 && p.status === "rated")
    )
      throw new Error(
        "Published qualification conceals official on-goal deficit",
      );
  }
}

/** The official season SOG comparator covers skaters. A known goalie's own shot
 * stays in physical attempt exposure, but cannot cancel another skater's gap. */
export function countObservedSkaterOnGoalAttempts(raw: unknown): number {
  const value = raw as {
    rosterSpots?: Array<{ playerId: number; positionCode: string }>;
    plays?: Array<{
      typeDescKey?: string;
      periodDescriptor?: { periodType?: string };
      details?: { shootingPlayerId?: number; scoringPlayerId?: number };
    }>;
  };
  if (
    !value ||
    (value.rosterSpots !== undefined && !Array.isArray(value.rosterSpots)) ||
    !Array.isArray(value.plays)
  )
    throw Error("Missing raw skater-on-goal population");
  const goalies = new Set(
    (value.rosterSpots ?? [])
      .filter((p) => p.positionCode === "G")
      .map((p) => p.playerId),
  );
  return value.plays.filter(
    (p) =>
      p.periodDescriptor?.periodType !== "SO" &&
      ["shot-on-goal", "goal"].includes(p.typeDescKey ?? "") &&
      !goalies.has(
        Number(p.details?.shootingPlayerId ?? p.details?.scoringPlayerId),
      ),
  ).length;
}

/** One accounting rule shared by preparation, valuation and independent replay. */
export function summarizeOfficialSourceCoverage(
  games: readonly (Pick<
    GameValueData,
    "gameId" | "gameSeconds" | "usableProcessSeconds" | "officialShots"
  > & { shots: readonly unknown[] })[],
  reference: readonly SeasonPlayerReference[],
  source: NhlRatingSource,
  observedSkaterOnGoalAttempts: number,
  scope: { officialGames: number; officialSeasonExposureMatches: boolean },
) {
  const refs = withOfficialOnGoalAttempts(reference, source);
  if (
    !count(observedSkaterOnGoalAttempts) ||
    !count(scope.officialGames) ||
    scope.officialGames === 0 ||
    typeof scope.officialSeasonExposureMatches !== "boolean" ||
    new Set(games.map((g) => g.gameId)).size !== games.length
  )
    throw Error("Invalid global official source exposure scope");
  for (const game of games)
    if (
      ![game.gameSeconds, game.usableProcessSeconds].every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      !count(game.officialShots) ||
      game.usableProcessSeconds > game.gameSeconds
    )
      throw Error("Invalid global physical exposure counters");
  const officialSkaterOnGoalAttempts = source.skaters.summary.reduce(
    (n, p) => n + Number(p.shots),
    0,
  );
  const reviewedPrimaryLabelExcess = refs
    .filter((p) => p.position !== "G")
    .reduce(
      (n, p) =>
        n + classificationExcess(p, p.reviewedOnGoalClassifications ?? []),
      0,
    );
  const rawObservedAttempts = games.reduce((n, g) => n + g.officialShots, 0);
  const absentOnGoalAttemptsLowerBound = Math.max(
    0,
    officialSkaterOnGoalAttempts +
      reviewedPrimaryLabelExcess -
      observedSkaterOnGoalAttempts,
  );
  const coverage = {
    officialSeconds: games.reduce((n, g) => n + g.gameSeconds, 0),
    usableSeconds: games.reduce((n, g) => n + g.usableProcessSeconds, 0),
    officialShots: rawObservedAttempts + absentOnGoalAttemptsLowerBound,
    verifiedShots: games.reduce((n, g) => n + g.shots.length, 0),
  };
  return {
    coverage,
    sourceGates: {
      officialSeasonExposureMatches: scope.officialSeasonExposureMatches,
      completeDownload: games.length === scope.officialGames,
      atLeast98PercentProcessExposureVerified:
        coverage.officialSeconds > 0 &&
        coverage.usableSeconds / coverage.officialSeconds >= 0.98,
      atLeast98PercentIndividualShotsVerified:
        coverage.officialShots > 0 &&
        coverage.verifiedShots / coverage.officialShots >= 0.98,
    },
    onGoalAccounting: {
      rawObservedAttempts,
      officialSkaterOnGoalAttempts,
      observedSkaterOnGoalAttempts,
      reviewedPrimaryLabelExcess,
      absentOnGoalAttemptsLowerBound,
    },
  };
}
