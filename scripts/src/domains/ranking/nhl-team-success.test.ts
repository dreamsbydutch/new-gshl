import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateTeamValue,
  aggregateTeamValue,
  withinSeasonAssociation,
  fitSeriesProbability,
  seriesBacktest,
  seasonBootstrap,
  pairedSeriesBootstrap,
  analyzeTeamSuccess,
  incrementalSeriesBacktest,
  type TeamResult,
} from "./nhl-team-success";
import { rankGameSeason } from "../../runtime/nhl-game-season-value";
import { fitAdjustedImpact } from "../../runtime/nhl-adjusted-impact";
import { gameFixture } from "../nhl/game-value-fixtures";
import { buildGameValueData } from "../nhl/game-value-input";

function player() {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  return rankGameSeason([g], fitAdjustedImpact([g], 4), [
    { playerId: 1, name: "Player", position: "F", minutes: 20, games: 1 },
  ]).ratings[0]!;
}
function team(teamId: number): TeamResult {
  return {
    season: 20242025,
    teamId,
    name: "Team",
    games: 82,
    wins: 40,
    losses: 30,
    otLosses: 12,
    points: 92,
    regulationWins: 35,
    goalsFor: 240,
    goalsAgainst: 230,
    playoffGames: 6,
    playoffWins: 2,
    playoffLosses: 4,
  };
}
test("traded value is conserved across teams and normalized by team games", () => {
  const p = {
    ...player(),
    minutes: 1000,
    games: 60,
    seasonValue: 20,
    abilityPer60: 0.6,
  };
  const a = allocateTeamValue(20242025, 1, p, 250, 15, 4, 6),
    b = allocateTeamValue(20242025, 2, p, 750, 45, 4, 6);
  assert.equal(a.value + b.value, 20);
  assert.equal(a.ability! + b.ability!, 10);
  assert.equal(a.offense + b.offense, 4);
  assert.equal(a.defense + b.defense, 6);
  assert.equal(aggregateTeamValue(team(1), [a]).rating, 5 / 82);
  assert.equal(
    aggregateTeamValue(
      {
        ...team(2),
        games: 56,
        wins: 28,
        losses: 20,
        otLosses: 8,
        points: 64,
        regulationWins: 24,
      },
      [b],
    ).rating,
    15 / 56,
  );
  assert.throws(() => aggregateTeamValue(team(1), [a, a]), /Duplicate/);
  assert.throws(() => aggregateTeamValue(team(1), [b]), /scope/);
  assert.throws(
    () => allocateTeamValue(20242025, 1, p, 1001, 60, 4, 6),
    /Invalid/,
  );
});
test("analysis keeps failed-gate seasons out of primary results and omits unfinished playoffs", () => {
  const teams = [2013, 2014, 2015, 2016].flatMap((season) =>
    [1, 2, 3, 4].map((teamId) => {
      const base = aggregateTeamValue({ ...team(teamId), season }, []);
      return {
        ...base,
        rating: teamId,
        pointsPct: teamId / 5,
        performance: 50,
        playoffEntry: 1,
      };
    }),
  );
  const result = analyzeTeamSuccess(
    teams,
    [2013, 2014, 2015].map((season) => ({
      season,
      round: 4,
      top: 1,
      bottom: 2,
      winner: 2,
    })),
    [2014],
  );
  assert.equal(
    result.regular.find(
      (r) => r.metric === "rating" && r.outcome === "pointsPct",
    )!.n,
    12,
  );
  assert.equal(result.perSeason.length, 4);
  assert.deepEqual(result.incompletePostseasons, [2016]);
  assert.equal(result.comparisons.find((r) => r.metric === "rating")!.n, 2);
});
test("incremental model also freezes before future outcomes", () => {
  const rows = Array.from({ length: 7 }, (_, season) =>
    [1, -1].map((difference) => ({
      season,
      round: 1,
      difference,
      baseline: difference * 0.1,
      won: difference > 0,
    })),
  ).flat();
  const a = incrementalSeriesBacktest(rows),
    b = incrementalSeriesBacktest(
      rows.map((r) => (r.season === 6 ? { ...r, won: !r.won } : r)),
    );
  assert.deepEqual(
    a.predictions.map((r) => r.probability),
    b.predictions.map((r) => r.probability),
  );
});
test("goalie contribution is retained and losses include overtime losses", () => {
  const p = {
    ...player(),
    position: "G" as const,
    seasonValue: -3,
    abilityPer60: -1,
  };
  const r = aggregateTeamValue(team(1), [
    allocateTeamValue(20242025, 1, p, 20, 1, 0, 0),
  ]);
  assert.equal(r.skaterValue, 0);
  assert.equal(r.goalieValue, -3 / 82);
  assert.equal(r.rating, -3 / 82);
  assert.equal(r.lossPct, 42 / 82);
  assert.equal(r.pointsPct, 92 / 164);
});
test("zero-shot emergency goalies retain season value without inventing ability", () => {
  const p = {
    ...player(),
    position: "G" as const,
    seasonValue: 0,
    abilityPer60: null,
  };
  const part = allocateTeamValue(20242025, 1, p, 20, 1, 0, 0);
  assert.equal(part.value, 0);
  assert.equal(part.ability, null);
  const total = aggregateTeamValue(team(1), [part]);
  assert.equal(total.rating, 0);
  assert.equal(total.ability, null);
  assert.equal(total.minutes, 20);
});
test("within-season tests remove era offsets and retain inverse associations", () => {
  const rows = [
    { season: 1, x: 1, y: 3 },
    { season: 1, x: 2, y: 2 },
    { season: 1, x: 3, y: 1 },
    { season: 2, x: 101, y: 1003 },
    { season: 2, x: 102, y: 1002 },
    { season: 2, x: 103, y: 1001 },
  ];
  assert.equal(withinSeasonAssociation(rows).pearson, -1);
  assert.equal(withinSeasonAssociation(rows).spearman, -1);
});
test("series model is symmetric and future outcomes cannot change earlier predictions", () => {
  const predict = fitSeriesProbability([
    { difference: 1, won: true },
    { difference: -1, won: false },
  ]);
  assert.ok(predict(1) > 0.5);
  assert.ok(Math.abs(predict(1) + predict(-1) - 1) < 1e-12);
  const rows = Array.from({ length: 6 }, (_, i) => [
    { season: 2013 + i, round: 1, difference: 1, won: true },
    { season: 2013 + i, round: 2, difference: -1, won: false },
  ]).flat();
  const a = seriesBacktest(rows),
    b = seriesBacktest(
      rows.map((r) => (r.season === 2018 ? { ...r, won: !r.won } : r)),
    );
  assert.equal(a.n, 6);
  assert.deepEqual(
    a.predictions.map((r) => r.probability),
    b.predictions.map((r) => r.probability),
  );
  assert.equal(a.predictions[0]!.season, 2016);
});
test("season-cluster uncertainty is deterministic and paired forecast deltas reconcile", () => {
  const rows = Array.from({ length: 4 }, (_, season) =>
    [0, 1, 2].map((x) => ({ season, x, y: x })),
  ).flat();
  assert.deepEqual(seasonBootstrap(rows, 50), seasonBootstrap(rows, 50));
  assert.equal(seasonBootstrap(rows, 50)!.low, 1);
  const forecasts = seriesBacktest(
    Array.from({ length: 7 }, (_, season) => ({
      season,
      round: 1,
      difference: 1,
      won: true,
    })),
  ).predictions;
  assert.equal(pairedSeriesBootstrap(forecasts, forecasts, 50)!.high, 0);
});
