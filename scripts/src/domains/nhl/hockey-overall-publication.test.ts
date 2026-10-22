import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  prepareHockeyOverallPublication,
  type HockeyInferenceProof,
  type HockeyValueReport,
} from "./hockey-overall-publication";
import { rankNhlReplacementPreview } from "../../runtime/nhl-overall-rating";
import type { GameSeasonRating } from "../../runtime/nhl-game-season-value";
import type { NhlRatingSource } from "./season-rating-input";
import { validateSeasonValue } from "../../../../convex/nhlSeasonValues";
import { summarizeOfficialGoalCoverage } from "./official-goal-coverage";
import {
  summarizeOfficialOnGoalCoverage,
  withOfficialOnGoalAttempts,
} from "./official-on-goal-coverage";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function fixture(teams = 1) {
  const ratings: GameSeasonRating[] = Array.from({ length: 8 }, (_, i) => {
    const minutes = [1000, 900, 800, 100, 90, 80, 70, 60][i],
      saving = (minutes * (i === 0 ? -1 : i === 1 ? 0.5 : -0.3)) / 60,
      status = i < 3 ? "rated" : "provisional";
    return {
      playerId: i + 1,
      name: `Goalie${i + 1}`,
      position: "G",
      status,
      games: 10,
      verifiedGames: 10,
      includedGames: 10,
      minutes,
      modeledMinutes: minutes,
      coverage: 1,
      componentCoverage: {
        officialMinutes: 1,
        processMinutes: 0,
        individualShots: 1,
        missingGoals: 0,
      },
      seasonValue: saving,
      observedValue: saving,
      abilityPer60: (saving * 60) / minutes,
      seasonRank: null,
      abilityRank: i < 3 ? i + 1 : null,
      seasonRating: null,
      components: {
        adjustedProcess: 0,
        observedProcess: 0,
        finishing: 0,
        penalties: 0,
        saving,
      },
      situations: {},
      samplingInterval: null,
      warnings: [],
    };
  });
  const source: { nhl: NhlRatingSource } = {
    nhl: {
      season: 20242025,
      gameType: 2,
      profile: "core",
      fetchedAt: "2025-07-01T00:00:00Z",
      skaters: {
        summary: [],
        timeonice: [],
        scoringRates: [],
        goalsForAgainst: [],
        powerplay: [],
        penaltykill: [],
      },
      goalies: ratings.map((p, i) => ({
        playerId: p.playerId,
        seasonId: 20242025,
        goalieFullName: p.name,
        teamAbbrevs: `AA${String.fromCharCode(65 + (i % teams))}`,
        gamesPlayed: p.games,
        timeOnIce: p.minutes * 60,
      })),
      edge: {},
      warnings: [],
    },
  };
  const sourceText = JSON.stringify(source);
  const proof: HockeyInferenceProof = {
    passed: true,
    sourceRowsSha256: "1".repeat(64),
    sourceRowsFileSha256: "2".repeat(64),
    analysisSha256: "3".repeat(64),
    predictionsSha256: "4".repeat(64),
    foldManifestSha256: "5".repeat(64),
    foldFitManifestSha256: "6".repeat(64),
    shots: 1000,
    games: 10,
    maximumGbProbabilityError: 0,
    maximumGlmProbabilityError: 0,
  };
  const report: HockeyValueReport = {
    version: "nhl-retrospective-season-values-research-v1",
    season: 20242025,
    gameType: 2,
    provenance: {
      season: 20242025,
      canonicalSourceSha256: hash(sourceText),
      rowsSha256: proof.sourceRowsSha256,
      allRowInferenceAudit: { ...proof },
      codeHashes: [],
    },
    sourceGates: {
      officialSeasonExposureMatches: true,
      completeDownload: true,
      atLeast98PercentProcessExposureVerified: true,
      atLeast98PercentIndividualShotsVerified: true,
    },
    residualCreditAudit: {
      gb: {
        passed: true,
        maximumPlayerError: 0,
        perPlayerRoundingTolerance: 0.000050001,
        unrepresentedEventPlayers: [],
      },
    },
    qualificationInvariant: { passed: true, players: ratings.length },
    gb: {
      model: {
        coefficients: {},
        lambda: 4,
        converged: true,
        iterations: 1,
        trainingGames: 10,
        trainingRows: 20,
        sourceRows: 20,
        relativeResidual: 0,
      },
      ratings,
    },
    glm: { ratings: structuredClone(ratings) },
  };
  const overall = {
    version: "nhl-retrospective-overall-research-v1",
    season: 20242025,
    gb: rankNhlReplacementPreview({ ...report.gb, numberOfTeams: teams }),
  };
  const audit = {
    version: "nhl-retrospective-value-source-audit-v1",
    provenance: report.provenance,
    sourceGates: report.sourceGates,
    coverage: {
      officialSeconds: 100,
      usableSeconds: 100,
      officialShots: 1000,
      verifiedShots: 1000,
    },
  };
  const policyText =
    "# Reviewed NHL hockey overall method\nStatus: **SEALED fixed production method**\n";
  const input = () => ({
    season: 20242025,
    sourceText,
    valueText: JSON.stringify(report),
    overallText: JSON.stringify(overall),
    auditText: JSON.stringify(audit),
    policyText,
    policyHash: hash(policyText),
    nativeInference: proof,
  });
  return { report, overall, audit, proof, input };
}
test("fresh goal proof is mandatory for guarded reports and rejects stale bindings or retained ledgers", () => {
  const f = fixture(),
    coverage = { ...summarizeOfficialGoalCoverage([], []), games: 10 };
  f.report.provenance.gameSourcesHash = "7".repeat(64);
  f.report.officialGoalCoverage = {
    glm: coverage,
    gb: structuredClone(coverage),
  };
  const base = {
    ...f.input(),
    auditText: JSON.stringify({
      ...f.audit,
      officialGoalCoverage: f.report.officialGoalCoverage,
    }),
  };
  const proof = {
    passed: true,
    season: 20242025,
    gameType: 2,
    canonicalSourceSha256: f.report.provenance.canonicalSourceSha256,
    gameSourcesHash: f.report.provenance.gameSourcesHash,
    goalCoverage: coverage,
  };
  assert.throws(
    () => prepareHockeyOverallPublication(base),
    /independent official goal/,
  );
  assert.doesNotThrow(() =>
    prepareHockeyOverallPublication({ ...base, officialGoalProof: proof }),
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: { ...proof, passed: false },
      }),
    /independent official goal/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: { ...proof, canonicalSourceSha256: "8".repeat(64) },
      }),
    /independent official goal/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: {
          ...proof,
          goalCoverage: { ...coverage, games: 9 },
        },
      }),
    /ledger differs/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: proof,
        auditText: JSON.stringify(f.audit),
      }),
    /audit and value report/,
  );
});

test("official SOG/SA guarded publication needs fresh matching evidence and cannot hide coverage deficits", () => {
  const f = fixture(),
    source = JSON.parse(f.input().sourceText) as { nhl: NhlRatingSource };
  for (const goalie of source.nhl.goalies) goalie.shotsAgainst = 0;
  const sourceText = JSON.stringify(source);
  f.report.provenance.canonicalSourceSha256 = hash(sourceText);
  f.report.provenance.gameSourcesHash = "7".repeat(64);
  const goalCoverage = { ...summarizeOfficialGoalCoverage([], []), games: 10 };
  const onGoalCoverage = {
    ...summarizeOfficialOnGoalCoverage(
      [],
      withOfficialOnGoalAttempts(f.report.gb.ratings, source.nhl),
    ),
    games: 10,
  };
  f.report.officialGoalCoverage = {
    glm: goalCoverage,
    gb: structuredClone(goalCoverage),
  };
  f.report.officialOnGoalCoverage = {
    glm: onGoalCoverage,
    gb: structuredClone(onGoalCoverage),
  };
  const proof = {
    passed: true,
    season: 20242025,
    gameType: 2,
    canonicalSourceSha256: hash(sourceText),
    gameSourcesHash: f.report.provenance.gameSourcesHash,
    goalCoverage,
    onGoalCoverage,
    sourceCoverage: {
      coverage: { ...f.audit.coverage },
      sourceGates: {
        officialSeasonExposureMatches:
          f.report.sourceGates.officialSeasonExposureMatches,
        completeDownload: f.report.sourceGates.completeDownload,
        atLeast98PercentProcessExposureVerified:
          f.report.sourceGates.atLeast98PercentProcessExposureVerified,
        atLeast98PercentIndividualShotsVerified:
          f.report.sourceGates.atLeast98PercentIndividualShotsVerified,
      },
      onGoalAccounting: {
        rawObservedAttempts: 1000,
        officialSkaterOnGoalAttempts: 0,
        observedSkaterOnGoalAttempts: 0,
        reviewedPrimaryLabelExcess: 0,
        absentOnGoalAttemptsLowerBound: 0,
      },
    },
  };
  const base = {
    ...f.input(),
    sourceText,
    auditText: JSON.stringify({
      ...f.audit,
      officialGoalCoverage: f.report.officialGoalCoverage,
      officialOnGoalCoverage: f.report.officialOnGoalCoverage,
    }),
  };
  assert.doesNotThrow(() =>
    prepareHockeyOverallPublication({ ...base, officialGoalProof: proof }),
  );
  const { sourceCoverage: _globalOmitted, ...individualOnly } = proof;
  void _globalOmitted;
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: individualOnly,
      }),
    /Fresh aggregate/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: {
          ...proof,
          sourceCoverage: {
            ...proof.sourceCoverage,
            coverage: {
              ...proof.sourceCoverage.coverage,
              officialShots: proof.sourceCoverage.coverage.officialShots + 1,
            },
          },
        },
      }),
    /Fresh aggregate/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: {
          ...proof,
          sourceCoverage: {
            ...proof.sourceCoverage,
            sourceGates: {
              ...proof.sourceCoverage.sourceGates,
              atLeast98PercentIndividualShotsVerified: false,
            },
          },
        },
      }),
    /Fresh aggregate/,
  );
  const { onGoalCoverage: _omitted, ...goalOnly } = proof;
  assert.throws(
    () =>
      prepareHockeyOverallPublication({ ...base, officialGoalProof: goalOnly }),
    /official on-goal coverage proof/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        officialGoalProof: {
          ...proof,
          onGoalCoverage: { ...onGoalCoverage, games: 9 },
        },
      }),
    /on-goal ledger differs/,
  );
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        auditText: JSON.stringify({
          ...f.audit,
          officialGoalCoverage: f.report.officialGoalCoverage,
        }),
        officialGoalProof: proof,
      }),
    /on-goal audit and value report/,
  );
  const forged = structuredClone(onGoalCoverage);
  Object.assign(forged.players[0]!, {
    officialOnGoalAttempts: 10,
    observedExpectedOnGoal: 0,
    verifiedOnGoalAttempts: 0,
    missingOnGoalAttempts: 10,
    effectiveExpectedAttempts: 10,
    individualCoverage: 0,
  });
  // Canonical SA agrees with the missing-event ledger; only the retained rated
  // status/coverage is false. Do not merely exercise a mismatched source total.
  const deficientSource = structuredClone(source);
  deficientSource.nhl.goalies[0]!.shotsAgainst = 10;
  const deficientText = JSON.stringify(deficientSource);
  const deficientReport = structuredClone(f.report);
  deficientReport.provenance.canonicalSourceSha256 = hash(deficientText);
  deficientReport.officialOnGoalCoverage = {
    glm: forged,
    gb: structuredClone(forged),
  };
  assert.throws(
    () =>
      prepareHockeyOverallPublication({
        ...base,
        sourceText: deficientText,
        valueText: JSON.stringify(deficientReport),
        auditText: JSON.stringify({
          ...f.audit,
          provenance: deficientReport.provenance,
          officialGoalCoverage: deficientReport.officialGoalCoverage,
          officialOnGoalCoverage: deficientReport.officialOnGoalCoverage,
        }),
        officialGoalProof: {
          ...proof,
          canonicalSourceSha256: hash(deficientText),
          onGoalCoverage: forged,
        },
      }),
    /on-goal deficit/,
  );
});

test("publishes exact signed annual values/global rank with separate ability and no display score", () => {
  const f = fixture();
  f.report.gb.ratings[0].warnings = [
    "Some penalties are unpriced in source evidence",
    "Some penalties are unpriced in source evidence",
  ];
  f.overall.gb = rankNhlReplacementPreview({
    ...f.report.gb,
    numberOfTeams: 1,
  });
  const input = f.input(),
    copy = structuredClone(input),
    prepared = prepareHockeyOverallPublication(input);
  assert.equal(
    prepared.metadata.modelVersion,
    "nhl-hockey-overall-reviewed-v1",
  );
  assert.ok(
    prepared.results.some((p) => p.seasonValue !== null && p.seasonValue < 0),
  );
  assert.equal(
    prepared.results
      .find((p) => p.nhlPlayerId === 1)!
      .hockeyOverall.warnings.filter(
        (warning) =>
          warning === "Some penalties are unpriced in source evidence",
      ).length,
    1,
  );
  for (const p of prepared.results) {
    const original = f.overall.gb.ratings.find(
      (q) => q.playerId === p.nhlPlayerId,
    )!;
    assert.equal(p.seasonValue, original.overallValue);
    assert.equal(p.rank, original.overallRank);
    assert.equal(p.seasonRating, null);
    assert.equal(p.impactPer60, null);
    validateSeasonValue(p, prepared.metadata.modelVersion);
  }
  assert.deepEqual(input, copy);
  assert.deepEqual(prepareHockeyOverallPublication(input), prepared);
});
test("maps unqualified provisional rows without inventing a value or changing source status", () => {
  const p = prepareHockeyOverallPublication(fixture().input()).results.find(
    (p) => p.status === "provisional",
  )!;
  assert.equal(p.hockeyOverall.qualification, "provisional");
  assert.equal(p.seasonValue, null);
  assert.equal(p.rank, null);
  assert.equal(p.hockeyOverall.abilityPositionRank, null);
  assert.notEqual(p.hockeyOverall.abilityPer60, null);
});
test("keeps rated-but-unsupported reference rows rated with withheld overall value", () => {
  const prepared = prepareHockeyOverallPublication(fixture(2).input());
  const p = prepared.results.find((p) => p.status === "rated")!;
  assert.equal(p.hockeyOverall.qualification, "insufficient-reference");
  assert.equal(p.seasonValue, null);
  assert.equal(p.rank, null);
  assert.deepEqual(p.missing, []);
  validateSeasonValue(p, prepared.metadata.modelVersion);
});
test("rejects altered overall math, unsupported physical gates and stale native evidence", () => {
  const f = fixture();
  f.overall.gb.ratings[0].overallValue! += 1;
  assert.throws(
    () => prepareHockeyOverallPublication(f.input()),
    /exactly reproduce/,
  );
  const g = fixture();
  g.audit.coverage.usableSeconds = 97;
  assert.throws(
    () => prepareHockeyOverallPublication(g.input()),
    /coverage evidence/,
  );
  const h = fixture();
  h.proof.predictionsSha256 = "f".repeat(64);
  assert.throws(
    () => prepareHockeyOverallPublication(h.input()),
    /inference proof differs/,
  );
  const wrongTeams = fixture();
  wrongTeams.overall.gb.numberOfTeams = 2;
  assert.throws(
    () => prepareHockeyOverallPublication(wrongTeams.input()),
    /independently observed official teams/,
  );
  const unknownTeam = fixture();
  const unknownInput = unknownTeam.input();
  const unknownSource = JSON.parse(unknownInput.sourceText);
  unknownSource.nhl.goalies[0].teamAbbrevs = "TOT";
  unknownInput.sourceText = JSON.stringify(unknownSource);
  unknownTeam.report.provenance.canonicalSourceSha256 = hash(
    unknownInput.sourceText,
  );
  const changed = unknownTeam.input();
  changed.sourceText = unknownInput.sourceText;
  assert.throws(
    () => prepareHockeyOverallPublication(changed),
    /team abbreviations are incomplete/,
  );
});
test("rejects false retained proof and invalid per-player rounding tolerance", () => {
  const f = fixture();
  f.report.provenance.allRowInferenceAudit.passed = false;
  assert.throws(
    () => prepareHockeyOverallPublication(f.input()),
    /native all-row/,
  );
  const g = fixture();
  g.report.residualCreditAudit.gb.perPlayerRoundingTolerance = -1;
  assert.throws(
    () => prepareHockeyOverallPublication(g.input()),
    /event-credit/,
  );
  const h = fixture();
  h.report.residualCreditAudit.gb.maximumPlayerError = 0.00004;
  h.report.residualCreditAudit.gb.perPlayerRoundingTolerance = 0.00003;
  assert.throws(
    () => prepareHockeyOverallPublication(h.input()),
    /event-credit/,
  );
});
