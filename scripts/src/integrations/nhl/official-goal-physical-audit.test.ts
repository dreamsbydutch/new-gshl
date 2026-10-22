import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { gameFixture } from "../../domains/nhl/game-value-fixtures";
import type { NhlRatingSource } from "../../domains/nhl/season-rating-input";
import { HockeyDataCache, fetchGameSources } from "./game-value-source";
import { verifyOfficialGoalCoverageFromCache } from "./official-goal-physical-audit";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
test("fresh offline goal audit ignores producer counts, retains real deficits, and binds exact sources", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "goal-physical-audit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const f = gameFixture(),
    id = f.sources.pbp.id,
    cache = new HockeyDataCache(dir, true);
  const save = async (url: string, data: unknown) => {
    const body = JSON.stringify(data);
    await writeFile(join(dir, hash(url) + ".bin"), body);
    await writeFile(
      join(dir, hash(url) + ".json"),
      JSON.stringify({ url, sha256: hash(body) }),
    );
  };
  const url = `https://api-web.nhle.com/v1/gamecenter/${id}/play-by-play`;
  await save(url, f.sources.pbp);
  await save(
    "https://api.nhle.com/stats/rest/en/game?cayenneExp=season=20242025%20and%20gameType=2&limit=2000",
    {
      total: 1,
      data: [
        {
          id,
          season: 20242025,
          gameType: 2,
          gameStateId: 7,
          gameDate: "2025-01-01",
          homeTeamId: 1,
          visitingTeamId: 2,
        },
      ],
    },
  );
  await cache.saveDerived(`box-${id}`, f.sources.box, [url]);
  await cache.saveDerived(`shifts-${id}`, f.sources.shifts, [url]);
  const source: NhlRatingSource = {
    season: 20242025,
    gameType: 2,
    profile: "core",
    fetchedAt: "2025-01-01T00:00:00Z",
    skaters: {
      summary: [],
      timeonice: [],
      scoringRates: [],
      goalsForAgainst: [],
      powerplay: [],
      penaltykill: [],
    },
    goalies: [],
    edge: {},
    warnings: [],
  };
  for (const groups of Object.values(f.sources.box.playerByGameStats))
    for (const [group, players] of Object.entries(groups))
      for (const p of players) {
        const base = {
          seasonId: 20242025,
          playerId: p.playerId,
          gamesPlayed: 1,
        };
        if (group === "goalies")
          source.goalies.push({
            ...base,
            goalieFullName: p.name.default,
            timeOnIce: 1200,
            shotsAgainst: p.shotsAgainst,
            saves: (p.shotsAgainst ?? 0) - (p.goalsAgainst ?? 0),
          });
        else {
          source.skaters.summary.push({
            ...base,
            skaterFullName: p.name.default,
            positionCode: group === "defense" ? "D" : "C",
            goals: p.playerId === 1 ? 1 : p.playerId === 2 ? 1 : 0,
            shots: p.playerId === 1 ? 2 : p.playerId === 2 ? 1 : 0,
          });
          source.skaters.timeonice.push({ ...base, timeOnIce: 1200 });
        }
      }
  const sourceText = JSON.stringify({ nhl: source }),
    gameSourceHashes = [
      {
        gameId: id,
        sha256: hash(JSON.stringify(await fetchGameSources(cache, id))),
      },
    ];
  const input = {
    cacheDirectory: dir,
    sourceText,
    season: 20242025,
    gameType: 2 as const,
    expectedCanonicalSourceSha256: hash(sourceText),
    gameSourceHashes,
    expectedGameSourcesHash: hash(JSON.stringify(gameSourceHashes)),
    penaltyShotProbability: 0.3,
  };
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw Error("No network");
  });
  const before = await readdir(dir),
    proof = await verifyOfficialGoalCoverageFromCache(input);
  assert.equal(proof.goalCoverage.ledger.length, 1);
  assert.equal(proof.goalCoverage.missingGoals, 1);
  assert.deepEqual(
    proof.goalCoverage.players.find((p) => p.playerId === 2),
    { playerId: 2, officialGoals: 1, verifiedGoalCredits: 0, missingGoals: 1 },
  );
  assert.equal(requests, 0);
  assert.equal(proof.sourceCoverage.coverage.officialShots, 3);
  assert.equal(proof.sourceCoverage.coverage.verifiedShots, 2);
  assert.equal(
    proof.sourceCoverage.onGoalAccounting.absentOnGoalAttemptsLowerBound,
    1,
  );
  assert.equal(
    proof.sourceCoverage.sourceGates.atLeast98PercentIndividualShotsVerified,
    false,
  );
  const missingOnGoal = proof.onGoalCoverage.players.find(
    (p) => p.playerId === 2,
  )!;
  assert.equal(missingOnGoal.officialOnGoalAttempts, 1);
  assert.equal(missingOnGoal.observedExpectedOnGoal, 0);
  assert.equal(missingOnGoal.verifiedOnGoalAttempts, 0);
  assert.equal(missingOnGoal.missingOnGoalAttempts, 1);
  assert.equal(missingOnGoal.effectiveExpectedAttempts, 1);
  assert.equal(missingOnGoal.individualCoverage, 0);
  assert.equal(
    proof.onGoalCoverage.players.find((p) => p.playerId === 16)
      ?.officialOnGoalAttempts,
    2,
  );
  assert.deepEqual(await readdir(dir), before);
  await assert.rejects(
    () =>
      verifyOfficialGoalCoverageFromCache({
        ...input,
        expectedCanonicalSourceSha256: "a".repeat(64),
      }),
    /canonical/,
  );
  const changed = [{ gameId: id, sha256: "a".repeat(64) }];
  await assert.rejects(
    () =>
      verifyOfficialGoalCoverageFromCache({
        ...input,
        gameSourceHashes: changed,
        expectedGameSourcesHash: hash(JSON.stringify(changed)),
      }),
    /source changed/,
  );
  await assert.rejects(
    () =>
      verifyOfficialGoalCoverageFromCache({ ...input, gameSourceHashes: [] }),
    /bindings/,
  );
  const overcredited = structuredClone(source);
  overcredited.skaters.summary.find((p) => p.playerId === 1)!.shots = 1;
  const badText = JSON.stringify({ nhl: overcredited });
  await assert.rejects(
    () =>
      verifyOfficialGoalCoverageFromCache({
        ...input,
        sourceText: badText,
        expectedCanonicalSourceSha256: hash(badText),
      }),
    /on-goal credits exceed/,
  );
  assert.equal(requests, 0);
  assert.deepEqual(await readdir(dir), before);
});
