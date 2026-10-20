import assert from "node:assert/strict";
import test from "node:test";
import { gameFixture } from "../nhl/game-value-fixtures";
import { buildGameValueData } from "../nhl/game-value-input";
import { valuePenaltyEvents } from "../../runtime/nhl-game-season-value";

const rates = {
  "5v5:GG": 3,
  "4v5:GG": 1,
  "5v4:GG": 7,
  "3v5:GG": 0.5,
  "5v3:GG": 12,
};

test("late regulation carryover remains unknown rather than pricing a full penalty", () => {
  const f = gameFixture();
  const penalty = f.sources.pbp.plays.find((p) => p.eventId === 4)!;
  penalty.periodDescriptor.number = 3;
  penalty.timeInPeriod = "19:30";
  const game = buildGameValueData(f.sources, f.shots);
  const event = game.penalties.find((p) => p.eventId === 4)!;
  assert.equal(event.regulationSecondsRemaining, 30);
  game.penalties = [event];
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, [4]);
  assert.deepEqual(valuePenaltyEvents(game, rates).entries, []);
  // At a tied regulation horn there may still be overtime exposure.
  event.regulationSecondsRemaining = 0;
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, [4]);
  // A complete minor that fits before the horn remains supported.
  event.regulationSecondsRemaining = 120;
  assert.deepEqual(valuePenaltyEvents(game, rates).unpriced, []);
});

test("playoff overtime penalties end on either goal without adding an opposing skater", () => {
  const f = gameFixture();
  f.sources.pbp.id = f.sources.box.id = 2024030999;
  for (const shift of f.sources.shifts) shift.gameId = 2024030999;
  const penalty = f.sources.pbp.plays.find((p) => p.eventId === 4)!;
  penalty.periodDescriptor = { number: 4, periodType: "OT" };
  const game = buildGameValueData(f.sources, []);
  const event = game.penalties.find((p) => p.eventId === 4)!;
  assert.equal(event.regularSeasonOvertime, false);
  assert.equal(event.suddenDeathOvertime, true);
  assert.equal(event.remainingSeconds, null);
  const scoring = { "5v5:GG": 6, "4v5:GG": 6, "5v4:GG": 12 };
  for (const minutes of [2, 5]) {
    game.penalties = [
      { ...event, minutes, kind: minutes === 5 ? "major" : "minor" },
    ];
    const result = valuePenaltyEvents(game, scoring);
    const exposure = -Math.expm1(-0.3 * minutes) / 0.3;
    assert.deepEqual(result.unpriced, []);
    assert.ok(Math.abs(result.entries[0]!.value + 0.1 * exposure) < 1e-12);
  }
});

test("simultaneous same-side penalties remain unknown regardless of source ordering", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = game.penalties[0]!;
  const second = { ...first, eventId: 99, committed: 3, drawn: 12 };
  for (const penalties of [
    [first, second],
    [second, first],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    const result = valuePenaltyEvents(game, rates);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(
      [...result.unpriced].sort((a, b) => a - b),
      [4, 99],
    );
    assert.deepEqual(game, before);
  }
});

test("offset penalties leave a single attributable residual regardless of event order", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const reciprocal = game.penalties[0]!;
  const opposite = game.penalties[1]!;
  const residual = { ...reciprocal, eventId: 99, committed: 3, drawn: 12 };
  for (const penalties of [
    [reciprocal, residual, opposite],
    [residual, opposite, reciprocal],
    [opposite, reciprocal, residual],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    const result = valuePenaltyEvents(game, rates);
    assert.deepEqual(result.unpriced, []);
    assert.equal(result.coincidentalMinutes, 4);
    assert.deepEqual(
      result.entries.map((entry) => entry.playerId),
      [3, 12],
    );
    assert.equal(result.entries[0]!.eventId, 99);
    assert.ok(result.entries[0]!.value < 0);
    assert.equal(result.entries[1]!.value, -result.entries[0]!.value);
    assert.deepEqual(game, before);
  }
});

test("postgame assessments do not make a single live penalty ambiguous", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = game.penalties[0]!;
  game.penalties = [first];
  const expected = valuePenaltyEvents(game, rates);
  for (const committed of [first.committed, 3]) {
    const postgame = { ...first, eventId: 99, committed, remainingSeconds: 0 };
    for (const penalties of [
      [first, postgame],
      [postgame, first],
    ]) {
      game.penalties = penalties;
      assert.deepEqual(valuePenaltyEvents(game, rates), expected);
    }
  }
});

test("ambiguous offset assignments never pick a residual offender from source order", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = { ...game.penalties[0]!, drawn: null };
  const second = { ...first, eventId: 99, committed: 3 };
  const opposite = { ...game.penalties[1]!, drawn: null };
  for (const penalties of [
    [first, second, opposite],
    [second, first, opposite],
    [opposite, second, first],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    const result = valuePenaltyEvents(game, rates);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(
      [...result.unpriced].sort((a, b) => a - b),
      [4, 99],
    );
    assert.equal(result.coincidentalMinutes, 4);
    assert.deepEqual(game, before);
  }
});

test("equal aggregate sanctions cancel without inventing participant matching", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = { ...game.penalties[0]!, drawn: null };
  const second = { ...first, eventId: 99, committed: 3 };
  const opposite = { ...game.penalties[1]!, drawn: null };
  const fourth = { ...opposite, eventId: 100, committed: 12 };
  for (const penalties of [
    [first, second, opposite, fourth],
    [fourth, opposite, second, first],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    assert.deepEqual(valuePenaltyEvents(game, rates), {
      entries: [],
      unpriced: [],
      coincidentalMinutes: 8,
    });
    assert.deepEqual(game, before);
  }
});

test("double minors respect finite clocks across both serial portions", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = game.penalties[0]!;
  const penaltyRates = { "5v5:GG": 3, "4v5:GG": 6, "5v4:GG": 12 };
  for (const [minutes, expectedExposure] of [
    [0.5, 0.49920711062242445],
    [2, 1.9561594475723278],
    [3, 2.7479879035495802],
    [4, 3.2967995396436067],
  ]) {
    game.penalties = [
      {
        ...first,
        kind: "double-minor",
        minutes: 4,
        remainingSeconds: minutes! * 60,
      },
    ];
    const result = valuePenaltyEvents(game, penaltyRates);
    assert.deepEqual(result.unpriced, []);
    const exposure = -result.entries[0]!.value * 10;
    assert.ok(Math.abs(exposure - expectedExposure!) < 1e-12);
    assert.ok(exposure <= minutes!);
  }
});

test("zero scoring hazard cannot extend a double minor beyond its scheduled horizon", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = game.penalties[0]!;
  const penaltyRates = { "5v5:GG": 3, "4v5:GG": 0, "5v4:GG": 0 };
  for (const minutes of [0.5, 2, 3, 4, 5]) {
    game.penalties = [
      {
        ...first,
        kind: "double-minor",
        minutes: 4,
        remainingSeconds: minutes * 60,
      },
    ];
    const result = valuePenaltyEvents(game, penaltyRates);
    assert.deepEqual(result.unpriced, []);
    assert.ok(result.entries.every((entry) => entry.value === 0));
  }
});

test("opposing major and minor clocks remain unpriced in either source order", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const major = { ...game.penalties[0]!, kind: "major" as const, minutes: 5 };
  const minor = game.penalties[1]!;
  for (const penalties of [
    [major, minor],
    [minor, major],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    const result = valuePenaltyEvents(game, rates);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(
      [...result.unpriced].sort((a, b) => a - b),
      [4, 5],
    );
    assert.deepEqual(game, before);
  }
});

test("ambiguous minor offsets prevent pricing a surviving major in isolation", () => {
  const f = gameFixture();
  const game = buildGameValueData(f.sources, f.shots);
  const first = { ...game.penalties[0]!, drawn: null };
  const second = { ...first, eventId: 99, committed: 3 };
  const opposite = { ...game.penalties[1]!, drawn: null };
  const major = {
    ...opposite,
    eventId: 100,
    committed: 12,
    kind: "major" as const,
    minutes: 5,
  };
  for (const penalties of [
    [first, second, opposite, major],
    [major, opposite, second, first],
  ]) {
    game.penalties = penalties;
    const before = structuredClone(game);
    const result = valuePenaltyEvents(game, rates);
    assert.deepEqual(result.entries, []);
    assert.deepEqual(
      [...result.unpriced].sort((a, b) => a - b),
      [4, 99, 100],
    );
    assert.deepEqual(game, before);
  }
});
