import { createHash } from "node:crypto";
import { NHL_ADJUSTED_IMPACT_CONFIG } from "../../runtime/nhl-adjusted-impact";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { PenaltyShotHistory } from "../../runtime/nhl-shot-quality";
import type { VerifiedShot } from "./game-value-input";
import {
  gameSourceCoverage,
  type GameCoverageEvidence,
} from "./game-value-coverage";
import {
  buildNhlRatingInput,
  type NhlRatingSource,
} from "./season-rating-input";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function verifySeasonPenaltyShots(
  season: number,
  rows: PenaltyShotHistory["rows"],
  games: Array<{
    gameId: number;
    penaltyShots: Array<Pick<VerifiedShot, "eventId" | "shooter" | "kind">>;
  }>,
) {
  const expected = new Map<number, { attempts: number; goals: number }>();
  for (const row of rows) {
    if (
      row.seasonId !== season ||
      expected.has(row.playerId) ||
      !Number.isInteger(row.playerId) ||
      row.playerId <= 0 ||
      !Number.isInteger(row.penaltyShotAttempts) ||
      row.penaltyShotAttempts < 0 ||
      !Number.isInteger(row.penaltyShotsGoals) ||
      row.penaltyShotsGoals < 0 ||
      row.penaltyShotsGoals > row.penaltyShotAttempts
    )
      throw new Error("Invalid official season penalty-shot totals");
    expected.set(row.playerId, {
      attempts: row.penaltyShotAttempts,
      goals: row.penaltyShotsGoals,
    });
  }
  const actual = new Map<number, { attempts: number; goals: number }>();
  const seen = new Set<string>();
  for (const game of games)
    for (const shot of game.penaltyShots) {
      const key = `${game.gameId}:${shot.eventId}`;
      if (seen.has(key) || !["GOAL", "SHOT", "MISS"].includes(shot.kind))
        throw new Error("Invalid penalty-shot audit event");
      seen.add(key);
      const total = actual.get(shot.shooter) ?? { attempts: 0, goals: 0 };
      total.attempts++;
      total.goals += shot.kind === "GOAL" ? 1 : 0;
      actual.set(shot.shooter, total);
    }
  const mismatches = [
    ...new Set([...expected.keys(), ...actual.keys()]),
  ].filter(
    (id) =>
      (expected.get(id)?.attempts ?? 0) !== (actual.get(id)?.attempts ?? 0) ||
      (expected.get(id)?.goals ?? 0) !== (actual.get(id)?.goals ?? 0),
  );
  if (mismatches.length)
    throw new Error(
      `Penalty-shot totals differ for NHL players: ${mismatches.join(", ")}`,
    );
  return {
    season,
    players: actual.size,
    attempts: seen.size,
    goals: [...actual.values()].reduce((n, p) => n + p.goals, 0),
    matches: true,
    officialSourceHash: hash(JSON.stringify(rows)),
  };
}

/** Validate the immutable calculation artifacts before constructing a production batch. */
export function prepareGameValuePublication(input: {
  season: number;
  sourceText: string;
  priorText: string;
  reportText: string;
  auditText: string;
}) {
  const source = JSON.parse(input.sourceText) as { nhl: NhlRatingSource };
  const report = JSON.parse(input.reportText) as {
    version: string;
    season: number;
    gameType: number;
    config: unknown;
    sourceHash: string;
    priorHash: string;
    gameSourcesHash: string;
    completeSourceScope: boolean;
    probabilitySource: string;
    qualityGate: {
      passes: boolean;
      gates: Record<string, boolean>;
      policy?: string;
      sourceCoverage?: ReturnType<typeof gameSourceCoverage>;
    };
    referenceReconciliation: { matches: boolean };
    inclusion: { includedGames: number; fullyVerifiedGames: number };
    ratings: GameSeasonRating[];
  };
  const audit = JSON.parse(input.auditText) as {
    season: number;
    officialGames: number;
    loadedGames: number;
    failed: unknown[];
    gameSourceHashes: Array<{ gameId: number; sha256: string }>;
    games: Array<{ gameId: number; eligible: boolean } & GameCoverageEvidence>;
  };
  const requiredGates = [
    "officialSeasonExposureMatches",
    "completeDownload",
    "impactModelsConverged",
    "shotModelsConverged",
    "atLeast100HeldOutGames",
    "heldOutSituationCoverage",
    "improvesHeldOutXg",
    "improvesHeldOutGoals",
    "shotModelBeatsConstant",
    "shotGoalTotalWithin10Percent",
  ];
  if (report.qualityGate.policy === "verified-components-v1") {
    const coverage = gameSourceCoverage(audit.games);
    if (
      coverage.processFraction < 0.98 ||
      coverage.individualShotFraction < 0.98 ||
      report.qualityGate.gates.atLeast98PercentProcessExposureVerified !==
        true ||
      report.qualityGate.gates.atLeast98PercentIndividualShotsVerified !==
        true ||
      !report.qualityGate.sourceCoverage ||
      Object.entries(coverage).some(
        ([key, value]) =>
          report.qualityGate.sourceCoverage![key as keyof typeof coverage] !==
          value,
      )
    )
      throw new Error("Unverified component coverage evidence");
  } else if (
    report.qualityGate.policy !== undefined ||
    report.qualityGate.gates.atLeast95PercentGamesVerified !== true ||
    audit.games.filter((g) => g.eligible).length / audit.officialGames < 0.95
  ) {
    throw new Error("Unverified legacy game coverage gate");
  }
  if (
    report.version !== NHL_ADJUSTED_IMPACT_CONFIG.version ||
    JSON.stringify(report.config) !==
      JSON.stringify(NHL_ADJUSTED_IMPACT_CONFIG) ||
    [source.nhl.season, report.season, audit.season].some(
      (s) => s !== input.season,
    ) ||
    source.nhl.gameType !== 2 ||
    report.gameType !== 2 ||
    report.probabilitySource !== "nhl" ||
    !report.completeSourceScope ||
    !report.qualityGate.passes ||
    !report.referenceReconciliation.matches ||
    requiredGates.some((g) => report.qualityGate.gates[g] !== true) ||
    report.sourceHash !== hash(input.sourceText) ||
    report.priorHash !== hash(input.priorText) ||
    report.gameSourcesHash !== hash(JSON.stringify(audit.gameSourceHashes)) ||
    audit.failed.length ||
    audit.officialGames <= 0 ||
    audit.officialGames !== audit.loadedGames ||
    audit.games.length !== audit.loadedGames ||
    audit.gameSourceHashes.length !== audit.loadedGames ||
    new Set(audit.games.map((g) => g.gameId)).size !== audit.loadedGames ||
    new Set(audit.gameSourceHashes.map((g) => g.gameId)).size !==
      audit.loadedGames ||
    audit.games.some(
      (g) => !audit.gameSourceHashes.some((s) => s.gameId === g.gameId),
    ) ||
    report.inclusion.includedGames !== audit.loadedGames ||
    report.inclusion.fullyVerifiedGames !==
      audit.games.filter((g) => g.eligible).length
  )
    throw new Error(
      `Unverified v3 artifacts or failed quality gates for ${input.season}`,
    );
  const reference = buildNhlRatingInput(source.nhl).players.filter(
    (p) => p.games > 0 && p.minutes > 0,
  );
  const byId = new Map(reference.map((p) => [p.playerId, p]));
  if (
    report.ratings.length !== reference.length ||
    new Set(report.ratings.map((p) => p.playerId)).size !== reference.length
  )
    throw new Error("Rating population differs from official season");
  const results = report.ratings.map((p) => {
    const expected = byId.get(p.playerId);
    if (
      !expected ||
      p.games !== expected.games ||
      p.minutes !== expected.minutes ||
      p.position !== expected.position ||
      p.includedGames !== p.games ||
      p.componentCoverage.officialMinutes < 0.999 ||
      p.status === "incomplete" ||
      p.seasonValue === null
    )
      throw new Error(`Incomplete or mismatched player ${p.playerId}`);
    const {
      playerId,
      name,
      position,
      games,
      minutes,
      status,
      seasonValue,
      seasonRating,
      seasonRank,
      ...details
    } = p;
    return {
      nhlPlayerId: playerId,
      name,
      team: expected.team,
      position,
      games,
      minutes,
      status,
      seasonValue,
      seasonRating,
      rank: seasonRank,
      impactPer60: null,
      missing: [] as string[],
      gameValue: { revision: NHL_ADJUSTED_IMPACT_CONFIG.revision, ...details },
    };
  });
  return {
    metadata: {
      nhlSeason: input.season,
      gameType: 2 as const,
      profile: "core" as const,
      modelVersion: report.version,
      sourceFetchedAt: Date.parse(source.nhl.fetchedAt),
      sourceHash: hash(
        JSON.stringify([
          input.sourceText,
          input.priorText,
          input.reportText,
          input.auditText,
        ]),
      ),
    },
    results,
  };
}
