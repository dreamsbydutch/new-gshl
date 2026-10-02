import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGameValueData,
  type GameValueData,
} from "../nhl/game-value-input";
import { gameFixture, penaltyShotFixture } from "../nhl/game-value-fixtures";
import {
  valuePenaltyEvents,
  rankGameSeason,
} from "../../runtime/nhl-game-season-value";
import {
  fitAdjustedImpact,
  chronologicalImpact,
  evaluateImpact,
  evaluateImpactComponents,
} from "../../runtime/nhl-adjusted-impact";
import { impactBreakdown } from "../../runtime/nhl-impact-breakdown";
import {
  chronologicalShotQuality,
  predictShotQuality,
  fitPenaltyShotBaseline,
  type ShotTrainingRow,
} from "../../runtime/nhl-shot-quality";

test("penalty-shot baseline uses only prior seasons and rejects duplicate or impossible observations", () => {
  const history = {
    fromSeason: 20192020,
    beforeSeason: 20242025,
    gameType: 2,
    rows: [
      {
        seasonId: 20232024,
        playerId: 1,
        penaltyShotAttempts: 100,
        penaltyShotsGoals: 30,
      },
    ],
  };
  assert.equal(fitPenaltyShotBaseline(history).probability, 30.5 / 101);
  assert.throws(
    () =>
      fitPenaltyShotBaseline({
        ...history,
        rows: [{ ...history.rows[0]!, seasonId: 20242025 }],
      }),
    /future/,
  );
  assert.throws(
    () =>
      fitPenaltyShotBaseline({
        ...history,
        rows: [...history.rows, ...history.rows],
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      fitPenaltyShotBaseline({
        ...history,
        rows: [{ ...history.rows[0]!, penaltyShotsGoals: 101 }],
      }),
    /Invalid/,
  );
});

test("penalty-shot finishing, saving and earned/conceded chances balance without lineup credit", () => {
  const f = penaltyShotFixture(),
    g = buildGameValueData(f.sources, f.shots, undefined, 0.3);
  const model = fitAdjustedImpact([g], 4);
  const refs = g.players.map((p) => ({
    playerId: p.id,
    name: p.name,
    position: p.position,
    minutes: 20,
    games: 1,
  }));
  const ratings = rankGameSeason([g], model, refs).ratings;
  const value = (id: number) => ratings.find((p) => p.playerId === id)!;
  assert.equal(value(1).components.finishing, 0.7);
  assert.equal(value(2).components.penalties, 0.3);
  assert.equal(value(11).components.penalties, -0.3);
  assert.equal(value(16).components.saving, -0.7);
  assert.ok(Math.abs(ratings.reduce((n, p) => n + p.seasonValue!, 0)) < 1e-12);
  assert.ok(ratings.every((p) => p.components.adjustedProcess === 0));
  assert.ok(
    Math.abs(evaluateImpact(model, [g]).goalDifferentialMse! - 0.49) < 1e-12,
  );
});

test("partially reconciled games retain individual value, safe process minutes and official rate denominators", () => {
  const f = gameFixture(),
    complete = buildGameValueData(f.sources, f.shots);
  const model = fitAdjustedImpact([complete], 4);
  f.sources.pbp.plays.find((p) => p.eventId === 6)!.situationCode = "1451";
  const g = buildGameValueData(f.sources, f.shots);
  const rating = rankGameSeason([g], model, [
    { playerId: 1, name: "Shooter", position: "F", minutes: 20, games: 1 },
  ]).ratings[0]!;
  assert.equal(rating.includedGames, 1);
  assert.equal(rating.verifiedGames, 0);
  assert.equal(rating.componentCoverage.officialMinutes, 1);
  assert.equal(rating.componentCoverage.individualShots, 1);
  assert.equal(rating.components.finishing, 0.6);
  assert.notEqual(rating.seasonValue, null);
  assert.equal(rating.modeledMinutes, 19.3333);
  for (const s of g.stints) s.usableForProcess = false;
  const limited = rankGameSeason([g], model, [
    { playerId: 1, name: "Shooter", position: "F", minutes: 20, games: 1 },
  ]).ratings[0]!;
  assert.equal(limited.status, "provisional");
  assert.equal(limited.seasonValue, 0.6);
  assert.notEqual(limited.abilityPer60, null);
});

test("coincidental penalties cancel, majors do not end on goals, and bench penalties do not blame a server", () => {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots);
  const rates = { "5v5:GG": 3, "4v5:GG": 1, "5v4:GG": 7 };
  assert.equal(valuePenaltyEvents(game, rates).entries.length, 0);
  const p = {
    ...game.penalties[0]!,
    second: 100,
    eventId: 9,
    kind: "major" as const,
    minutes: 5,
  };
  game.penalties = [p];
  const major = valuePenaltyEvents(game, rates);
  assert.equal(major.entries.find((e) => e.playerId === 2)!.value, -0.5);
  game.penalties = [{ ...p, kind: "double-minor", minutes: 4 }];
  const double = valuePenaltyEvents(game, rates);
  assert.ok(Math.abs(double.entries[0]!.value) < 0.4);
  game.penalties = [{ ...p, kind: "minor", minutes: 2, committed: null }];
  assert.equal(valuePenaltyEvents(game, rates).entries.length, 1);
  game.penalties = [p, { ...p, eventId: 10, committed: 3 }];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, [10]);
  const supported = valuePenaltyEvents(game, {
    ...rates,
    "3v5:GG": 0.2,
    "5v3:GG": 12,
  });
  assert.deepEqual(supported.unpriced, []);
  assert.ok(
    Math.abs(
      supported.entries.find((e) => e.playerId === 3)!.value + 5.8 / 12,
    ) < 1e-9,
  );
});

test("overtime penalties add an opponent, respect the remaining clock and end on either goal", () => {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots);
  const p = {
    ...game.penalties[0]!,
    homeBefore: 3,
    awayBefore: 3,
    regularSeasonOvertime: true,
    remainingSeconds: 30,
  };
  game.penalties = [p];
  const rates = {
    "3v3:GG": 4,
    "3v4:GG": 1,
    "4v3:GG": 7,
    "3v5:GG": 0.5,
    "5v3:GG": 12,
  };
  const result = valuePenaltyEvents(game, rates);
  assert.deepEqual(result.unpriced, []);
  assert.ok(
    Math.abs(
      result.entries[0]!.value +
        ((6 / 60) * -Math.expm1((-8 / 60) * 0.5)) / (8 / 60),
    ) < 1e-12,
  );
  game.penalties = [{ ...p, remainingSeconds: 0 }];
  assert.equal(valuePenaltyEvents(game, rates).entries.length, 0);
  game.penalties = [p, { ...p, eventId: 99, committed: 3 }];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, []);
  game.penalties = [{ ...p, regularSeasonOvertime: false }];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, [p.eventId]);
});

test("same-whistle updated manpower is not assessed twice and missing context stays unpriced", () => {
  const f = gameFixture(),
    game = buildGameValueData(f.sources, f.shots);
  const p = game.penalties[0]!;
  const rates = {
    "5v5:GG": 3,
    "4v5:GG": 1,
    "5v4:GG": 7,
    "3v5:GG": 0.5,
    "5v3:GG": 12,
  };
  game.penalties = [p, { ...p, eventId: 99, committed: 3, homeBefore: 4 }];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, []);
  game.penalties = [{ ...p, homeBefore: null }];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, [p.eventId]);
  assert.deepEqual(valuePenaltyEvents(game, rates).entries, []);
});

test("reciprocal penalties offset first and sequential assessments do not invent a two-player disadvantage", () => {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  const p = g.penalties[0]!,
    away = g.penalties[1]!;
  const rates = {
    "5v5:GG": 3,
    "4v5:GG": 1,
    "5v4:GG": 7,
    "3v5:GG": 0.5,
    "5v3:GG": 12,
  };
  g.penalties = [{ ...p, drawn: 12 }, { ...p, eventId: 99 }, away];
  const result = valuePenaltyEvents(g, rates);
  assert.deepEqual(result.unpriced, []);
  assert.equal(result.entries.find((e) => e.value > 0)!.playerId, 12);
  g.penalties = [p, { ...p, eventId: 99 }];
  assert.deepEqual(valuePenaltyEvents(g, rates).unpriced, [p.eventId, 99]);
  assert.equal(valuePenaltyEvents(g, rates).entries.length, 0);
});

function population(): GameValueData[] {
  const f = gameFixture(),
    base = buildGameValueData(f.sources, f.shots);
  return Array.from({ length: 30 }, (_, i) => {
    const g = structuredClone(base);
    g.gameId += i;
    g.date = `2025-01-${String(i + 1).padStart(2, "0")}`;
    g.stints = [
      {
        ...g.stints[0]!,
        gameId: g.gameId,
        date: g.date,
        seconds: 3600,
        home: i % 2 ? [1, 3, 4] : [2, 3, 5],
        away: i % 3 ? [11, 13, 14] : [12, 13, 15],
        homeXg: i % 2 ? 4 : 2,
        awayXg: 2.5,
        score: 0,
      },
    ];
    return g;
  });
}
test("equal offensive creation and defensive prevention receive equal season and ability credit", () => {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  g.shots = [];
  g.penalties = [];
  const model = fitAdjustedImpact([g], 4);
  model.coefficients = { "O:EV:1": 0.6, "D:EV:4": -0.6 };
  const result = rankGameSeason([g], model, [
    { playerId: 1, name: "Offense", position: "F", minutes: 20, games: 1 },
    { playerId: 4, name: "Defense", position: "D", minutes: 20, games: 1 },
  ]);
  const [offense, defense] = [1, 4].map(
    (id) => result.ratings.find((p) => p.playerId === id)!,
  );
  assert.equal(offense!.seasonValue, 0.2);
  assert.equal(defense!.seasonValue, offense!.seasonValue);
  assert.equal(defense!.abilityPer60, offense!.abilityPer60);
  assert.equal(offense!.components.offensiveProcess, 0.2);
  assert.equal(defense!.components.defensiveProcess, 0.2);
});

test("breakdown uses each side's actual strength exposure and reconciles without inflating defense", () => {
  const result = impactBreakdown(
    {
      coefficients: {
        "O:EV:1": 1,
        "D:EV:1": -2,
        "O:PP:1": 3,
        "D:SH:1": -4,
        "D:EN:1": 2,
      },
    },
    1,
    { "5v5:GG": 60, "5v4:GG": 30, "4v5:GG": 15, "6v5:EG": 6 },
  );
  assert.equal(result.offense, 2.5);
  assert.equal(result.defense, 2.8);
  assert.equal(result.total, 5.3);
  assert.equal(result.byStrength.SH!.defense, 1);
  assert.throws(() => impactBreakdown({ coefficients: {} }, 1, { bogus: 10 }));
  assert.throws(() =>
    impactBreakdown({ coefficients: {} }, 1, { "5v5:GG": -1 }),
  );
});

test("validation exposes scoring errors that cancel in the goal differential", () => {
  const games = population().slice(0, 1);
  const g = games[0]!,
    s = g.stints[0]!;
  s.situation = "3v3:GG";
  s.homeXg = s.awayXg = 2;
  g.homeGoals = g.awayGoals = 2;
  g.shots = [];
  const model = fitAdjustedImpact(games, 4);
  model.coefficients = { "B:3v3:GG": 5 };
  const result = evaluateImpact(model, games);
  assert.equal(result.xgDifferentialMse, 0);
  assert.equal(result.teamXgMse, 9);
  assert.equal(result.teamGoalMse, 9);
  model.coefficients = { "B:3v3:GG": 5, "D:EV:2": -3, "D:EV:12": -3 };
  const audit = evaluateImpactComponents(model, games);
  assert.equal(audit.full.teamXgMse, 0);
  assert.equal(audit.withoutDefense.teamXgMse, 9);
  assert.equal(audit.withoutOffense.teamXgMse, 0);
});

test("ridge gives matched offensive and defensive signals the same magnitude of credit", () => {
  const offensive = population(),
    defensive = structuredClone(offensive);
  for (let i = 0; i < offensive.length; i++) {
    const o = offensive[i]!.stints[0]!,
      d = defensive[i]!.stints[0]!;
    // Same design and sample: a one-goal increase for becomes a one-goal reduction against.
    o.situation = d.situation = "3v3:GG";
    o.homeXg = i % 2 ? 4 : 2;
    o.awayXg = 3;
    d.homeXg = 3;
    d.awayXg = i % 2 ? 2 : 4;
  }
  const a = fitAdjustedImpact(offensive, 4),
    b = fitAdjustedImpact(defensive, 4);
  const offenseContrast = a.coefficients["O:EV:1"]! - a.coefficients["O:EV:2"]!;
  const defenseContrast = -(
    b.coefficients["D:EV:1"]! - b.coefficients["D:EV:2"]!
  );
  assert.ok(offenseContrast > 0);
  assert.ok(Math.abs(offenseContrast - defenseContrast) < 1e-6);
});
test("ridge separates changing lineups, stays finite and is deterministic", () => {
  const games = population();
  const model = fitAdjustedImpact(games, 4);
  assert.equal(model.converged, true);
  assert.ok(model.coefficients["O:EV:1"]! > model.coefficients["O:EV:2"]!);
  assert.ok(Math.abs(model.coefficients["O:EV:1"]! - 15 / 34) < 1e-5);
  assert.ok(Math.abs(model.coefficients["O:EV:2"]! + 15 / 34) < 1e-5);
  assert.deepEqual(fitAdjustedImpact(games, 4), model);
});

test("splitting an unchanged lineup into shorter intervals preserves adjusted coefficients", () => {
  const games = population(),
    split = structuredClone(games);
  for (const g of split)
    g.stints = g.stints.flatMap((s) =>
      Array.from({ length: 3 }, () => ({
        ...s,
        seconds: s.seconds / 3,
        homeXg: s.homeXg / 3,
        awayXg: s.awayXg / 3,
      })),
    );
  const a = fitAdjustedImpact(games, 4),
    b = fitAdjustedImpact(split, 4);
  for (const key of Object.keys(a.coefficients))
    assert.ok(Math.abs(a.coefficients[key]! - b.coefficients[key]!) < 1e-9);
  assert.equal(b.sourceRows, a.sourceRows * 3);
});
test("held-out game outcomes cannot select the ridge penalty", () => {
  const games = population();
  const before = chronologicalImpact(games);
  for (const g of games.filter(
    (g) => g.date >= before.evaluation.testDatesFrom,
  ))
    g.stints[0]!.homeXg += 100;
  const after = chronologicalImpact(games);
  assert.equal(
    after.evaluation.selectedLambda,
    before.evaluation.selectedLambda,
  );
  assert.deepEqual(after.evaluation.trials, before.evaluation.trials);
  assert.notEqual(
    after.evaluation.model.xgDifferentialMse,
    before.evaluation.model.xgDifferentialMse,
  );
});
test("shot model freezes before later validation/test outcomes and beats a constant on varied shot difficulty", () => {
  const rows: ShotTrainingRow[] = [];
  for (let day = 1; day <= 20; day++)
    for (let i = 0; i < 60; i++) {
      const distance = i < 30 ? 0.05 : 0.7;
      rows.push({
        gameId: day,
        date: `2025-01-${String(day).padStart(2, "0")}`,
        eventId: i,
        goal: i < 30 && i % 3 === 0 ? 1 : 0,
        features: [
          1,
          distance,
          distance * distance,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ],
      });
    }
  const before = chronologicalShotQuality(rows);
  assert.ok(before.evaluation.brier! < before.evaluation.baselineBrier!);
  for (const r of rows.filter((r) => r.date >= before.testFrom))
    r.goal = 1 - r.goal;
  assert.deepEqual(chronologicalShotQuality(rows).model, before.model);
  assert.ok(
    predictShotQuality(before.model, rows[0]!.features) >
      predictShotQuality(before.model, rows[59]!.features),
  );
});
test("season contribution retains observed finishing while ability is independently shrunk", () => {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  const model = fitAdjustedImpact([g], 4);
  const result = rankGameSeason([g], model, [
    { playerId: 1, name: "Player", position: "F", minutes: 20, games: 1 },
  ]);
  const p = result.ratings[0]!;
  assert.equal(p.status, "provisional");
  assert.equal(p.components.finishing, 0.6);
  assert.notEqual((p.seasonValue! * 60) / p.minutes, p.abilityPer60);
});

test("bootstrap rank ranges give tied players the same competition rank", () => {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  g.shots = [];
  for (const p of g.players) p.seconds = 12000;
  g.penalties = [];
  g.stints = [{ ...g.stints[0]!, seconds: 12000, homeXg: 0, awayXg: 0 }];
  const model = fitAdjustedImpact([g], 4);
  const result = rankGameSeason(
    [g],
    model,
    [1, 2].map((playerId) => ({
      playerId,
      name: String(playerId),
      position: "F",
      minutes: 200,
      games: 1,
    })),
  );
  for (const p of result.ratings) {
    assert.equal(p.seasonRank, 1);
    assert.equal(p.samplingInterval!.bestRank, 1);
    assert.equal(p.samplingInterval!.worstRank, 1);
  }
});

test("missing season exposure withholds ranks and zero-shot goalies have unknown ability", () => {
  const f = gameFixture(),
    g = buildGameValueData(f.sources, f.shots);
  const model = fitAdjustedImpact([g], 4);
  const incomplete = rankGameSeason([g], model, [
    { playerId: 1, name: "Player", position: "F", minutes: 100, games: 5 },
  ]).ratings[0]!;
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.seasonValue, null);
  assert.equal(incomplete.seasonRank, null);
  g.players.find((p) => p.id === 6)!.shotsAgainst = 0;
  const goalie = rankGameSeason([g], model, [
    { playerId: 6, name: "Goalie", position: "G", minutes: 20, games: 1 },
  ]).ratings[0]!;
  assert.equal(goalie.status, "provisional");
  assert.equal(goalie.abilityPer60, null);
});

test("a goalie scoring a goal is a valid shooter and retains season finishing value", () => {
  const f = gameFixture();
  f.sources.pbp.plays.find(
    (p) => p.typeDescKey === "goal",
  )!.details.scoringPlayerId = 6;
  f.shots[1]!.shooter = 6;
  const g = buildGameValueData(f.sources, f.shots);
  assert.equal(g.eligible, true);
  const model = fitAdjustedImpact([g], 4);
  const goalie = rankGameSeason([g], model, [
    {
      playerId: 6,
      name: "Goalie scorer",
      position: "G",
      minutes: 20,
      games: 1,
    },
  ]).ratings[0]!;
  assert.equal(goalie.components.finishing, 0.7);
  assert.equal(goalie.seasonValue, 0.7);
});
