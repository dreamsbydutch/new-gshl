import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  prepareGameValuePublication,
  verifySeasonPenaltyShots,
} from "./game-value-publication";
import { NHL_ADJUSTED_IMPACT_CONFIG } from "../../runtime/nhl-adjusted-impact";
import { applySourceCoveragePolicy } from "./game-value-coverage";

const hash = (x: string) => createHash("sha256").update(x).digest("hex");
test("penalty-shot publication check includes misses and rejects omissions, wrong attribution and duplicates", () => {
  const rows = [
    {
      seasonId: 20242025,
      playerId: 1,
      penaltyShotAttempts: 2,
      penaltyShotsGoals: 1,
    },
  ];
  const shots = [
    { eventId: 1, shooter: 1, kind: "GOAL" },
    { eventId: 2, shooter: 1, kind: "MISS" },
  ];
  const games = [{ gameId: 2024020001, penaltyShots: shots }];
  const result = verifySeasonPenaltyShots(20242025, rows, games);
  assert.equal(result.attempts, 2);
  assert.equal(result.goals, 1);
  assert.throws(
    () =>
      verifySeasonPenaltyShots(20242025, rows, [
        { ...games[0]!, penaltyShots: shots.slice(0, 1) },
      ]),
    /totals differ/,
  );
  assert.throws(
    () =>
      verifySeasonPenaltyShots(20242025, rows, [
        {
          ...games[0]!,
          penaltyShots: shots.map((s) => ({ ...s, shooter: 2 })),
        },
      ]),
    /totals differ/,
  );
  assert.throws(
    () => verifySeasonPenaltyShots(20242025, rows, [...games, ...games]),
    /audit event/,
  );
  assert.throws(
    () => verifySeasonPenaltyShots(20242025, [...rows, ...rows], games),
    /official/,
  );
});
function fixture() {
  const sourceText = JSON.stringify({
    nhl: {
      season: 20242025,
      gameType: 2,
      profile: "core",
      fetchedAt: "2026-01-01T00:00:00Z",
      skaters: {
        summary: [
          {
            playerId: 1,
            seasonId: 20242025,
            skaterFullName: "Player",
            teamAbbrevs: "TOR",
            positionCode: "C",
            gamesPlayed: 1,
          },
        ],
        timeonice: [{ playerId: 1, seasonId: 20242025, timeOnIce: 600 }],
        scoringRates: [],
        goalsForAgainst: [],
        powerplay: [],
        penaltykill: [],
      },
      goalies: [],
      edge: {},
      warnings: [],
    },
  });
  const priorText = "{}";
  const audit = {
    season: 20242025,
    officialGames: 1,
    loadedGames: 1,
    failed: [],
    gameSourceHashes: [{ gameId: 2024020001, sha256: "a".repeat(64) }],
    games: [{ gameId: 2024020001, eligible: true }],
  };
  const report = {
    version: NHL_ADJUSTED_IMPACT_CONFIG.version,
    config: NHL_ADJUSTED_IMPACT_CONFIG,
    season: 20242025,
    gameType: 2,
    sourceHash: hash(sourceText),
    priorHash: hash(priorText),
    gameSourcesHash: hash(JSON.stringify(audit.gameSourceHashes)),
    completeSourceScope: true,
    probabilitySource: "nhl",
    referenceReconciliation: { matches: true },
    inclusion: { includedGames: 1, fullyVerifiedGames: 1 },
    qualityGate: {
      passes: true,
      gates: Object.fromEntries(
        [
          "officialSeasonExposureMatches",
          "completeDownload",
          "atLeast95PercentGamesVerified",
          "impactModelsConverged",
          "shotModelsConverged",
          "atLeast100HeldOutGames",
          "heldOutSituationCoverage",
          "improvesHeldOutXg",
          "improvesHeldOutGoals",
          "shotModelBeatsConstant",
          "shotGoalTotalWithin10Percent",
        ].map((g) => [g, true]),
      ),
    },
    ratings: [
      {
        playerId: 1,
        name: "Player",
        position: "F",
        status: "provisional",
        games: 1,
        minutes: 10,
        includedGames: 1,
        verifiedGames: 1,
        modeledMinutes: 10,
        coverage: 1,
        componentCoverage: {
          officialMinutes: 1,
          processMinutes: 1,
          individualShots: 1,
          missingGoals: 0,
        },
        seasonValue: -0.1,
        observedValue: -0.2,
        abilityPer60: -0.05,
        seasonRank: null,
        abilityRank: null,
        seasonRating: null,
        components: {
          adjustedProcess: -0.1,
          observedProcess: -0.2,
          finishing: 0,
          saving: 0,
          penalties: 0,
        },
        situations: {},
        samplingInterval: null,
        warnings: [],
      },
    ],
  };
  const input = () => ({
    season: 20242025,
    sourceText,
    priorText,
    reportText: JSON.stringify(report),
    auditText: JSON.stringify(audit),
  });
  return { input, report, audit };
}
test("publication retains signed ability separately from legacy display percentile and hashes exact artifacts", () => {
  const { input } = fixture();
  const result = prepareGameValuePublication(input());
  assert.equal(result.results[0]?.impactPer60, null);
  assert.equal(result.results[0]?.gameValue.abilityPer60, -0.05);
  assert.equal(result.results[0]?.team, "TOR");
  assert.equal(result.results[0]?.status, "provisional");
  assert.match(result.metadata.sourceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(prepareGameValuePublication(input()), result);
});
test("publication rejects failed gates, changed provenance and missing player or game exposure", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.report.qualityGate.gates.improvesHeldOutGoals = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.report.sourceHash = "b".repeat(64);
    },
    (f: ReturnType<typeof fixture>) => {
      f.audit.loadedGames = 0;
    },
    (f: ReturnType<typeof fixture>) => {
      f.report.ratings = [];
    },
    (f: ReturnType<typeof fixture>) => {
      f.report.ratings[0]!.includedGames = 0;
    },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => prepareGameValuePublication(f.input()));
  }
});

test("component admission recomputes source evidence instead of trusting report coverage claims", () => {
  const f = fixture();
  const games = f.audit.games.map((g) => ({
    ...g,
    eligible: false,
    gameSeconds: 3600,
    usableProcessSeconds: 3570,
    officialShots: 80,
    verifiedShotCount: 80,
  }));
  f.audit.games = games;
  f.report.inclusion.fullyVerifiedGames = 0;
  f.report.qualityGate = applySourceCoveragePolicy(f.report.qualityGate, games);
  assert.equal(prepareGameValuePublication(f.input()).results.length, 1);
  games[0]!.usableProcessSeconds = 3000;
  assert.throws(
    () => prepareGameValuePublication(f.input()),
    /component coverage/,
  );
});
